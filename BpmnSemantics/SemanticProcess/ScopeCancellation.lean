import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import BpmnSemantics.SemanticProcess.CallInstanceClosure
import BpmnSemantics.SemanticProcess.SequentialMultiInstance

/-! # Scope-subtree cancellation

This module owns classification and removal of every represented live runtime owner in one selected
scope-occurrence subtree, including transitively called Process instances, Activity-local effect
state, and Compensation parent-context records whose owning occurrences are removed. The
selected occurrence may be retained for immediate normal completion or removed for an interrupting
boundary route. Activation counters, Process variables, End history, and logical time are never
cancellation targets.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive SelectedScopeDisposition where
  | retain
  | remove
  deriving Repr, DecidableEq

def occurrenceParent? (occurrences : List RuntimeScopeOccurrence)
    (candidate : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  (occurrences.find? fun occurrence => decide (occurrence.id = candidate))
    |>.bind (·.parent)

def occurrenceInSubtreeWithin
    (occurrences : List RuntimeScopeOccurrence) (root candidate : ScopeOccurrenceId) :
    Nat → Bool
  | 0 => false
  | fuel + 1 =>
      if candidate = root then true
      else match occurrenceParent? occurrences candidate with
        | some parent => occurrenceInSubtreeWithin occurrences root parent fuel
        | none => false

/-- Whether one live occurrence is the selected scope occurrence or one of its descendants. -/
def occurrenceInSubtree (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) : Bool :=
  occurrenceInSubtreeWithin occurrences root candidate (occurrences.length + 1)

/-- Semantic Process-instance IDs transitively owned by calls whose callers lie in one cancelled scope subtree. -/
def calledInstanceClosure (state : RuntimeState)
    (root : ScopeOccurrenceId) : List SemanticId :=
  let direct := state.calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree state.scopeOccurrences root record.caller then
      some record.calledRoot.processInstanceId
    else none
  processInstanceClosureWithin state.calledProcessOccurrences direct
    (state.calledProcessOccurrences.length + 1)

private def effectOccurrenceId (wait : EffectWait) : EffectOccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def keepScopeOccurrence (disposition : SelectedScopeDisposition)
    (root : ScopeOccurrenceId) (cancelled : ScopeOccurrenceId → Bool)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match disposition with
  | .retain => occurrence.id = root || !cancelled occurrence.id
  | .remove => !cancelled occurrence.id

/-- Whether a hidden Compensation parent-context record's exact parent occurrence survives one regional cancellation. -/
def compensationParentContextRetentionSurvivesScopeCancellation
    (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition)
    (retention : CompensationParentContextRetention) : Bool :=
  let calledInstances := calledInstanceClosure state root
  let cancelled := fun owner =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      calledInstances.contains owner.processInstanceId
  match retention with
  | .provisional parent _ => keepScopeOccurrence disposition root cancelled parent
  | .promoted parent _ _ =>
      match parent.parent with
      | none => keepScopeOccurrence disposition root cancelled parent
      | some ownerRoot =>
          if ownerRoot = root then disposition == .retain
          else !cancelled ownerRoot

/-- Remove all represented live owners in the selected occurrence subtree while independently choosing whether the selected occurrence itself remains for a following completion step. -/
def cancelScopeSubtree (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) : RuntimeState :=
  let calledInstances := calledInstanceClosure state root
  let cancelled := fun owner =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      calledInstances.contains owner.processInstanceId
  let cancelledEffects := state.effectWaits.filter fun wait =>
    cancelled wait.owner
  let cancelledIncidents := state.effectIncidents.filter fun incident =>
    cancelled incident.wait.owner
  let cancelledTriggers := state.compensationTriggers.filter fun trigger =>
    cancelled trigger.owner
  -- A handler attached to an Activity is owned by the scope *holding* that Activity, so an
  -- owner-only rule leaves a bounded Sub-Process deadline alive after its child region is gone. The
  -- records name what each Activity owns, and the withdrawn ones carry their attached waits out.
  let withdrawnActivities := withdrawnByRegion cancelled state.activityOccurrences
  let withdrawnTimers := attachedTimersOf withdrawnActivities
  { state with
    tokens := state.tokens.filter fun token => !cancelled token.owner
    scopeOccurrences := state.scopeOccurrences.filter
      (keepScopeOccurrence disposition root cancelled)
    waits := state.waits.filter fun wait => !cancelled wait.owner
    messageWaits := state.messageWaits.filter fun wait =>
      !cancelled wait.owner && !activityRecordsAttachMessageWait withdrawnActivities wait
    timerWaits := state.timerWaits.filter fun wait =>
      !cancelled wait.owner && !anyTimerIdNamesWait withdrawnTimers wait
    activityOccurrences := retainedByRegion cancelled state.activityOccurrences
    sequentialMultiInstanceControllers :=
      state.sequentialMultiInstanceControllers.filter fun controller =>
        !calledInstances.contains controller.processInstanceId &&
          !(withdrawnActivities.any (controllerNamesActivityOccurrence controller))
    parallelMultiInstanceControllers :=
      state.parallelMultiInstanceControllers.filter fun controller =>
        !calledInstances.contains controller.id.processInstanceId &&
          !(withdrawnActivities.any fun activity =>
            parallelControllerNamesIdentity controller activity.processInstanceId
              ⟨activity.activityElementId.value⟩ activity.activation)
    effectWaits := state.effectWaits.filter fun wait => !cancelled wait.owner
    effectIncidents :=
      state.effectIncidents.filter fun incident => !cancelled incident.wait.owner
    selectedBranchSets :=
      state.selectedBranchSets.filter fun record => !cancelled record.owner
    eventRaces := state.eventRaces.filter fun race => !cancelled race.owner
    compensationActivityRetentions :=
      state.compensationActivityRetentions.filter fun retention => !cancelled retention.owner
    compensationParentContextRetentions :=
      state.compensationParentContextRetentions.filter
        (compensationParentContextRetentionSurvivesScopeCancellation
          state root disposition)
    compensationTriggers := state.compensationTriggers.filter fun trigger =>
      !cancelled trigger.owner
    compensationHandlerEffectWaits := state.compensationHandlerEffectWaits.filter fun wait =>
      !(cancelledTriggers.any fun trigger => trigger.id == wait.triggerId)
    calledProcessOccurrences :=
      state.calledProcessOccurrences.filter fun record =>
        !cancelled record.caller && !cancelled record.calledRoot
    variables :=
      { state.variables with
        activities := state.variables.activities.filter fun activity =>
          !calledInstances.contains activity.owner.processInstanceId &&
            !(withdrawnActivities.any fun record =>
              activityOccurrenceScopeMatches
                { processInstanceId := record.processInstanceId
                  activityElementId := ⟨record.activityElementId.value⟩
                  activation := record.activation } activity) &&
            !(cancelledEffects.any fun wait =>
              activityScopeMatches (effectOccurrenceId wait) activity) &&
            !(cancelledIncidents.any fun incident =>
              activityScopeMatches incident.id.effectId activity) } }

/-- Regional cancellation preserves exactly the snapshot records whose complete parent occurrences survive its selected disposition. -/
theorem mem_cancelScopeSubtree_compensationParentContextRetentions_iff
    (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition)
    (retention : CompensationParentContextRetention) :
    retention ∈
        (cancelScopeSubtree state root disposition).compensationParentContextRetentions ↔
      retention ∈ state.compensationParentContextRetentions ∧
        compensationParentContextRetentionSurvivesScopeCancellation
          state root disposition retention = true := by
  simp [cancelScopeSubtree]

/-! ## Withdrawal completeness

The composed facts, quantified over every state, region, and disposition. The deadline arm of the
bounded-scope family used to establish withdrawal structurally, by erasing from a list its premise
forced to contain the deadline. That premise is discharged, so withdrawal now rests on these two.
-/

/-- No record the region withdrew survives it. -/
theorem cancelScopeSubtree_retains_no_withdrawn_record (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ record ∈ (cancelScopeSubtree state root disposition).activityOccurrences,
      recordInRegion
        (fun owner =>
          occurrenceInSubtree state.scopeOccurrences root owner ||
            (calledInstanceClosure state root).contains owner.processInstanceId)
        record = false := by
  intro record retained
  simp only [cancelScopeSubtree] at retained
  exact retained_records_are_outside_the_region _ _ record retained

/-- No Timer wait a withdrawn record listed survives the region either. -/
theorem cancelScopeSubtree_withdraws_listed_timers (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ wait ∈ (cancelScopeSubtree state root disposition).timerWaits,
      anyTimerIdNamesWait
        (attachedTimersOf
          (withdrawnByRegion
            (fun owner =>
              occurrenceInSubtree state.scopeOccurrences root owner ||
                (calledInstanceClosure state root).contains owner.processInstanceId)
            state.activityOccurrences))
        wait = false := by
  intro wait survives
  simp only [cancelScopeSubtree, List.mem_filter, Bool.and_eq_true,
    Bool.not_eq_true'] at survives
  exact survives.2.2

/-- AOO-CANCEL-01 withdraws listed Message waits even when their scope owner survives. -/
theorem cancelScopeSubtree_withdraws_listed_messages (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ wait ∈ (cancelScopeSubtree state root disposition).messageWaits,
      activityRecordsAttachMessageWait
        (withdrawnByRegion
          (fun owner =>
            occurrenceInSubtree state.scopeOccurrences root owner ||
              (calledInstanceClosure state root).contains owner.processInstanceId)
          state.activityOccurrences) wait = false := by
  intro wait survives
  simp only [cancelScopeSubtree, List.mem_filter, Bool.and_eq_true,
    Bool.not_eq_true'] at survives
  exact survives.2.2

/-- The Activity-local data lifetime ends with the exact withdrawn Activity identity. -/
theorem cancelScopeSubtree_withdraws_activity_local_data (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ scope ∈ (cancelScopeSubtree state root disposition).variables.activities,
      (withdrawnByRegion
        (fun owner =>
          occurrenceInSubtree state.scopeOccurrences root owner ||
            (calledInstanceClosure state root).contains owner.processInstanceId)
        state.activityOccurrences).any (fun record =>
          activityOccurrenceScopeMatches
            { processInstanceId := record.processInstanceId
              activityElementId := ⟨record.activityElementId.value⟩
              activation := record.activation } scope) = false := by
  intro scope survives
  simp only [cancelScopeSubtree, List.mem_filter, Bool.and_eq_true,
    Bool.not_eq_true'] at survives
  exact survives.2.1.1.2

/-- Regional interruption removes the selected occurrence and then emits the caught route token in its live parent. -/
def interruptScope (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) : RuntimeState :=
  let cancelled := cancelScopeSubtree state root .remove
  { cancelled with tokens := addToken cancelled.tokens output parent }

end BpmnSemantics.SemanticProcess
