import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlTokenValidity
import BpmnSemantics.SemanticProcess.CallStorageOrder
import BpmnSemantics.SemanticProcess.ScopeCreationCompensationValidity

/-! Aggregate validity of actual scope creation under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem incidents_insert (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : effectIncidentAssociationsValid state = true) :
    effectIncidentAssociationsValid
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  unfold effectIncidentAssociationsValid at valid ⊢
  cases incidents : state.effectIncidents with
  | nil => simp
  | cons incident rest =>
      cases rest with
      | cons other rest => simp [incidents] at valid
      | nil =>
          simp only [incidents] at valid ⊢
          simp only [effectIncidentAssociationValid, Bool.and_eq_true] at valid ⊢
          refine ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩, ?_⟩,
            valid.1.2⟩, valid.2⟩
          have owner := valid.1.1.2
          unfold effectWaitOwnerAssociationValid at owner ⊢
          cases control : state.control <;> simp only [control] at owner ⊢
          all_goals try contradiction
          simp only [Bool.and_eq_true] at owner ⊢
          refine ⟨owner.1, ?_⟩
          have compare (left right : ScopeOccurrenceId) : (left == right) = decide (left = right) := by
            by_cases same : left = right <;> simp [same]
          have live : exactLiveOccurrence state incident.wait.owner = true := by
            simpa only [exactLiveOccurrence, compare, decide_eq_true_eq] using owner.2
          have preserved := exactLiveOccurrence_insertScopeOccurrence_preserves state inserted
            incident.wait.owner fresh live
          simpa only [exactLiveOccurrence, compare, decide_eq_true_eq] using preserved

private theorem creation_order (state : RuntimeState) (selected : InternalScopeCreationSelection)
    (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (selected.apply state) = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at ordered
  obtain ⟨tokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
    timerCounters, effectCounters, variables, selections, races, calls, activities, sequential,
    parallel, scopes, scopeCounters, callCounters, raceCounters⟩ := ordered
  have newTokens := orderedBy_addToken _ selected.entry selected.created.id
    (orderedBy_removeToken state.tokens selected.input selected.owner tokens)
  have newScopes := orderedBy_insertScopeOccurrence selected.created state.scopeOccurrences scopes
  cases kind : selected.kind with
  | child =>
      have newCounter := orderedBy_setScopeActivationCount state.scopeActivations
        selected.created.id.definitionScopeId selected.created.id.activation scopeCounters
      simpa only [InternalScopeCreationSelection.apply, kind, canonicalCollectionOrder,
        Bool.and_eq_true, and_assoc] using
        ⟨newTokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
          timerCounters, effectCounters, variables, selections, races, calls, activities, sequential,
          parallel, newScopes, newCounter, callCounters, raceCounters⟩
  | called record =>
      have newCounter := orderedBy_setCallActivationCount state
        ⟨record.id.elementId.value⟩ record.id.activation callCounters
      have newCalls := orderedBy_sortCallRecords (record :: state.calledProcessOccurrences)
      simpa only [InternalScopeCreationSelection.apply, kind, canonicalCollectionOrder,
        Bool.and_eq_true, and_assoc] using
        ⟨newTokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
          timerCounters, effectCounters, variables, selections, races, newCalls, activities, sequential,
          parallel, newScopes, scopeCounters, newCounter, raceCounters⟩

private theorem selected_call_caller (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (found : selectInternalScopeCreation? state operation = some selected)
    (kind : selected.kind = .called record) : record.caller = selected.owner := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals cases kind
      all_goals rfl

private theorem creation_waitOwners (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected)
    (live : exactLiveOccurrence state selected.owner = true)
    (valid : waitOwnersLive state = true) : waitOwnersLive (selected.apply state) = true := by
  have fresh := selectInternalScopeCreation_fresh state operation selected found
  have previous := waitOwnersLive_insertScopeOccurrence state selected.created fresh valid
  cases kind : selected.kind with
  | child => simpa only [InternalScopeCreationSelection.apply, kind, waitOwnersLive,
      exactLiveOccurrence] using previous
  | called record =>
      have caller := selected_call_caller state operation selected record found kind
      have callerLive := exactLiveOccurrence_insertScopeOccurrence_preserves state selected.created
        selected.owner fresh live
      simp only [waitOwnersLive, Bool.and_eq_true] at previous
      simp only [InternalScopeCreationSelection.apply, kind, waitOwnersLive, Bool.and_eq_true]
      refine ⟨⟨⟨⟨⟨⟨⟨⟨previous.1.1.1.1.1.1.1.1, previous.1.1.1.1.1.1.1.2⟩,
        previous.1.1.1.1.1.1.2⟩, previous.1.1.1.1.1.2⟩, previous.1.1.1.1.2⟩,
        previous.1.1.1.2⟩, previous.1.1.2⟩, ?_⟩, previous.2⟩
      apply List.all_eq_true.mpr
      intro candidate member
      have member := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).subset member
      rcases List.mem_cons.mp member with rfl | old
      · simpa only [caller, exactLiveOccurrence] using callerLive
      · exact List.all_eq_true.mp previous.1.2 candidate old

theorem prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  have position := prepareInternalScopeCreation_preserves_runtimePositionValid program state operation
    prepared instanceId admitted (by
      have parts := valid
      simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
      exact parts.1) found
  have ordered := creation_order state prepared.selection
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state valid)
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, running,
    snapshots, _, ownerExact, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  dsimp only [makeInternalScopeCreationPreparation] at position ordered ⊢
  have fresh := selectInternalScopeCreation_fresh state operation selected selection
  have live : exactLiveOccurrence state selected.owner = true := by
    simp [exactLiveOccurrence, ownerExact]
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨_, races⟩, incidents⟩, waitOwners⟩,
    waitIds⟩, identity⟩, waits⟩, hidden⟩, _order⟩, activities⟩, timers⟩, messages⟩,
    activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩,
    _notStarted⟩, compensation⟩ := valid
  have newIncidents := incidents_insert state selected.created fresh incidents
  have newOwners := creation_waitOwners state operation selected selection live waitOwners
  have newActivities := activityRecordsOwnLiveWork_insertScopeOccurrence state selected.created
    fresh activities
  have retention := compensationActivityRetentionStateValid_insertScopeOccurrence program state
    selected.created fresh compensation.1.1.2
  have execution := compensationExecutionStateValid_insertScopeOccurrence program state
    selected.created hosting running fresh compensation.2
  have executionFrame := compensationExecutionStateValid_running_frame program
    { state with scopeOccurrences := insertScopeOccurrence selected.created state.scopeOccurrences }
    (selected.apply state) hosting running
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
  have newExecution : compensationExecutionStateValid program (selected.apply state) = true := by
    rw [executionFrame]
    exact execution
  cases kind : selected.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind] at position ordered newOwners newExecution ⊢
  all_goals
    refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, newIncidents⟩, newOwners⟩,
      waitIds⟩, identity⟩, waits⟩, hidden⟩, ordered⟩, newActivities⟩, timers⟩, messages⟩,
      activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩, ?_⟩,
      ⟨⟨⟨compensation.1.1.1, retention⟩, ?_⟩, newExecution⟩⟩
  all_goals first
    | (solve | simp only [running])
    | simpa only [compensationEventSubProcessSnapshotStateValid, snapshots] using compensation.1.2

end BpmnSemantics.SemanticProcess.InternalCommutation
