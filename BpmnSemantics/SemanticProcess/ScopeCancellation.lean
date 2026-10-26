module

public import BpmnSemantics.SemanticProcess.ActivityOccurrence
public import BpmnSemantics.SemanticProcess.RuntimeOwnerRemoval
public import BpmnSemantics.SemanticProcess.CallInstanceClosure
public import BpmnSemantics.SemanticProcess.SequentialMultiInstance
import Std.Data.DTreeMap.Internal.Balancing

/-! # Scope-subtree cancellation

This module owns classification and removal of every represented live runtime owner in one selected
scope-occurrence subtree, including transitively called Process instances, Activity-local effect
state, and Compensation parent-context records whose owning occurrences are removed. The
selected occurrence may be retained for immediate normal completion or removed for an interrupting
boundary route. Activation counters, Process variables, End history, and logical time are never
cancellation targets.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive SelectedScopeDisposition where
  | retain
  | remove
  deriving Repr, DecidableEq

/-- ESL-RETAIN-01 excludes only the selected scope from actual body removal. -/
def retainedCancellationRoot (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) : Option ScopeOccurrenceId :=
  match disposition with
  | .retain => some root
  | .remove => none

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

/-- Regional disposal includes the selected subtree and every transitively called Process instance. -/
@[reducible] def scopeCancellationOwner (state : RuntimeState) (root owner : ScopeOccurrenceId) : Bool :=
  occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId

def cancelledEffectOccurrenceId (wait : EffectWait) : EffectOccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

