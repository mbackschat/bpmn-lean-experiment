import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames
import BpmnSemantics.SemanticProcess.CallRecordCanonicalEquality

/-! Exact complete-state commutation of prepared child and Call creation from the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem prepared_selection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    selectInternalScopeCreation? state operation = some prepared.selection := by
  obtain ⟨selected, hosting, owner, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  exact selection

private theorem prepared_footprint (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ∃ owner, prepared.footprint =
      internalScopeCreationStateFootprint prepared.selection prepared.runtimeInstanceId owner := by
  obtain ⟨selected, hosting, owner, origin, definition, start, delta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  exact ⟨owner, rfl⟩

private theorem independent_tokens (state : RuntimeState)
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true)
    (ordered : orderedBy controlTokenBefore state.tokens = true) :
    addToken (removeToken
      (addToken (removeToken state.tokens left.input left.owner) left.entry left.created.id)
      right.input right.owner) right.entry right.created.id =
    addToken (removeToken
      (addToken (removeToken state.tokens right.input right.owner) right.entry right.created.id)
      left.input left.owner) left.entry left.created.id := by
  have distinct (read written : ControlToken)
      (reads : read ∈ [{ placeId := left.input, owner := left.owner },
        { placeId := left.entry, owner := left.created.id }])
      (writes : written ∈ [{ placeId := right.input, owner := right.owner },
        { placeId := right.entry, owner := right.created.id }]) : written ≠ read := by
    intro same
    exact scopeCreation_read_write_separate left right leftInstance rightInstance leftOwner rightOwner
      separated _ _ (scopeCreation_token_read left leftInstance leftOwner read reads)
      (scopeCreation_token_write right rightInstance rightOwner written writes) (by rw [same])
  rw [addToken_removeToken_commute _ left.entry right.input left.created.id right.owner
    (orderedBy_removeToken _ _ _ ordered) (Ne.symm (distinct _ _ (by simp) (by simp)))]
  rw [addToken_removeToken_commute _ right.entry left.input right.created.id left.owner
    (orderedBy_removeToken _ _ _ ordered) (distinct _ _ (by simp) (by simp))]
  rw [removeToken_commutes, addToken_commutes]

private theorem independent_scopes
    (left right : InternalScopeCreationSelection) (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : RuntimeScopeOccurrence)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint left leftInstance leftOwner)
      (internalScopeCreationStateFootprint right rightInstance rightOwner) = true) :
    right.created.id ≠ left.created.id := by
  intro same
  have reads := scopeCreation_creation_read left leftInstance leftOwner
    (.scopeOccurrence left.created.id) (by simp [internalScopeCreationCreationAtoms])
  have writes := scopeCreation_creation_write right rightInstance rightOwner
    (.scopeOccurrence right.created.id) (by simp [internalScopeCreationCreationAtoms])
  exact scopeCreation_read_write_separate left right leftInstance rightInstance leftOwner rightOwner
    separated _ _ reads writes (by rw [same])

private theorem call_sort_pair_perm (records : List CalledProcessOccurrence)
    (left right : CalledProcessOccurrence) :
    (sortCallRecords (right :: sortCallRecords (left :: records))).Perm
      (sortCallRecords (left :: sortCallRecords (right :: records))) := by
  exact (sortCallRecords_perm _).trans ((List.Perm.cons _ (sortCallRecords_perm _)).trans
    ((List.Perm.swap _ _ _).trans ((List.Perm.cons _ (sortCallRecords_perm _).symm).trans
      (sortCallRecords_perm _).symm)))

