import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationClassifiers
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch
import BpmnSemantics.SemanticProcess.CallRecordCanonicalEquality

/-! Scope creation inserts outside a prepared removal region. These collection laws retain exact order and multiplicity when insertion is exchanged with removal; token equality is kept separate from the other RuntimeState fields. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_regional_tokens_commute (tokens : List ControlToken)
    (creation : InternalScopeCreationSelection) (keep : ControlToken → Bool)
    (outputs : List ControlPlaceId) (owner : ScopeOccurrenceId)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (entryKept : keep { placeId := creation.entry, owner := creation.created.id } = true)
    (separated : ∀ output ∈ outputs, ({ placeId := output, owner } : ControlToken) ≠
      { placeId := creation.input, owner := creation.owner }) :
    addTokens ((addToken (removeToken tokens creation.input creation.owner)
      creation.entry creation.created.id).filter keep) outputs owner =
      addToken (removeToken (addTokens (tokens.filter keep) outputs owner)
        creation.input creation.owner) creation.entry creation.created.id := by
  rw [show addToken (removeToken tokens creation.input creation.owner) creation.entry creation.created.id =
    canonicalInsertBy controlTokenBefore { placeId := creation.entry, owner := creation.created.id }
      (removeToken tokens creation.input creation.owner) from rfl]
  rw [filter_canonicalInsertBy_retained controlTokenBefore controlTokenBefore_compose keep _ _
    (orderedBy_removeToken tokens creation.input creation.owner ordered) entryKept]
  change addTokens (addToken ((removeToken tokens creation.input creation.owner).filter keep)
    creation.entry creation.created.id) outputs owner = _
  rw [removeToken_eq_erase, ← List.erase_filter, ← removeToken_eq_erase,
    addTokens_removeToken_commute _ outputs creation.input owner creation.owner
      (orderedBy_token_filter tokens keep ordered) separated,
    addTokens_addToken_commute]

theorem filter_sortCallRecords (records : List CalledProcessOccurrence)
    (keep : CalledProcessOccurrence → Bool) :
    (sortCallRecords records).filter keep = sortCallRecords (records.filter keep) := by
  induction records with
  | nil => rfl
  | cons record rest ih =>
      simp only [sortCallRecords, insertCallRecord_eq_canonicalInsertBy]
      cases retained : keep record with
      | false =>
          rw [filter_canonicalInsertBy_rejected _ _ _ _ retained, ih]
          simp only [List.filter_cons, retained, Bool.false_eq_true, if_false]
      | true =>
          rw [filter_canonicalInsertBy_retained callRecordBefore callRecordBefore_compose keep _ _
            (orderedBy_sortCallRecords rest) retained, ih]
          simp only [List.filter_cons, retained, ↓reduceIte, sortCallRecords,
            insertCallRecord_eq_canonicalInsertBy]

