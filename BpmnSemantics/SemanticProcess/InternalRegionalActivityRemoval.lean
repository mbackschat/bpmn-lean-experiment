import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Activity and handler removal agreement

The Internal Commutation account prepares regions before execution. AOO-CANCEL-01 additionally
withdraws handlers through their Activity records, including records whose owner survives while
their child body is cancelled. Predecessor validity connects those records to the prepared region.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem regional_validity_facts (program : Program) (state : RuntimeState)
    (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true) :
    runtimePositionValid program instanceId state = true ∧ waitOwnersLive state = true ∧
      activityRecordsOwnLiveWork state = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
  exact ⟨valid.1, valid.2.2.2.1, valid.2.2.2.2.2.2.2.2.2.1⟩

private theorem regional_live_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (candidate : ScopeOccurrenceId) (live : exactLiveOccurrence state candidate = true) :
    (occurrenceInSubtree state.scopeOccurrences root candidate ||
      (calledInstanceClosure state root).contains candidate.processInstanceId) =
      region.contains candidate := by
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  have selected : occurrence ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = candidate)) := by rw [singleton]; simp
  obtain ⟨member, identity⟩ := List.mem_filter.mp selected
  exact (regional_cancellation_mask program state expectedInstanceId instanceId
    (regional_validity_facts program state expectedInstanceId valid).1 running root region prepared
    candidate (List.mem_map.mpr ⟨occurrence, member, of_decide_eq_true identity⟩)).symm

/-- Both ends of an Activity are live by RSI-OWN-01 and AOO-BODY-01, so cancellation's
membership test agrees with preparation even when only the child body is inside the region. -/
theorem regional_activity_record_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (record : ActivityOccurrence) (member : record ∈ state.activityOccurrences) :
    recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record =
      recordInRegion region.contains record := by
  obtain ⟨_, owners, bodies⟩ := regional_validity_facts program state expectedInstanceId valid
  simp only [waitOwnersLive, Bool.and_eq_true] at owners
  have ownerLive := List.all_eq_true.mp owners.2 record member
  have bodyLive := List.all_eq_true.mp bodies record member
  simp only [Bool.and_eq_true] at bodyLive
  have ownerMask := regional_live_mask program state expectedInstanceId instanceId valid running
    root region prepared record.owner ownerLive
  dsimp only [recordInRegion]
  rw [ownerMask]
  cases body : record.body with
  | userTask task => rfl
  | parallelUserTasks first rest => rfl
  | childScope scope =>
      have scopeLive : exactLiveOccurrence state scope = true := by
        simpa only [activityBodyLive, body] using bodyLive.1.1.1
      dsimp only
      rw [regional_live_mask program state expectedInstanceId instanceId valid running
        root region prepared scope scopeLive]

/-- Exact equality of the withdrawn records also fixes the complete attached-handler population. -/
theorem regional_withdrawn_activities_eq (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region) :
    withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences =
      withdrawnByRegion region.contains state.activityOccurrences := by
  apply List.filter_congr
  exact regional_activity_record_mask program state expectedInstanceId instanceId valid running
    root region prepared

/-- AOO-CANCEL-01 withdraws the Activity when either its owner or its child body lies in the
prepared region; the handler's scope alone cannot determine its lifetime. -/
theorem cancelScopeSubtree_activities_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).activityOccurrences =
      retainedByRegion region.contains state.activityOccurrences := by
  apply List.filter_congr
  intro record member
  exact congrArg Bool.not (regional_activity_record_mask program state expectedInstanceId instanceId
    valid running root region prepared record member)

/-- AOO-CANCEL-01 includes attached Timers outside the scope region, using the exact withdrawn
Activity identities rather than assuming the Timer owner is cancelled. -/
theorem cancelScopeSubtree_timers_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).timerWaits =
      state.timerWaits.filter fun wait => !region.contains wait.owner &&
        !anyTimerIdNamesWait
          (attachedTimersOf (withdrawnByRegion region.contains state.activityOccurrences)) wait := by
  have withdrawn := regional_withdrawn_activities_eq program state expectedInstanceId instanceId
    valid running root region prepared
  change state.timerWaits.filter _ = _
  rw [withdrawn]
  apply List.filter_congr
  intro wait member
  dsimp only
  have owners := (regional_validity_facts program state expectedInstanceId valid).2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  rw [regional_live_mask program state expectedInstanceId instanceId valid running root region
    prepared wait.owner (List.all_eq_true.mp owners.2.2.1 wait member)]

/-- Tagged Message attachments follow the same Activity withdrawal, independently of Timer IDs. -/
theorem cancelScopeSubtree_messages_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).messageWaits =
      state.messageWaits.filter fun wait => !region.contains wait.owner &&
        !activityRecordsAttachMessageWait
          (withdrawnByRegion region.contains state.activityOccurrences) wait := by
  have withdrawn := regional_withdrawn_activities_eq program state expectedInstanceId instanceId
    valid running root region prepared
  change state.messageWaits.filter _ = _
  rw [withdrawn]
  apply List.filter_congr
  intro wait member
  dsimp only
  have owners := (regional_validity_facts program state expectedInstanceId valid).2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  rw [regional_live_mask program state expectedInstanceId instanceId valid running root region
    prepared wait.owner (List.all_eq_true.mp owners.2.1 wait member)]