theorem prepared_scope_creation_pair_commutes
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalScopeCreation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    right.selection.apply (left.selection.apply state) =
      left.selection.apply (right.selection.apply state) := by
  have frames := prepared_scope_creation_pair_preserves_preparation program instanceId state
    leftOperation rightOperation left right programWF stateWF leftFound rightFound separated
  have leftSelection := prepared_selection program state leftOperation left leftFound
  obtain ⟨leftOwner, leftFootprint⟩ := prepared_footprint program state leftOperation left leftFound
  obtain ⟨rightOwner, rightFootprint⟩ := prepared_footprint program state rightOperation right rightFound
  rw [leftFootprint, rightFootprint] at separated
  have ordered := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateWF
  have tokens := independent_tokens state left.selection right.selection left.runtimeInstanceId
    right.runtimeInstanceId leftOwner rightOwner separated (canonicalCollectionOrder_tokens state ordered)
  have scopes := insertScopeOccurrence_commutes right.selection.created left.selection.created
    (independent_scopes _ _ _ _ _ _ separated) state.scopeOccurrences
  have scopeOrder : orderedBy scopeActivationBefore state.scopeActivations = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
    exact ordered.1.1.2
  have callOrder : orderedBy callActivationBefore state.callActivations = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
    exact ordered.1.2
  cases leftKind : left.selection.kind with
  | child =>
      cases rightKind : right.selection.kind with
      | child =>
          have different := scopeCreation_independent_child_keys _ _ _ _ _ _ separated leftKind rightKind
          have counters := setScopeActivationCount_commutes left.selection.created.id.definitionScopeId
            right.selection.created.id.definitionScopeId left.selection.created.id.activation
            right.selection.created.id.activation (Ne.symm different) state.scopeActivations scopeOrder
          simp only [InternalScopeCreationSelection.apply, leftKind, rightKind]
          congr 1
      | called record =>
          simp only [InternalScopeCreationSelection.apply, leftKind, rightKind]
          congr 1
  | called leftRecord =>
      cases rightKind : right.selection.kind with
      | child =>
          simp only [InternalScopeCreationSelection.apply, leftKind, rightKind]
          congr 1
      | called rightRecord =>
          have different := scopeCreation_independent_call_keys _ _ _ _ _ _ separated
            leftRecord rightRecord leftKind rightKind
          have counterKeys : (⟨leftRecord.id.elementId.value⟩ : NodeId) ≠
              ⟨rightRecord.id.elementId.value⟩ := by
            intro equal
            exact different (congrArg NodeId.value equal).symm
          have counters := setCallActivationCount_commutes ⟨leftRecord.id.elementId.value⟩
            ⟨rightRecord.id.elementId.value⟩ leftRecord.id.activation rightRecord.id.activation
            counterKeys state callOrder
          have associations := scopeCreation_selection_call_associations state leftOperation
            left.selection leftRecord leftSelection leftKind
          have leftAssociations := prepareInternalScopeCreation_preserves_callAssociations
            program state leftOperation left programWF associations leftFound
          have finalAssociations := prepareInternalScopeCreation_preserves_callAssociations
            program (left.selection.apply state) rightOperation right programWF leftAssociations frames.2
          have calls := canonical_callRecords_eq_of_perm
            (right.selection.apply (left.selection.apply state))
            (sortCallRecords (leftRecord :: sortCallRecords (rightRecord :: state.calledProcessOccurrences)))
            finalAssociations (by simpa [InternalScopeCreationSelection.apply, leftKind, rightKind]
              using (orderedBy_sortCallRecords
                (rightRecord :: sortCallRecords (leftRecord :: state.calledProcessOccurrences))))
            (orderedBy_sortCallRecords _)
            (by simpa [InternalScopeCreationSelection.apply, leftKind, rightKind]
              using call_sort_pair_perm state.calledProcessOccurrences leftRecord rightRecord)
          simp only [InternalScopeCreationSelection.apply, leftKind, rightKind] at calls ⊢
          congr 1
  all_goals first | exact tokens | exact scopes | exact counters | exact calls

/-- Both complete preparations and every intermediate/final validity result follow from the
predecessor hypotheses; neither final-state equality nor successor validity is assumed. -/
theorem prepared_scope_creation_pair_complete
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalScopeCreation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalScopeCreation? program (right.selection.apply state) leftOperation = some left ∧
    prepareInternalScopeCreation? program (left.selection.apply state) rightOperation = some right ∧
    runtimeStateWellFormed program instanceId (left.selection.apply state) = true ∧
    runtimeStateWellFormed program instanceId (right.selection.apply state) = true ∧
    runtimeStateWellFormed program instanceId
      (right.selection.apply (left.selection.apply state)) = true ∧
    runtimeStateWellFormed program instanceId
      (left.selection.apply (right.selection.apply state)) = true ∧
    right.selection.apply (left.selection.apply state) =
      left.selection.apply (right.selection.apply state) := by
  have frames := prepared_scope_creation_pair_preserves_preparation program instanceId state
    leftOperation rightOperation left right programWF stateWF leftFound rightFound separated
  have leftValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    program instanceId state leftOperation left programWF stateWF leftFound
  have rightValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    program instanceId state rightOperation right programWF stateWF rightFound
  exact ⟨frames.1, frames.2, leftValid, rightValid,
    prepareInternalScopeCreation_preserves_runtimeStateWellFormed program instanceId
      (left.selection.apply state) rightOperation right programWF leftValid frames.2,
    prepareInternalScopeCreation_preserves_runtimeStateWellFormed program instanceId
      (right.selection.apply state) leftOperation left programWF rightValid frames.1,
    prepared_scope_creation_pair_commutes program instanceId state leftOperation rightOperation
      left right programWF stateWF leftFound rightFound separated⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
