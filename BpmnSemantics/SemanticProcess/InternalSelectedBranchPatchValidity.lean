import BpmnSemantics.SemanticProcess.InternalSelectedBranchPatch
import BpmnSemantics.SemanticProcess.InternalLocalControlTokenValidity

/-! Selected-record validity for the approved
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem InternalSelectedBranchPatch.preserves_all (records : List SelectedBranchSet)
    (patch : InternalSelectedBranchPatch) (predicate : SelectedBranchSet → Bool)
    (prior : records.all predicate = true)
    (inserted : ∀ record, patch = .insert record → predicate record = true) :
    (patch.apply records).all predicate = true := by
  cases patch with
  | preserve => exact prior
  | insert record =>
      simpa [InternalSelectedBranchPatch.apply,
        insertSelectedBranchSetCanonical_eq_canonicalInsertBy, all_canonicalInsertBy,
        inserted record rfl] using prior
  | remove record =>
      simp only [InternalSelectedBranchPatch.apply, List.all_eq_true] at prior ⊢
      exact fun value member => prior value (List.mem_of_mem_erase member)

theorem InternalSelectedBranchPatch.preserves_waitOwnersLive (state : RuntimeState)
    (patch : InternalSelectedBranchPatch) (prior : waitOwnersLive state = true)
    (inserted : ∀ record, patch = .insert record → exactLiveOccurrence state record.owner = true) :
    waitOwnersLive { state with selectedBranchSets := patch.apply state.selectedBranchSets } =
      true := by
  simp only [waitOwnersLive, Bool.and_eq_true] at prior ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩, selected⟩, races⟩,
    calls⟩, activities⟩ := prior
  exact ⟨⟨⟨⟨⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩,
    patch.preserves_all state.selectedBranchSets _ selected inserted⟩, races⟩, calls⟩, activities⟩

theorem InternalSelectedBranchPatch.preserves_hiddenRecordDeclarationsValid (program : Program)
    (state : RuntimeState) (patch : InternalSelectedBranchPatch)
    (prior : hiddenRecordDeclarationsValid program state = true)
    (inserted : ∀ record, patch = .insert record →
      (program.operations.filter fun
        | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
        | _ => false).length = 1) :
    hiddenRecordDeclarationsValid program
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } = true := by
  simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at prior ⊢
  refine ⟨patch.preserves_all state.selectedBranchSets _ prior.1 ?_, prior.2⟩
  intro record equality
  have counted : decide ((program.operations.filter fun
      | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
      | _ => false).length = 1) = true := by simp [inserted record equality]
  refine Eq.trans ?_ counted
  apply congrArg (fun operations : List SemanticOperation => decide (operations.length = 1))
  apply List.filter_congr
  intro operation _
  cases operation <;> rfl

theorem InternalSelectedBranchPatch.preserves_collection_order (state : RuntimeState)
    (patch : InternalSelectedBranchPatch) (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered ⊢
  obtain ⟨⟨⟨⟨ordered, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩ := ordered
  refine ⟨⟨⟨⟨?_, scopeOrder⟩, scopeCounterOrder⟩, callCounterOrder⟩, raceCounterOrder⟩
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokens, activity⟩, tasks⟩, activations⟩, messages⟩,
    timers⟩, effects⟩, messageActivations⟩, timerActivations⟩, effectActivations⟩, variables⟩,
    branches⟩, races⟩, calls⟩, occurrences⟩, sequential⟩, parallel⟩ := ordered
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨tokens, activity⟩, tasks⟩, activations⟩, messages⟩,
    timers⟩, effects⟩, messageActivations⟩, timerActivations⟩, effectActivations⟩, variables⟩,
    patch.preserves_order state.selectedBranchSets branches⟩, races⟩, calls⟩, occurrences⟩,
    sequential⟩, parallel⟩

/-- RSI-OWN-01 and RSI-BIND-05 require live ownership and one key declarer only when adding a
record; neither rule requires distinct existing owner/key pairs or validates expected inputs. -/
theorem InternalSelectedBranchPatch.preserves_runtimeStateWellFormed (program : Program)
    (instanceId : SemanticId) (state : RuntimeState) (patch : InternalSelectedBranchPatch)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (live : ∀ record, patch = .insert record → exactLiveOccurrence state record.owner = true)
    (declared : ∀ record, patch = .insert record →
      (program.operations.filter fun
        | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
        | _ => false).length = 1) :
    runtimeStateWellFormed program instanceId
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } = true := by
  have ordered := patch.preserves_collection_order state
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state valid)
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, waitOwners⟩,
    waitIds⟩, identity⟩, waits⟩, hidden⟩, _order⟩, activities⟩, timers⟩, messages⟩,
    activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩,
    _notStarted⟩, compensation⟩ := valid
  have executionFrame := compensationExecutionStateValid_running_frame program state
    { state with selectedBranchSets := patch.apply state.selectedBranchSets } instanceId running
    rfl rfl rfl rfl rfl rfl
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩,
    patch.preserves_waitOwnersLive state waitOwners live⟩, waitIds⟩, identity⟩, waits⟩,
    patch.preserves_hiddenRecordDeclarationsValid program state hidden declared⟩, ordered⟩,
    activities⟩, timers⟩, messages⟩, activityIds⟩, controllers⟩, sequential⟩, parallel⟩,
    controllerIds⟩, exhausted⟩, ?_⟩,
    ⟨⟨⟨compensation.1.1.1, compensation.1.1.2⟩, compensation.1.2⟩, ?_⟩⟩
  · simp [running]
  · rw [executionFrame]
    exact compensation.2