private theorem regional_owned_filter {α : Type} (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (values : List α) (owner : α → ScopeOccurrenceId)
    (live : values.all (fun value => exactLiveOccurrence state (owner value)) = true)
    (keep : Bool → Bool) :
    values.filter (fun value => keep (occurrenceInSubtree state.scopeOccurrences root (owner value) ||
      (calledInstanceClosure state root).contains (owner value).processInstanceId)) =
      values.filter (fun value => keep (region.contains (owner value))) := by
  apply List.filter_congr
  intro value member
  exact congrArg keep (regional_live_mask program state expectedInstanceId instanceId valid running
    root region prepared (owner value) (List.all_eq_true.mp live value member))

/-- RSI-OWN-01 makes region filtering exact for directly owned work, including the wait retained
inside an incident; these equalities preserve the original list order and multiplicity. -/
theorem cancelScopeSubtree_owned_work_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).waits =
        state.waits.filter (fun wait => !region.contains wait.owner) ∧
      (cancelScopeSubtree state root disposition).effectWaits =
        state.effectWaits.filter (fun wait => !region.contains wait.owner) ∧
      (cancelScopeSubtree state root disposition).effectIncidents =
        state.effectIncidents.filter (fun incident => !region.contains incident.wait.owner) ∧
      (cancelScopeSubtree state root disposition).selectedBranchSets =
        state.selectedBranchSets.filter (fun selection => !region.contains selection.owner) ∧
      (cancelScopeSubtree state root disposition).eventRaces =
        state.eventRaces.filter (fun race => !region.contains race.owner) := by
  have owners := (regional_validity_facts program state expectedInstanceId valid).2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  exact ⟨regional_owned_filter program state expectedInstanceId instanceId valid running root region
      prepared state.waits (·.owner) owners.1 Bool.not,
    regional_owned_filter program state expectedInstanceId instanceId valid running root region
      prepared state.effectWaits (·.owner) owners.2.2.2.1 Bool.not,
    regional_owned_filter program state expectedInstanceId instanceId valid running root region
      prepared state.effectIncidents (·.wait.owner) owners.2.2.2.2.1 Bool.not,
    regional_owned_filter program state expectedInstanceId instanceId valid running root region
      prepared state.selectedBranchSets (·.owner) owners.2.2.2.2.2.1 Bool.not,
    regional_owned_filter program state expectedInstanceId instanceId valid running root region
      prepared state.eventRaces (·.owner) owners.2.2.2.2.2.2.1 Bool.not⟩

/-- Controller cancellation retains the existing called-instance test and binds its Activity
withdrawal test to the complete prepared region, including child bodies outside the owner scope. -/
theorem cancelScopeSubtree_controllers_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).sequentialMultiInstanceControllers =
        state.sequentialMultiInstanceControllers.filter (fun controller =>
          !(calledInstanceClosure state root).contains controller.processInstanceId &&
            !((withdrawnByRegion region.contains state.activityOccurrences).any
              (controllerNamesActivityOccurrence controller))) ∧
      (cancelScopeSubtree state root disposition).parallelMultiInstanceControllers =
        state.parallelMultiInstanceControllers.filter (fun controller =>
          !(calledInstanceClosure state root).contains controller.id.processInstanceId &&
            !((withdrawnByRegion region.contains state.activityOccurrences).any fun activity =>
              parallelControllerNamesIdentity controller activity.processInstanceId
                ⟨activity.activityElementId.value⟩ activity.activation)) := by
  have withdrawn := regional_withdrawn_activities_eq program state expectedInstanceId instanceId
    valid running root region prepared
  simp only [cancelScopeSubtree, withdrawn, and_self]

/-- Activity-local data is removed by the same exact withdrawn Activity and effect identities as
the evaluator; the additional called-instance test remains part of that predecessor contract. -/
theorem cancelScopeSubtree_local_data_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).variables.activities =
      state.variables.activities.filter fun activity =>
        !(calledInstanceClosure state root).contains activity.owner.processInstanceId &&
          !((withdrawnByRegion region.contains state.activityOccurrences).any fun record =>
            activityOccurrenceScopeMatches
              { processInstanceId := record.processInstanceId
                activityElementId := ⟨record.activityElementId.value⟩
                activation := record.activation } activity) &&
          !((state.effectWaits.filter fun wait => region.contains wait.owner).any fun wait =>
            activityScopeMatches
              { processInstanceId := wait.processInstanceId
                elementId := ⟨wait.elementId.value⟩
                activation := wait.activation } activity) &&
          !((state.effectIncidents.filter fun incident => region.contains incident.wait.owner).any
            fun incident => activityScopeMatches incident.id.effectId activity) := by
  have withdrawn := regional_withdrawn_activities_eq program state expectedInstanceId instanceId
    valid running root region prepared
  have owners := (regional_validity_facts program state expectedInstanceId valid).2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  have effects := regional_owned_filter program state expectedInstanceId instanceId valid running
    root region prepared state.effectWaits (·.owner) owners.2.2.2.1 id
  have incidents := regional_owned_filter program state expectedInstanceId instanceId valid running
    root region prepared state.effectIncidents (·.wait.owner) owners.2.2.2.2.1 id
  dsimp only [id] at effects incidents
  simp only [cancelScopeSubtree, withdrawn, effects, incidents]
  rfl

end BpmnSemantics.SemanticProcess
