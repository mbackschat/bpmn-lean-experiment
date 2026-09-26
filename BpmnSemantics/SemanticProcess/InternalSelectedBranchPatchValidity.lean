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

def InternalSelectedBranchPatch.SeparatesActiveCancelOwners
    (patch : InternalSelectedBranchPatch) (program : Program) (state : RuntimeState) : Prop :=
  match program.compensationExecution with
  | none => True
  | some declaration =>
      match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
      | [.cancelTransaction ..] =>
          ∀ trigger ∈ state.compensationTriggers, trigger.lifecycle = .active →
            ∀ record, patch = .insert record → record.owner ≠ trigger.owner
      | _ => True

theorem InternalSelectedBranchPatch.preserves_scopeQuiescent
    (state : RuntimeState) (patch : InternalSelectedBranchPatch) (owner : ScopeOccurrenceId)
    (quiet : scopeQuiescent state owner = true)
    (separated : ∀ record, patch = .insert record → record.owner ≠ owner) :
    scopeQuiescent { state with selectedBranchSets := patch.apply state.selectedBranchSets } owner = true := by
  have absent : (state.selectedBranchSets.any fun record => record.owner == owner) = false := by
    simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true'] at quiet
    exact quiet.1.1.1.1.2
  have before : state.selectedBranchSets.all (fun record => !(record.owner == owner)) = true := by
    apply List.all_eq_true.mpr
    intro record member
    simp [List.any_eq_false.mp absent record member]
  have after := patch.preserves_all state.selectedBranchSets _ before
    (by intro record inserted; simp [separated record inserted])
  have absentAfter : ((patch.apply state.selectedBranchSets).any fun record => record.owner == owner) = false := by
    apply List.any_eq_false.mpr
    intro record member
    simpa using List.all_eq_true.mp after record member
  simpa only [scopeQuiescent, absentAfter, absent] using quiet

private theorem InternalSelectedBranchPatch.preserves_triggerLifecycleValid
    (state : RuntimeState) (patch : InternalSelectedBranchPatch) (transaction : Bool)
    (trigger : CompensationTriggerExecution)
    (valid : triggerLifecycleValid transaction state trigger = true)
    (separated : transaction = true → trigger.lifecycle = .active →
      ∀ record, patch = .insert record → record.owner ≠ trigger.owner) :
    triggerLifecycleValid transaction
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } trigger = true := by
  cases transaction with
  | false => simpa [triggerLifecycleValid] using valid
  | true =>
      cases lifecycle : trigger.lifecycle with
      | active =>
          have live : transactionTriggerOwnerLive state trigger = true := by
            simp only [triggerLifecycleValid, lifecycle, Bool.not_true, Bool.false_or,
              Bool.and_eq_true, ite_true] at valid
            exact valid.2.1.1.2
          have preserved : transactionTriggerOwnerLive
              { state with selectedBranchSets := patch.apply state.selectedBranchSets } trigger = true := by
            unfold transactionTriggerOwnerLive at live ⊢
            split at live
            · rename_i occurrence parent selected
              simp only [selected]
              exact Bool.and_eq_true_iff.mpr ⟨(Bool.and_eq_true_iff.mp live).1,
                patch.preserves_scopeQuiescent _ trigger.owner (Bool.and_eq_true_iff.mp live).2
                  (separated rfl lifecycle)⟩
            · contradiction
          simpa only [triggerLifecycleValid, lifecycle, preserved, live,
            transactionTriggerProvenanceValid] using valid
      | succeeded | failed => simpa only [triggerLifecycleValid, lifecycle,
          transactionTriggerProvenanceValid] using valid

theorem InternalSelectedBranchPatch.preserves_compensationExecutionStateValid
    (program : Program) (state : RuntimeState) (patch : InternalSelectedBranchPatch)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : compensationExecutionStateValid program state = true)
    (separated : patch.SeparatesActiveCancelOwners program state) :
    compensationExecutionStateValid program
      { state with selectedBranchSets := patch.apply state.selectedBranchSets } = true := by
  apply compensationExecutionStateValid_running_of_matches program state
    { state with selectedBranchSets := patch.apply state.selectedBranchSets } instanceId running
    rfl rfl rfl rfl rfl valid
  intro declaration present trigger member
  have matching := compensationExecutionStateValid_trigger program state declaration present valid trigger member
  unfold triggerMatchesDeclaration at matching ⊢
  split at matching
  · rename_i id origin scope input output selected
    simp only
    have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := patch.preserves_triggerLifecycleValid state false trigger lifecycle (by simp)
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · rename_i id origin scope input output boundary selected
    simp only
    have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := patch.preserves_triggerLifecycleValid state true trigger lifecycle (by
      intro _ active
      simp only [InternalSelectedBranchPatch.SeparatesActiveCancelOwners, present, selected] at separated
      exact separated trigger member active)
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · contradiction

/-- RSI-OWN-01 and RSI-BIND-05 require live ownership and one key declarer only when adding a
record; neither rule requires distinct existing owner/key pairs or validates expected inputs. -/
theorem InternalSelectedBranchPatch.preserves_runtimeStateWellFormed (program : Program)
    (instanceId : SemanticId) (state : RuntimeState) (patch : InternalSelectedBranchPatch)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (separated : patch.SeparatesActiveCancelOwners program state)
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
  have executionAfter := patch.preserves_compensationExecutionStateValid program state
    instanceId running compensation.2 separated
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩,
    patch.preserves_waitOwnersLive state waitOwners live⟩, waitIds⟩, identity⟩, waits⟩,
    patch.preserves_hiddenRecordDeclarationsValid program state hidden declared⟩, ordered⟩,
    activities⟩, timers⟩, messages⟩, activityIds⟩, controllers⟩, sequential⟩, parallel⟩,
    controllerIds⟩, exhausted⟩, ?_⟩,
    ⟨⟨⟨compensation.1.1.1, compensation.1.1.2⟩, compensation.1.2⟩, ?_⟩⟩
  · simp [running]
  · exact executionAfter

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