/-- The actual running projection checks selected-record owners, so its frame follows their
predecessor validity and inserted ownership rather than an assumed successor projection. -/
theorem InternalSelectedBranchPatch.open_occurrences_frame (program : Program)
    (state : RuntimeState) (patch : InternalSelectedBranchPatch) (instanceId : SemanticId)
    (running : state.control = .running instanceId)
    (owners : waitOwnersLive state = true)
    (live : ∀ record, patch = .insert record → exactLiveOccurrence state record.owner = true) :
    projectOpenFlowNodeOccurrences? program
        { state with selectedBranchSets := patch.apply state.selectedBranchSets } =
      projectOpenFlowNodeOccurrences? program state := by
  have nextOwners := patch.preserves_waitOwnersLive state owners live
  have selected : state.selectedBranchSets.all
      (fun record => flowNodeOccurrenceOwnerLiveUnique state record.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true] at owners
    exact owners.1.1.1.2
  have nextSelected : (patch.apply state.selectedBranchSets).all
      (fun record => flowNodeOccurrenceOwnerLiveUnique state record.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true] at nextOwners
    exact nextOwners.1.1.1.2
  have validityFrame : flowNodeOccurrenceProgramValidity program
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } =
        flowNodeOccurrenceProgramValidity program state := by
    unfold flowNodeOccurrenceProgramValidity
    change (_ && _ && (patch.apply state.selectedBranchSets).all
      (fun record => flowNodeOccurrenceOwnerLiveUnique state record.owner) && _) =
        (_ && _ && state.selectedBranchSets.all
          (fun record => flowNodeOccurrenceOwnerLiveUnique state record.owner) && _)
    rw [selected, nextSelected]
    rfl
  cases state
  cases running
  simp only [projectOpenFlowNodeOccurrences?]
  rw [validityFrame]
  rfl

theorem selectedBranchSet_insert_dead_owner_refused (state : RuntimeState)
    (record : SelectedBranchSet) (dead : exactLiveOccurrence state record.owner = false) :
    waitOwnersLive { state with selectedBranchSets :=
      (InternalSelectedBranchPatch.insert record).apply state.selectedBranchSets } = false := by
  simp only [waitOwnersLive, InternalSelectedBranchPatch.apply,
    insertSelectedBranchSetCanonical_eq_canonicalInsertBy, all_canonicalInsertBy]
  change (_ && _ && _ && _ && _ &&
    (exactLiveOccurrence state record.owner && _) && _ && _ && _) = false
  simp [dead]

theorem selectedBranchSet_insert_invalid_declarer_count_refused (program : Program)
    (state : RuntimeState) (record : SelectedBranchSet)
    (invalid : (program.operations.filter fun
      | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
      | _ => false).length ≠ 1) :
    hiddenRecordDeclarationsValid program { state with selectedBranchSets :=
      (InternalSelectedBranchPatch.insert record).apply state.selectedBranchSets } = false := by
  have countFalse : decide ((program.operations.filter fun
      | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
      | _ => false).length = 1) = false := by simp [invalid]
  simp only [hiddenRecordDeclarationsValid, InternalSelectedBranchPatch.apply,
    insertSelectedBranchSetCanonical_eq_canonicalInsertBy, all_canonicalInsertBy]
  apply Bool.and_eq_false_iff.mpr
  left
  apply Bool.and_eq_false_iff.mpr
  left
  refine Eq.trans ?_ countFalse
  apply congrArg (fun operations : List SemanticOperation => decide (operations.length = 1))
  apply List.filter_congr
  intro operation _
  cases operation <;> rfl

end BpmnSemantics.SemanticProcess