def keepScopeOccurrence (disposition : SelectedScopeDisposition)
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
  let cancelled := scopeCancellationOwner state root
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
  let cancelled := scopeCancellationOwner state root
  let cancelledEffects := state.effectWaits.filter fun wait =>
    cancelled wait.owner
  let cancelledIncidents := state.effectIncidents.filter fun incident =>
    cancelled incident.wait.owner
  let cancelledTriggers := state.compensationTriggers.filter fun trigger =>
    cancelled trigger.owner
  -- A handler attached to an Activity is owned by the scope *holding* that Activity, so an
  -- owner-only rule leaves a bounded Sub-Process deadline alive after its child region is gone. The
  -- records name what each Activity owns, and the withdrawn ones carry their attached waits out.
  let withdrawnActivities := withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)
  let withdrawnTimers := attachedTimersOf withdrawnActivities
  { filterScopeOwnedWork state (fun owner => !cancelled owner) with
    scopeOccurrences := state.scopeOccurrences.filter
      (keepScopeOccurrence disposition root cancelled)
    messageWaits := state.messageWaits.filter fun wait =>
      !cancelled wait.owner && !activityRecordsAttachMessageWait withdrawnActivities wait
    eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
      !cancelled listener.owner
    timerWaits := state.timerWaits.filter fun wait =>
      !cancelled wait.owner && !anyTimerIdNamesWait withdrawnTimers wait
    activityOccurrences := retainedByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)
    sequentialScopeControllers := state.sequentialScopeControllers.filter fun controller =>
      !calledInstances.contains controller.id.processInstanceId &&
        !(withdrawnActivities.any fun activity =>
          controller.id.processInstanceId == activity.processInstanceId &&
          controller.id.activityElementId.value == activity.activityElementId.value &&
          controller.id.activation == activity.activation)
    parallelScopeControllers := state.parallelScopeControllers.filter fun controller =>
      !calledInstances.contains controller.id.processInstanceId &&
        !(withdrawnActivities.any fun activity =>
          controller.id.processInstanceId == activity.processInstanceId &&
          controller.id.activityElementId.value == activity.activityElementId.value &&
          controller.id.activation == activity.activation)
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
    compensationParentContextRetentions :=
      state.compensationParentContextRetentions.filter
        (compensationParentContextRetentionSurvivesScopeCancellation
          state root disposition)
    compensationTriggers := state.compensationTriggers.filter fun trigger =>
      !cancelled trigger.owner
    compensationHandlerEffectWaits := state.compensationHandlerEffectWaits.filter fun wait =>
      !(cancelledTriggers.any fun trigger => trigger.id == wait.triggerId)
    variables :=
      { state.variables with
        scopes := state.variables.scopes.filter fun scope =>
          match disposition with
          | .retain => scope.owner = root || !cancelled scope.owner
          | .remove => !cancelled scope.owner
        processInterfaces := state.variables.processInterfaces.filter fun scope =>
          match disposition with
          | .retain => scope.owner = root || !cancelled scope.owner
          | .remove => !cancelled scope.owner
        activities := state.variables.activities.filter fun activity =>
          !calledInstances.contains activity.owner.processInstanceId &&
            !(withdrawnActivities.any fun record =>
              activityOccurrenceScopeMatches
                { processInstanceId := record.processInstanceId
                  activityElementId := ⟨record.activityElementId.value⟩
                  activation := record.activation } activity) &&
            !(cancelledEffects.any fun wait =>
              activityScopeMatches (cancelledEffectOccurrenceId wait) activity) &&
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
        record (retainedCancellationRoot root disposition) = false := by
  intro record retained
  simp only [cancelScopeSubtree] at retained
  simpa only [Bool.not_eq_true'] using (List.mem_filter.mp retained).2

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
            state.activityOccurrences (retainedCancellationRoot root disposition)))
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
          state.activityOccurrences (retainedCancellationRoot root disposition)) wait = false := by
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
        state.activityOccurrences (retainedCancellationRoot root disposition)).any (fun record =>
          activityOccurrenceScopeMatches
            { processInstanceId := record.processInstanceId
              activityElementId := ⟨record.activityElementId.value⟩
              activation := record.activation } scope) = false := by
  intro scope survives
  simp only [cancelScopeSubtree, List.mem_filter, Bool.and_eq_true,
    Bool.not_eq_true'] at survives
  exact survives.2.1.1.2

/-- ESL-RETAIN-01 keeps the parent-owned Activity of the exact retained child. -/
theorem cancelScopeSubtree_retains_selected_child_activity (state : RuntimeState)
    (root : ScopeOccurrenceId) (record : ActivityOccurrence)
    (member : record ∈ state.activityOccurrences)
    (outside : (occurrenceInSubtree state.scopeOccurrences root record.owner ||
      (calledInstanceClosure state root).contains record.owner.processInstanceId) = false)
    (body : record.body = .childScope root) :
    record ∈ (cancelScopeSubtree state root .retain).activityOccurrences := by
  change record ∈ state.activityOccurrences.filter _
  apply List.mem_filter.mpr
  refine ⟨member, ?_⟩
  simp only [recordInRegion, outside, body, retainedCancellationRoot, beq_self_eq_true,
    Bool.not_true, Bool.and_false, Bool.or_self, Bool.not_false]

/-- Distinct direct children of a parentless root cannot lie in each other's cancellation subtree. -/
theorem occurrenceInSubtree_sibling (occurrences : List RuntimeScopeOccurrence)
    (retired sibling parent : ScopeOccurrenceId) (different : sibling ≠ retired)
    (parentDifferent : parent ≠ retired) (owned : occurrenceParent? occurrences sibling = some parent)
    (parentless : occurrenceParent? occurrences parent = none) :
    occurrenceInSubtree occurrences retired sibling = false := by
  cases length : occurrences.length <;>
    simp [occurrenceInSubtree, occurrenceInSubtreeWithin, length, different, owned, parentDifferent, parentless]

/-- A Call-free population has no extra Process-instance cancellation targets. -/
theorem calledInstanceClosure_no_calls (state : RuntimeState) (root : ScopeOccurrenceId)
    (noCalls : state.calledProcessOccurrences = []) : calledInstanceClosure state root = [] := by
  simp [calledInstanceClosure, noCalls, processInstanceClosureWithin]

/-- The full function equation also rewrites classifiers passed to Activity body-region rules. -/
theorem scopeCancellationOwner_no_calls (state : RuntimeState) (root : ScopeOccurrenceId)
    (noCalls : state.calledProcessOccurrences = []) :
    scopeCancellationOwner state root = occurrenceInSubtree state.scopeOccurrences root := by
  funext owner
  simp only [scopeCancellationOwner, calledInstanceClosure_no_calls state root noCalls,
    List.contains_nil, Bool.or_false]

/-- Cancellation preserves the complete occurrence and local-frame selection censuses of every outside owner. -/
theorem cancelScopeSubtree_outside_owner_census (state : RuntimeState) (root owner : ScopeOccurrenceId)
    (noCalls : state.calledProcessOccurrences = [])
    (outside : occurrenceInSubtree state.scopeOccurrences root owner = false) :
    (cancelScopeSubtree state root .remove).scopeOccurrences.filter (fun value => value.id == owner) =
        state.scopeOccurrences.filter (fun value => value.id == owner) ∧
      (cancelScopeSubtree state root .remove).variables.scopes.filter (fun value => decide (value.owner = owner)) =
        state.variables.scopes.filter (fun value => decide (value.owner = owner)) := by
  have calls := calledInstanceClosure_no_calls state root noCalls
  constructor
  · simp only [cancelScopeSubtree, scopeCancellationOwner_no_calls state root noCalls,
      keepScopeOccurrence, calls, List.contains_nil, List.filter_filter]
    apply List.filter_congr
    intro value _
    by_cases same : value.id = owner <;> simp [same, outside]
  · simp only [cancelScopeSubtree, scopeCancellationOwner_no_calls state root noCalls,
      calls, List.contains_nil, List.filter_filter]
    apply List.filter_congr
    intro value _
    by_cases same : value.owner = owner <;> simp [same, outside, calls]

/-- After retired membership is detached, a sole outside outer Activity and its controller survive leaf cancellation. -/
theorem cancelScopeSubtree_outside_parallel_outer (state : RuntimeState) (root : ScopeOccurrenceId)
    (record : ActivityOccurrence) (controller : ParallelScopeController)
    (noCalls : state.calledProcessOccurrences = [])
    (activities : state.activityOccurrences = [record]) (controllers : state.parallelScopeControllers = [controller])
    (ownerOutside : occurrenceInSubtree state.scopeOccurrences root record.owner = false)
    (claimsOutside : ∀ scope ∈ activityBodyScopeClaims record.body,
      occurrenceInSubtree state.scopeOccurrences root scope = false) :
    (cancelScopeSubtree state root .remove).activityOccurrences = [record] ∧
      (cancelScopeSubtree state root .remove).parallelScopeControllers = [controller] := by
  have calls := calledInstanceClosure_no_calls state root noCalls
  have notWithdrawn : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner) record none = false := by
    cases body : record.body <;> simp [recordInRegion, body, ownerOutside, activityBodyScopeClaims] at claimsOutside ⊢
    all_goals simp_all
  simp [cancelScopeSubtree, scopeCancellationOwner_no_calls state root noCalls,
    calls, activities, controllers, retainedByRegion, withdrawnByRegion,
    retainedCancellationRoot, notWithdrawn]

