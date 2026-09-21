import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationOwnership
import BpmnSemantics.SemanticProcess.InternalRegionalPairPublicationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalArmingPublicationFrame

/-! Complete regional preparation survives independent scope creation with the same selected region, dependencies, and publication payload. The new projected start is excluded by the original region; existing handler withdrawals retain their exact classifiers. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedScopeCreation_regional_outside (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regional.region.contains creation.selection.owner = false ∧
      regional.region.contains creation.selection.created.id = false ∧
      creation.selection.created.parent.any regional.region.contains = false ∧
      ∀ record, creation.selection.kind = .called record → regional.region.ownsCall record = false := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  exact scopeCreation_regional_outside state regional.selection regional.region regional.footprint selected
    hosting ownerRecord (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.2.1 independent

theorem preparedScopeCreation_regional_queries (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    (creation.selection.apply state).tokens.filter (fun token => regional.region.contains token.owner) =
        state.tokens.filter (fun token => regional.region.contains token.owner) ∧
      (creation.selection.apply state).scopeOccurrences.filter (fun scope => regional.region.contains scope.id) =
        state.scopeOccurrences.filter (fun scope => regional.region.contains scope.id) ∧
      (creation.selection.apply state).scopeOccurrences.filter (fun scope => scope.id == regional.selection.root.id) =
        state.scopeOccurrences.filter (fun scope => scope.id == regional.selection.root.id) := by
  have outside := preparedScopeCreation_regional_outside program state operation creationOperation regional creation
    regionalFound creationFound independent
  have derived := (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.1
  have different : creation.selection.created.id ≠ regional.selection.root.id := by
    intro same
    have inside : regional.region.contains regional.selection.root.id = true :=
      List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
    simp [same, inside] at outside
  exact ⟨scopeCreation_apply_token_filter state creation.selection _ outside.1 outside.2.1,
    scopeCreation_apply_scope_filter state creation.selection _ outside.2.1,
    scopeCreation_apply_scope_filter state creation.selection _ (by simpa using different)⟩

theorem regionalStateFootprint_after_independent_scopeCreation (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regionalStateFootprint? (creation.selection.apply state) regional.selection regional.region = some regional.footprint := by
  have footprint := (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.2.1
  have retention := (preparedScopeCreation_regional_retention program state operation creationOperation regional creation
    programValid valid regionalFound creationFound independent).1
  have queries := preparedScopeCreation_regional_queries program state operation creationOperation regional creation
    regionalFound creationFound independent
  have activities : regionalWithdrawnActivityWrites (creation.selection.apply state) regional.selection =
      regionalWithdrawnActivityWrites state regional.selection := by
    unfold regionalWithdrawnActivityWrites
    rw [retention]
    cases kind : creation.selection.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have branches : (creation.selection.apply state).selectedBranchSets = state.selectedBranchSets := by
    cases kind : creation.selection.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have base (hosting : SemanticId) : regionalBaseFootprint? (creation.selection.apply state) hosting regional.selection regional.region =
      regionalBaseFootprint? state hosting regional.selection regional.region := by
    unfold regionalBaseFootprint? regionalCensusWrites
    rw [queries.1, branches]
  simpa only [regionalStateFootprint?, runningInstance?, scopeCreation_apply_control, base, activities] using footprint

private theorem creation_start_outside (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (creation : PreparedInternalScopeCreation)
    (region : InternalOccurrenceRegion) (entry : OpenSemanticFlowNodeOccurrence)
    (found : prepareInternalScopeCreation? program state operation = some creation)
    (started : (match creation.selection.kind with
      | .child => scopeStart? program (creation.selection.apply state) creation.selection.created
      | .called record => callStart? program (creation.selection.apply state) record) = some entry)
    (outside : region.contains creation.selection.owner = false ∧ region.contains creation.selection.created.id = false)
    (retainRoot : Bool) : regionalCancelsOpenOccurrence program state region retainRoot entry = false := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation creation found
  dsimp only [makeInternalScopeCreationPreparation] at started outside
  cases kind : selected.kind with
  | child =>
      have parent := (scopeCreation_selection_child_facts state operation selected hosting running selection kind).2.2.1
      simp only [kind, scopeStart?, parent, Option.bind_eq_bind, Option.bind_some] at started
      obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
      split at started
      · cases started
        simp only [regionalCancelsOpenOccurrence, outside.1, outside.2, Bool.false_or, Bool.and_false]
      · contradiction
  | called record =>
      have caller := (scopeCreation_selection_call_facts state operation selected record hosting running selection kind).2.1
      simp only [kind, callStart?, Option.bind_eq_bind] at started
      obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
      cases started
      simpa only [regionalCancelsOpenOccurrence, caller] using outside.1

private theorem handler_frame (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true)
    (id : OccurrenceId) :
    scopeCancellationWithdrawsHandler program (creation.selection.apply state) regional.region.root id =
      scopeCancellationWithdrawsHandler program state regional.region.root id := by
  have classifiers := preparedScopeCreation_regional_classifiers program state operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  have root := (deriveInternalOccurrenceRegion_spec state _ _
    (prepareInternalRegional_facts program state operation regional regionalFound).2.2.2.2.1).1
  have excluded := prepareInternalScopeCreation_excludes_bounded_entry program state creationOperation creation
  have classification := fun timer => scopeCreation_boundary_timer_frame program state creation.selection timer
    (fun id origin input entry definition boundary member =>
      excluded id origin input entry definition boundary programValid creationFound member)
  simp only [scopeCancellationWithdrawsHandler, root, classifiers.1, classifiers.2.1, classification]
  cases kind : creation.selection.kind <;> simp only [InternalScopeCreationSelection.apply, kind]

theorem regionalPositionDelta_after_independent_scopeCreation (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regionalPositionDelta? program regional.selection regional.region
        { controlTokens := projectTokens program (creation.selection.apply state).tokens,
          scopes := projectScopes program (creation.selection.apply state).scopeOccurrences } =
      regionalPositionDelta? program regional.selection regional.region
        { controlTokens := projectTokens program state.tokens, scopes := projectScopes program state.scopeOccurrences } := by
  have queries := preparedScopeCreation_regional_queries program state operation creationOperation regional creation
    regionalFound creationFound independent
  have tokens : (projectTokens program (creation.selection.apply state).tokens).filter (fun token => regional.region.contains token.owner) =
      (projectTokens program state.tokens).filter (fun token => regional.region.contains token.owner) := by
    rw [← projectTokens_filter_by_owner, ← projectTokens_filter_by_owner, queries.1]
  have scopes : (projectScopes program (creation.selection.apply state).scopeOccurrences).filter (fun scope => regional.region.contains scope.id) =
      (projectScopes program state.scopeOccurrences).filter (fun scope => regional.region.contains scope.id) := by
    rw [← projectScopes_filter_by_id, ← projectScopes_filter_by_id, queries.2.1]
  have rootScopes : (projectScopes program (creation.selection.apply state).scopeOccurrences).filter
        (fun scope => scope.id == regional.selection.root.id) =
      (projectScopes program state.scopeOccurrences).filter (fun scope => scope.id == regional.selection.root.id) := by
    rw [← projectScopes_filter_by_id program _ (fun id => id == regional.selection.root.id),
      ← projectScopes_filter_by_id program _ (fun id => id == regional.selection.root.id), queries.2.2]
  cases kind : regional.selection.kind with
  | completing withdrawal =>
      have nonroot := preparedScopeCreation_regional_nonroot program state operation creationOperation regional creation
        regionalFound creationFound independent withdrawal kind
      cases parent : regional.selection.root.parent with
      | none => exact False.elim (nonroot parent)
      | some owner =>
          cases op : regional.selection.operation <;> simp only [regionalPositionDelta?, op, kind, parent]
          split <;> first | contradiction | (rw [rootScopes]) | rfl
  | _ => cases op : regional.selection.operation <;> simp only [regionalPositionDelta?, op, kind, tokens, scopes]

theorem regionalPublicationTemplate_after_independent_scopeCreation (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    regionalPublicationTemplate? program (creation.selection.apply state) regional.selection regional.region =
      some regional.publicationTemplate := by
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have selected := (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).1
  have selectedAfter := selectInternalRegional_after_independent_scopeCreation program state operation creationOperation
    regional creation programValid valid regionalFound creationFound independent
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId
    state creationOperation creation programValid valid creationFound
  have afterPosition : runtimePositionValid program creation.runtimeInstanceId (creation.selection.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  obtain ⟨hosting, positions, current, delta, identities, ends, instanceFound, projected, opened,
    positioned, lifecycle, template⟩ := regionalPublicationTemplate_facts program state
      regional.selection regional.region regional.publicationTemplate facts.2.2.2.2.2.2
  have creationRunning : state.control = .running creation.runtimeInstanceId := by
    obtain ⟨_, _, _, _, _, _, _, _, running, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state creationOperation creation creationFound
    exact running
  have instanceEq : hosting = creation.runtimeInstanceId := by
    simpa [runningInstance?, creationRunning] using instanceFound.symm
  subst hosting
  obtain ⟨entry, created, openedAfter⟩ := prepared_scope_creation_open_projection program state creationOperation creation
    creation.runtimeInstanceId current programValid valid opened creationFound
  have allValidity := (projectOpenFlowNodeOccurrences_validities program state current creation.runtimeInstanceId creationRunning opened).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true, and_assoc] at allValidity
    exact allValidity.1
  obtain ⟨actualEntry, actualCreated, started⟩ := prepared_scope_creation_start_projects program state creationOperation creation
    programValid structural creationFound
  have same : actualEntry = entry := by
    have equality := congrArg UnnumberedFlowNodeOccurrenceDelta.started (actualCreated.symm.trans created)
    simpa using equality
  subst actualEntry
  have outside := preparedScopeCreation_regional_outside program state operation creationOperation regional creation
    regionalFound creationFound independent
  have handler := handler_frame program state operation creationOperation regional creation programValid valid
    regionalFound creationFound independent
  have cancellation (retainRoot : Bool) :
      regionalCancellationEnds program (creation.selection.apply state) regional.region retainRoot
          (sortFlowNodeOccurrenceStarts (entry :: current)) =
        regionalCancellationEnds program state regional.region retainRoot current := by
    have predicate : regionalCancelsOpenOccurrence program (creation.selection.apply state) regional.region retainRoot =
        regionalCancelsOpenOccurrence program state regional.region retainRoot := by
      funext value
      cases value.anchor <;> simp only [regionalCancelsOpenOccurrence, handler]
    simp only [regionalCancellationEnds, predicate]
    rw [sorted_open_insert_filter_rejected program state current entry _ opened
      (creation_start_outside program state creationOperation creation regional.region entry creationFound started
        ⟨outside.1, outside.2.1⟩ retainRoot)]
  have lifecycleFrame : regionalLifecycleTemplate? program (creation.selection.apply state) regional.selection regional.region
        (sortFlowNodeOccurrenceStarts (entry :: current)) =
      regionalLifecycleTemplate? program state regional.selection regional.region current := by
    cases kind : regional.selection.kind with
    | returning record =>
        exact regionalNonCancellingLifecycle_frame program state _ operation regional.selection regional.region
          current _ selected selectedAfter opened openedAfter (Or.inl ⟨record, kind⟩)
    | completing withdrawal =>
        exact regionalNonCancellingLifecycle_frame program state _ operation regional.selection regional.region
          current _ selected selectedAfter opened openedAfter (Or.inr ⟨withdrawal, kind⟩)
    | interrupting parent | terminating =>
        cases op : regional.selection.operation <;> simp only [regionalLifecycleTemplate?, op, kind, cancellation]
  have deltaFrame := regionalPositionDelta_after_independent_scopeCreation program state operation creationOperation
    regional creation regionalFound creationFound independent
  unfold projectControlPosition? at projected
  split at projected
  · cases projected
    rw [template]
    simp only [regionalPublicationTemplate?, runningInstance?, scopeCreation_apply_control, creationRunning,
      projectControlPosition?, afterPosition, ↓reduceIte, openedAfter, deltaFrame, positioned, lifecycleFrame,
      lifecycle, scopeCreation_apply_time, Option.bind_eq_bind, Option.bind_some]
    rfl
  · contradiction

/-- Reuse the literal complete regional artifact after independent scope creation; every successor guard and publication component is derived from the predecessor preparations. -/
theorem prepareInternalRegional_after_independent_scopeCreation (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    prepareInternalRegional? program (creation.selection.apply state) operation = some regional := by
  obtain ⟨snapshots, declared, time, _, _, _, _⟩ := prepareInternalRegional_facts program state operation regional regionalFound
  have selected := selectInternalRegional_after_independent_scopeCreation program state operation creationOperation regional creation
    programValid valid regionalFound creationFound independent
  obtain ⟨references, locals, owners⟩ := prepareInternalRegional_ownership_after_independent_scopeCreation
    program state operation creationOperation regional creation programValid valid regionalFound creationFound independent
  have closed := ownershipClosedSelection_accepts_closed_references program (creation.selection.apply state) operation
    regional.selection selected references locals owners
  exact prepareInternalRegional_of_components program (creation.selection.apply state) operation regional.selection regional.region
    regional.footprint regional.publicationTemplate snapshots declared (by rwa [scopeCreation_apply_time]) closed
    (prepareInternalRegional_region_after_independent_scopeCreation program state operation creationOperation regional creation
      programValid valid regionalFound creationFound independent)
    (regionalStateFootprint_after_independent_scopeCreation program state operation creationOperation regional creation
      programValid valid regionalFound creationFound independent)
    (regionalPublicationTemplate_after_independent_scopeCreation program state operation creationOperation regional creation
      programValid valid regionalFound creationFound independent)

end BpmnSemantics.SemanticProcess.InternalCommutation
