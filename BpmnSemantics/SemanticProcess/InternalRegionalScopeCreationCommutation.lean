import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationFrame
import BpmnSemantics.SemanticProcess.InternalScopeCreationRegionalFrame
import BpmnSemantics.SemanticProcess.InternalScopeCreationRegionalAlgebra
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationAcceptance

/-! The complete regional/scope-creation outcome derives both preparations and opposite executions from predecessor facts. Collection algebra supplies literal canonical state equality; the existing publication acceptance laws then apply to all four actual steps. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem creation_regional_no_control_write
    (regional : PreparedInternalRegional) (creation : InternalScopeCreationSelection)
    (hosting : SemanticId) (ownerRecord : RuntimeScopeOccurrence)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.owner (internalScopeCreationStateFootprint creation hosting ownerRecord)) = true) :
    .ordinary (.runtimeControl hosting) ∉ regional.footprint.writes := by
  apply regional_pair_read_key_not_written _ _ independent
  exact List.mem_map.mpr ⟨.runtimeControl hosting,
    by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy], rfl⟩

private theorem creation_regional_owner_masks (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true)
    (owner : ScopeOccurrenceId)
    (live : owner ∈ (creation.selection.apply state).scopeOccurrences.map (·.id))
    (outside : regional.region.contains owner = false) :
    (occurrenceInSubtree state.scopeOccurrences regional.selection.root.id owner ||
      (calledInstanceClosure state regional.selection.root.id).contains owner.processInstanceId) = false ∧
    (regional.selection.root.parent = none →
      (processInstanceClosureWithin state.calledProcessOccurrences [regional.selection.root.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains owner.processInstanceId = false) := by
  have classifiers := preparedScopeCreation_regional_classifiers program state operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  have afterRegion := prepareInternalRegional_region_after_independent_scopeCreation program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have afterSelected := selectInternalRegional_after_independent_scopeCreation program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId
    state creationOperation creation programValid valid creationFound
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    _, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at afterValid afterRegion afterSelected classifiers live ⊢
  have position : runtimePositionValid program hosting (selected.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have afterRunning := (scopeCreation_apply_control state selected).trans running
  constructor
  · have mask := (regional_cancellation_mask program (selected.apply state) hosting hosting position afterRunning
      regional.selection.root.id regional.region afterRegion owner live).symm.trans outside
    simpa only [classifiers.1, classifiers.2.1] using mask
  · intro parentless
    have mask := (regional_called_tree_mask program (selected.apply state) hosting hosting position afterRunning
      regional.selection.root regional.region afterRegion
      (regionalSelection_root_member program _ operation regional.selection afterSelected) parentless owner live).trans outside
    simpa only [classifiers.2.2 parentless] using mask

private theorem regional_scope_creation_successors_equal (program : Program) (before after afterCreation : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (creationFound : prepareInternalScopeCreation? program before creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (creationApplied : applyPreparedInternalRegional? program (creation.selection.apply before) regional = some afterCreation) :
    afterCreation = creation.selection.apply after := by
  have frame := prepareInternalRegional_after_independent_scopeCreation program before operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have creationValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId
    before creationOperation creation programValid valid creationFound
  have classifiers := preparedScopeCreation_regional_classifiers program before operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  have masks := creation_regional_owner_masks program before operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, ownerExact, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program before creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at valid independent creationValid frame classifiers masks creationApplied ⊢
  have facts := prepareInternalRegional_facts program before operation regional regionalFound
  have regionalSelected := (ownershipClosedSelection_facts program before operation regional.selection facts.2.2.2.1).1
  have noControl := creation_regional_no_control_write regional selected hosting ownerRecord independent
  have afterRunning := (preparedRegional_control_preserved_of_no_write program before after hosting operation regional
    valid running regionalFound applied noControl).trans running
  have creationRunning := (scopeCreation_apply_control before selected).trans running
  have finalRunning := (preparedRegional_control_preserved_of_no_write program (selected.apply before) afterCreation hosting
    operation regional creationValid creationRunning frame creationApplied noControl).trans creationRunning
  have update := preparedRegional_execution_fields program before after hosting operation regional
    valid running afterRunning regionalFound applied
  have creationUpdate := preparedRegional_execution_fields program (selected.apply before) afterCreation hosting operation regional
    creationValid creationRunning finalRunning frame creationApplied
  have outside := scopeCreation_regional_outside before regional.selection regional.region regional.footprint
    selected hosting ownerRecord facts.2.2.2.2.2.1 independent
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program hosting before valid
  have scopeOrder : orderedBy scopeOccurrenceBefore before.scopeOccurrences = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
    simp_all only
  have createdLive : selected.created.id ∈ (selected.apply before).scopeOccurrences.map (·.id) := by
    apply List.mem_map.mpr
    refine ⟨selected.created, ?_, rfl⟩
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals exact (mem_insertScopeOccurrence _ _ _).mpr (.inl rfl)
  have newMask := masks selected.created.id createdLive outside.2.1
  have callerLive : selected.owner ∈ (selected.apply before).scopeOccurrences.map (·.id) := by
    have identity := scope_identity_of_census before selected.owner ownerRecord ownerExact
    have member : ownerRecord ∈ before.scopeOccurrences := by
      apply (List.mem_filter.mp (show ownerRecord ∈ before.scopeOccurrences.filter
        (fun scope => decide (scope.id = selected.owner)) by rw [ownerExact]; simp)).1
    apply List.mem_map.mpr
    refine ⟨ownerRecord, ?_, identity⟩
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals exact (mem_insertScopeOccurrence _ _ _).mpr (.inr member)
  have callerMask := masks selected.owner callerLive outside.1
  have different : selected.created.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec before _ _ facts.2.2.2.2.1).2.1
    simp [same, inside] at outside
  have fields : { afterCreation with tokens := [], endOccurrences := 0 } =
      { selected.apply after with tokens := [], endOccurrences := 0 } := by
    cases operation with
    | returnProcess id origin process definition output =>
        cases kind : regional.selection.kind <;> simp only [kind] at update creationUpdate <;> try contradiction
        rename_i record
        obtain ⟨rootId, parentless⟩ := regionalSelection_return_root program before _ regional.selection record regionalSelected kind
        have closure := classifiers.2.2 parentless
        have newOutside := newMask.2 parentless
        have callerOutside := callerMask.2 parentless
        simp only [rootId] at closure newOutside callerOutside
        have returnedMember := returning_record_member program before _ regional.selection record regionalSelected kind
        have callsKept (inserted : CalledProcessOccurrence) (called : selected.kind = .called inserted) :
            (decide (inserted.id ≠ record.id) &&
              !(processInstanceClosureWithin before.calledProcessOccurrences [record.calledRoot.processInstanceId]
                (before.calledProcessOccurrences.length + 1)).contains inserted.caller.processInstanceId &&
              !(processInstanceClosureWithin before.calledProcessOccurrences [record.calledRoot.processInstanceId]
                (before.calledProcessOccurrences.length + 1)).contains inserted.calledRoot.processInstanceId) = true := by
          have callFacts := scopeCreation_selection_call_facts before creationOperation selected inserted hosting running selection called
          have fresh := callFacts.2.2.2.2.2.2.2
          have distinct : inserted.id ≠ record.id := by
            intro same
            have absent := List.length_eq_zero_iff.mp fresh
            have member : record ∈ before.calledProcessOccurrences.filter
                (fun candidate => decide (candidate.id = inserted.id ||
                  candidate.calledRoot.processInstanceId = selected.created.id.processInstanceId)) := by
              simp [returnedMember, same]
            rw [absent] at member
            contradiction
          simp only [callFacts.2.1, ← callFacts.2.2.2.1,
            newOutside, callerOutside, Bool.not_false, Bool.and_true]
          exact decide_eq_true distinct
        rw [update, creationUpdate]
        have algebra := scopeCreation_return_fields_commute before selected record scopeOrder closure newOutside callsKept
        cases creationKind : selected.kind <;>
          simpa only [InternalScopeCreationSelection.apply, creationKind, setCallActivationCount] using algebra
    | completeScope id origin definition output =>
        cases kind : regional.selection.kind <;> simp only [kind] at update creationUpdate <;> try contradiction
        rename_i withdrawal
        cases parent : regional.selection.root.parent <;> cases output <;>
          simp only [parent] at update creationUpdate <;> try contradiction
        have scopes := filter_canonicalInsertBy_retained scopeOccurrenceBefore
          (fun a b c => scopeOwnerBefore_compose a.id b.id c.id)
          (fun scope : RuntimeScopeOccurrence => decide (scope.id ≠ regional.selection.root.id))
          selected.created before.scopeOccurrences scopeOrder (by simp [different])
        cases withdrawal <;> simp only at update creationUpdate
        all_goals rw [update, creationUpdate]
        all_goals cases creationKind : selected.kind <;>
          simp only [InternalScopeCreationSelection.apply, creationKind, insertScopeOccurrence, scopes, setCallActivationCount]
    | throwError id origin input error handler =>
        cases kind : regional.selection.kind <;> simp only [kind] at update creationUpdate <;> try contradiction
        rw [update, creationUpdate]
        have algebra := scopeCreation_cancellation_fields_commute before selected regional.selection.root.id .remove scopeOrder
          classifiers.1 classifiers.2.1 newMask.1 (by
            intro record called
            have callFacts := scopeCreation_selection_call_facts before creationOperation selected record hosting running selection called
            simpa only [callFacts.2.1, ← callFacts.2.2.2.1] using And.intro callerMask.1 newMask.1)
        cases creationKind : selected.kind <;>
          simpa only [interruptScope, InternalScopeCreationSelection.apply, creationKind, setCallActivationCount] using algebra
    | terminateScope id origin input definition =>
        cases kind : regional.selection.kind <;> simp only [kind] at update creationUpdate <;> try contradiction
        rw [update, creationUpdate]
        have algebra := scopeCreation_cancellation_fields_commute before selected regional.selection.root.id .retain scopeOrder
          classifiers.1 classifiers.2.1 newMask.1 (by
            intro record called
            have callFacts := scopeCreation_selection_call_facts before creationOperation selected record hosting running selection called
            simpa only [callFacts.2.1, ← callFacts.2.2.2.1] using And.intro callerMask.1 newMask.1)
        cases creationKind : selected.kind <;>
          simpa only [InternalScopeCreationSelection.apply, creationKind, setCallActivationCount] using algebra
    | _ => simp at update
  obtain ⟨keep, outputs, owner, retained, writes, action⟩ := preparedRegional_token_action program before hosting operation
    regional valid running regionalFound
  have continuation (output : ControlPlaceId) (member : output ∈ outputs) :
      ({ placeId := output, owner } : ControlToken) ≠ { placeId := selected.input, owner := selected.owner } := by
    intro same
    have lifted : .ordinary (.controlToken selected.owner selected.input) ∈
        (liftRegionalStateFootprint selected.owner (internalScopeCreationStateFootprint selected hosting ownerRecord)).writes :=
      List.mem_map.mpr ⟨_, scopeCreation_token_write selected hosting ownerRecord
        { placeId := selected.input, owner := selected.owner } (by simp), rfl⟩
    have conflict := regional_independent_write_write _ _ independent _ _ (writes output member) lifted
    have equalities := ControlToken.mk.inj same
    simp [regionalStateAtomsConflict, equalities.1, equalities.2] at conflict
  have tokens : afterCreation.tokens = (selected.apply after).tokens := by
    rw [action (selected.apply before) afterCreation creationValid creationRunning finalRunning frame creationApplied]
    have afterTokens := action before after valid running afterRunning regionalFound applied
    cases creationKind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, creationKind, afterTokens]
    all_goals
      exact scopeCreation_regional_tokens_commute before.tokens selected keep outputs owner
        (canonicalCollectionOrder_tokens before canonical) (retained _ outside.2.1) continuation
  have count := preparedRegional_end_count program before after hosting operation regional valid running afterRunning regionalFound applied
  have creationCount := preparedRegional_end_count program (selected.apply before) afterCreation hosting operation regional
    creationValid creationRunning finalRunning frame creationApplied
  have endCount : afterCreation.endOccurrences = (selected.apply after).endOccurrences := by
    rw [creationCount]
    cases creationKind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, creationKind, count]
  have equal := congrArg (fun state : RuntimeState =>
    { state with tokens := afterCreation.tokens, endOccurrences := afterCreation.endOccurrences }) fields
  change afterCreation = { selected.apply after with tokens := afterCreation.tokens, endOccurrences := afterCreation.endOccurrences } at equal
  rw [tokens, endCount] at equal
  exact equal

/-- Both complete preparations survive, both orders execute to the same canonical state, and all three successor states remain valid. -/
theorem prepared_regional_scope_creation_pair_commutes (program : Program) (before : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (creationFound : prepareInternalScopeCreation? program before creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    prepareInternalRegional? program (creation.selection.apply before) operation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalScopeCreation? program afterRegional creationOperation = some creation ∧
        applyPreparedInternalRegional? program (creation.selection.apply before) regional =
          some (creation.selection.apply afterRegional) ∧
        applyPreparedInternalScopeCreation? program before creation = some (creation.selection.apply before) ∧
        applyPreparedInternalScopeCreation? program afterRegional creation = some (creation.selection.apply afterRegional) ∧
        runtimeStateWellFormed program creation.runtimeInstanceId afterRegional = true ∧
        runtimeStateWellFormed program creation.runtimeInstanceId (creation.selection.apply before) = true ∧
        runtimeStateWellFormed program creation.runtimeInstanceId (creation.selection.apply afterRegional) = true := by
  have frame := prepareInternalRegional_after_independent_scopeCreation program before operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  obtain ⟨afterRegional, applied, afterValid⟩ := preparedRegional_preserves_runtimeStateWellFormed program before
    creation.runtimeInstanceId operation regional valid regionalFound
  have creationFrame := prepareInternalScopeCreation_after_independent_regional program before afterRegional operation
    creationOperation regional creation valid regionalFound creationFound independent applied
  obtain ⟨afterCreation, _, creationApplied⟩ := prepareInternalRegional_executes program (creation.selection.apply before)
    operation regional frame
  have same := regional_scope_creation_successors_equal program before afterRegional afterCreation operation creationOperation
    regional creation programValid valid regionalFound creationFound independent applied creationApplied
  exact ⟨frame, afterRegional, applied, creationFrame, by simpa only [same] using creationApplied,
    applyPreparedInternalScopeCreation_of_preparation program before creationOperation creation creationFound,
    applyPreparedInternalScopeCreation_of_preparation program afterRegional creationOperation creation creationFrame,
    afterValid,
    prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId before
      creationOperation creation programValid valid creationFound,
    prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId afterRegional
      creationOperation creation programValid afterValid creationFrame⟩

/-- Actual execution accepts the same per-operation publication at each assigned index in either order. The common state and intermediate validity are consequences of the predecessor preparations. -/
theorem prepared_regional_scope_creation_pair_execution_publication (program : Program) (before : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (commandId : SemanticId) (regionalIndex creationIndex : Nat)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before operation = some regional)
    (creationFound : prepareInternalScopeCreation? program before creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    prepareInternalRegional? program (creation.selection.apply before) operation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalScopeCreation? program afterRegional creationOperation = some creation ∧
        applyPreparedInternalRegional? program (creation.selection.apply before) regional =
          some (creation.selection.apply afterRegional) ∧
        fire? program creationOperation before = some (creation.selection.apply before) ∧
        fire? program creationOperation afterRegional = some (creation.selection.apply afterRegional) ∧
        RegionalExecutionPublication program before afterRegional operation regional
          creation.runtimeInstanceId commandId regionalIndex ∧
        RegionalExecutionPublication program (creation.selection.apply before) (creation.selection.apply afterRegional)
          operation regional creation.runtimeInstanceId commandId regionalIndex ∧
        actualInternalTransitionPublication? program creation.runtimeInstanceId before (creation.selection.apply before)
          creationOperation commandId creationIndex =
            some ((internalScopeCreationPublicationTemplate creation).instantiate commandId creationIndex) ∧
        actualInternalTransitionPublication? program creation.runtimeInstanceId afterRegional (creation.selection.apply afterRegional)
          creationOperation commandId creationIndex =
            some ((internalScopeCreationPublicationTemplate creation).instantiate commandId creationIndex) := by
  obtain ⟨frame, afterRegional, applied, creationFrame, commute, _, _, afterValid, creationValid, _⟩ :=
    prepared_regional_scope_creation_pair_commutes program before operation creationOperation regional creation
      programValid valid regionalFound creationFound independent
  obtain ⟨publishedAfter, publishedApplied, firstRegional⟩ := prepareInternalRegional_execution_publication program before
    operation regional creation.runtimeInstanceId commandId regionalIndex programValid valid regionalFound
  have same : publishedAfter = afterRegional := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  obtain ⟨final, finalApplied, secondRegional⟩ := prepareInternalRegional_execution_publication program (creation.selection.apply before)
    operation regional creation.runtimeInstanceId commandId regionalIndex programValid creationValid frame
  have finalEq : final = creation.selection.apply afterRegional := Option.some.inj (finalApplied.symm.trans commute)
  subst final
  obtain ⟨_, _, beforeProjection, afterProjection, _⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before afterRegional operation
      commandId regionalIndex _ firstRegional.lifecycle
  have operationEq := (prepareInternalScopeCreation_operation program before creationOperation creation creationFound).1
  have beforeFound : prepareInternalScopeCreation? program before creation.selection.operation = some creation := by
    simpa only [operationEq] using creationFound
  have afterFound : prepareInternalScopeCreation? program afterRegional creation.selection.operation = some creation := by
    simpa only [operationEq] using creationFrame
  have firstCreation := prepared_scope_creation_publication_template_accepted program before creation creation.runtimeInstanceId
    commandId creationIndex programValid valid (by simp [beforeProjection]) beforeFound
  have secondCreation := prepared_scope_creation_publication_template_accepted program afterRegional creation creation.runtimeInstanceId
    commandId creationIndex programValid afterValid (by simp [afterProjection]) afterFound
  rw [operationEq] at firstCreation secondCreation
  exact ⟨frame, afterRegional, applied, creationFrame, commute,
    prepareInternalScopeCreation_refines program before creationOperation creation creationFound,
    prepareInternalScopeCreation_refines program afterRegional creationOperation creation creationFrame,
    firstRegional, secondRegional, firstCreation, secondCreation⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