/-- Regional cancellation can only remove occurrences, so later cancellations cannot resurrect an owner. -/
theorem cancelScopeSubtree_scopeOccurrences_sublist (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).scopeOccurrences.Sublist state.scopeOccurrences :=
  List.filter_sublist

/-- Removal classifies the exact selected occurrence as inside its subtree independently of ancestry. -/
theorem cancelScopeSubtree_remove_target (state : RuntimeState) (root : ScopeOccurrenceId) :
    ∀ occurrence ∈ (cancelScopeSubtree state root .remove).scopeOccurrences, occurrence.id ≠ root := by
  intro occurrence member same
  change occurrence ∈ state.scopeOccurrences.filter _ at member
  have retained := (List.mem_filter.mp member).2
  simp [keepScopeOccurrence, occurrenceInSubtree, occurrenceInSubtreeWithin, same] at retained

/-- Every prefix of a removal fold inherits the initial occurrence census as a sublist. -/
theorem cancelScopeSubtree_fold_scopeOccurrences_sublist {α : Type}
    (targets : List α) (scope : α → ScopeOccurrenceId) (state : RuntimeState) :
    (targets.foldl (fun current target => cancelScopeSubtree current (scope target) .remove)
      state).scopeOccurrences.Sublist state.scopeOccurrences := by
  induction targets generalizing state with
  | nil => exact List.Sublist.refl _
  | cons target rest ih =>
      exact (ih (cancelScopeSubtree state (scope target) .remove)).trans
        (cancelScopeSubtree_scopeOccurrences_sublist state (scope target) .remove)

/-- Each listed target is removed when visited and cannot reappear during later regional removals. -/
theorem cancelScopeSubtree_fold_remove_targets {α : Type}
    (targets : List α) (scope : α → ScopeOccurrenceId) (state : RuntimeState) :
    ∀ target ∈ targets, ∀ occurrence ∈
      (targets.foldl (fun current target => cancelScopeSubtree current (scope target) .remove)
        state).scopeOccurrences, occurrence.id ≠ scope target := by
  induction targets generalizing state with
  | nil => simp
  | cons head rest ih =>
      intro target member occurrence survives
      rcases List.mem_cons.mp member with same | tail
      · subst target
        exact cancelScopeSubtree_remove_target state (scope head) occurrence
          ((cancelScopeSubtree_fold_scopeOccurrences_sublist rest scope
            (cancelScopeSubtree state (scope head) .remove)).subset survives)
      · exact ih (cancelScopeSubtree state (scope head) .remove) target tail occurrence survives

/-- Regional interruption removes the selected occurrence and then emits the caught route token in its live parent. -/
def interruptScope (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) : RuntimeState :=
  let cancelled := cancelScopeSubtree state root .remove
  { cancelled with tokens := addToken cancelled.tokens output parent }

end BpmnSemantics.SemanticProcess