theorem scopeCreation_return_fields_commute (state : RuntimeState)
    (creation : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (ordered : orderedBy scopeOccurrenceBefore state.scopeOccurrences = true)
    (closure : ∀ id, (processInstanceClosureWithin (creation.apply state).calledProcessOccurrences
      [record.calledRoot.processInstanceId] ((creation.apply state).calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains id)
    (scopeKept : (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
      (state.calledProcessOccurrences.length + 1)).contains creation.created.id.processInstanceId = false)
    (callKept : ∀ inserted, creation.kind = .called inserted →
      (decide (inserted.id ≠ record.id) &&
        !(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
          (state.calledProcessOccurrences.length + 1)).contains inserted.caller.processInstanceId &&
        !(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
          (state.calledProcessOccurrences.length + 1)).contains inserted.calledRoot.processInstanceId) = true) :
    { removeCalledProcessTree (creation.apply state) record with tokens := [], endOccurrences := 0 } =
      { creation.apply (removeCalledProcessTree state record) with tokens := [], endOccurrences := 0 } := by
  have scopes := filter_canonicalInsertBy_retained scopeOccurrenceBefore
    (fun a b c => scopeOwnerBefore_compose a.id b.id c.id)
    (fun scope : RuntimeScopeOccurrence =>
      !(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains scope.id.processInstanceId)
    creation.created state.scopeOccurrences ordered (by simp only [scopeKept, Bool.not_false])
  simp only [removeCalledProcessTree, closure]
  cases kind : creation.kind with
  | child =>
      simp only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence, scopes]
  | called inserted =>
      have calls := filter_sortCallRecords (inserted :: state.calledProcessOccurrences)
        (fun candidate => decide (candidate.id ≠ record.id) &&
          !(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
            (state.calledProcessOccurrences.length + 1)).contains candidate.caller.processInstanceId &&
          !(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
            (state.calledProcessOccurrences.length + 1)).contains candidate.calledRoot.processInstanceId)
      rw [List.filter_cons, callKept inserted kind] at calls
      simp only [↓reduceIte] at calls
      simp only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence, scopes, calls, setCallActivationCount]

theorem scopeCreation_cancellation_fields_commute (state : RuntimeState)
    (creation : InternalScopeCreationSelection) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition)
    (ordered : orderedBy scopeOccurrenceBefore state.scopeOccurrences = true)
    (subtree : ∀ owner, occurrenceInSubtree (creation.apply state).scopeOccurrences root owner =
      occurrenceInSubtree state.scopeOccurrences root owner)
    (called : ∀ id, (calledInstanceClosure (creation.apply state) root).contains id =
      (calledInstanceClosure state root).contains id)
    (scopeKept : (occurrenceInSubtree state.scopeOccurrences root creation.created.id ||
      (calledInstanceClosure state root).contains creation.created.id.processInstanceId) = false)
    (callKept : ∀ record, creation.kind = .called record →
      (occurrenceInSubtree state.scopeOccurrences root record.caller ||
        (calledInstanceClosure state root).contains record.caller.processInstanceId) = false ∧
      (occurrenceInSubtree state.scopeOccurrences root record.calledRoot ||
        (calledInstanceClosure state root).contains record.calledRoot.processInstanceId) = false) :
    { cancelScopeSubtree (creation.apply state) root disposition with tokens := [], endOccurrences := 0 } =
      { creation.apply (cancelScopeSubtree state root disposition) with tokens := [], endOccurrences := 0 } := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have scopes (keep : RuntimeScopeOccurrence → Bool) (kept : keep creation.created = true) :=
    filter_canonicalInsertBy_retained scopeOccurrenceBefore
      (fun a b c => scopeOwnerBefore_compose a.id b.id c.id) keep creation.created state.scopeOccurrences ordered kept
  have calls (record : CalledProcessOccurrence) (kind : creation.kind = .called record) :
      (sortCallRecords (record :: state.calledProcessOccurrences)).filter
        (fun value => !cancelled value.caller && !cancelled value.calledRoot) =
      sortCallRecords (record :: state.calledProcessOccurrences.filter
        (fun value => !cancelled value.caller && !cancelled value.calledRoot)) := by
    rw [filter_sortCallRecords, List.filter_cons]
    simp only [cancelled, (callKept record kind).1, (callKept record kind).2,
      Bool.not_false, Bool.and_self, ↓reduceIte]
  have contexts : compensationParentContextRetentionSurvivesScopeCancellation (creation.apply state) root disposition =
      compensationParentContextRetentionSurvivesScopeCancellation state root disposition := by
    funext retention
    unfold compensationParentContextRetentionSurvivesScopeCancellation
    simp only [subtree, called]
  simp only [cancelScopeSubtree, contexts, subtree, called]
  cases kind : creation.kind <;> cases disposition
  all_goals simp only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence, setCallActivationCount]
  all_goals rw [scopes _ (by
    first
    | (change (decide (creation.created.id = root) ||
        !(occurrenceInSubtree state.scopeOccurrences root creation.created.id ||
          (calledInstanceClosure state root).contains creation.created.id.processInstanceId)) = true
       simp only [scopeKept, Bool.not_false, Bool.or_true])
    | (change (!(occurrenceInSubtree state.scopeOccurrences root creation.created.id ||
          (calledInstanceClosure state root).contains creation.created.id.processInstanceId)) = true
       simp only [scopeKept, Bool.not_false]))]
  all_goals first | rfl | rw [calls _ kind]

end BpmnSemantics.SemanticProcess.InternalCommutation
