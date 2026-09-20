import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra
import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleSelection

/-! Actual Terminate position publication follows from predecessor region selection and
the existing evaluator's removal fields. Successor validity is derived from the selected step.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalSelection_terminate_owner (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (definition : DefinitionScopeId)
    (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state (.terminateScope id origin input definition) = some selected) :
    selectedTerminateOwner? program state id origin input definition = some selected.root.id ∧
      selected.kind = .terminating := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · next root census =>
      cases found
      have identity := scope_identity_of_census state owner root census
      exact ⟨by simpa only [identity] using owned, rfl⟩
  · contradiction

theorem terminateScopeState_regional_position_delta (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (definition : DefinitionScopeId) (owner : ScopeOccurrenceId)
    (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (selected : selectedTerminateOwner? program before id origin input definition = some owner)
    (derived : deriveInternalOccurrenceRegion? before owner = some region)
    (result : terminateScopeState? program before id origin input definition = some after) :
    controlPositionDelta? program hosting before after = some
      { consumedTokens := (projectTokens program before.tokens).filter fun token => region.contains token.owner
        producedTokens := [], enteredScopes := []
        exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope =>
          region.contains scope.id && scope.id != owner } := by
  have afterValid := terminateScopeState_preserves_position program before after hosting id origin input definition valid result
  have tokens := cancelScopeSubtree_tokens_eq_prepared_region program before hosting hosting valid running owner region derived .retain
  have scopes := cancelScopeSubtree_scopes_eq_prepared_region program before hosting hosting valid running owner region derived .retain
  have tokenDelta := projectTokens_filter_differences program before.tokens (fun candidate => !region.contains candidate)
  have scopeDelta := projectScopes_filter_differences program before.scopeOccurrences
    (fun candidate => decide (candidate = owner) || !region.contains candidate)
  unfold terminateScopeState? at result
  rw [selected] at result
  cases result
  simp only [controlPositionDelta?, projectControlPosition?, valid, afterValid, ↓reduceIte,
    Option.bind_eq_bind, Option.bind_some, pure, Pure.pure]
  change some (α := PublicControlPositionDelta)
      { consumedTokens := tokenDifference (projectTokens program before.tokens)
          (projectTokens program (cancelScopeSubtree before owner .retain).tokens)
        producedTokens := tokenDifference (projectTokens program (cancelScopeSubtree before owner .retain).tokens)
          (projectTokens program before.tokens)
        enteredScopes := scopeDifference (projectScopes program (cancelScopeSubtree before owner .retain).scopeOccurrences)
          (projectScopes program before.scopeOccurrences)
        exitedScopes := scopeDifference (projectScopes program before.scopeOccurrences)
          (projectScopes program (cancelScopeSubtree before owner .retain).scopeOccurrences) } = _
  rw [tokens, scopes, tokenDelta.1, tokenDelta.2, scopeDelta.1, scopeDelta.2]
  congr 2
  · apply List.filter_congr
    intro position member
    simp
  · apply List.filter_congr
    intro position member
    apply Bool.eq_iff_iff.mpr
    simp [and_comm]

theorem preparedTerminate_position_delta (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (definition : DefinitionScopeId)
    (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before (.terminateScope id origin input definition) = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨selected, kind⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selection
  have operation := regionalSelection_operation program before _ prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, running, projected, _,
    positioned, _, template⟩ :=
      regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have runningState : before.control = .running hosting := by
    unfold runningInstance? at running
    split at running
    · cases running; assumption
    · contradiction
  have valid : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  have positionsExact : positions =
      { controlTokens := projectTokens program before.tokens, scopes := projectScopes program before.scopeOccurrences } := by
    simpa [projectControlPosition?, valid] using projected.symm
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : terminateScopeState? program before id origin input definition = some after := by
    simp only [fire?, snapshots] at fired
    change terminateScopeState? program before id origin input definition = some after at fired
    exact fired
  have actual := terminateScopeState_regional_position_delta program before after hosting id origin input definition
    prepared.selection.root.id prepared.region valid runningState selected derived result
  refine ⟨hosting, after, runningState, applied, ?_⟩
  rw [actual, template]
  simp only [regionalPositionDelta?, operation, kind, positionsExact, Option.some.injEq] at positioned
  rw [← positioned]
  congr 2
  rw [List.filter_filter]
  apply List.filter_congr
  intro scope member
  exact Bool.and_comm _ _

end BpmnSemantics.SemanticProcess.InternalCommutation
