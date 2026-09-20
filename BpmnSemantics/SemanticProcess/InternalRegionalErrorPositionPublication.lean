import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra
import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleSelection
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts

/-! Error publication follows the actual child cancellation and parent continuation.
The parent lies outside the derived region, including when its output bucket is populated.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regionalChild_parent_outside (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (member : root ∈ before.scopeOccurrences) (parentEq : root.parent = some parent)
    (derived : deriveInternalOccurrenceRegion? before root.id = some region) :
    region.contains parent = false := by
  have mask := regional_cancellation_full_owner_mask program before hosting hosting valid running
    root.id region derived parent
  rw [calledInstanceClosure_child_empty program before hosting hosting valid running root member
    (by simp [parentEq]), runtimePositionValid_parent_outside_child_subtree program before hosting hosting
      valid running root member parent parentEq] at mask
  simpa using mask.symm

theorem interruptScope_regional_position_delta (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (output : ControlPlaceId) (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (member : root ∈ before.scopeOccurrences) (parentEq : root.parent = some parent)
    (derived : deriveInternalOccurrenceRegion? before root.id = some region)
    (declared : ∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [place])
    (binding : program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = output)) =
      [{ controlPlaceId := output, scopeId := parent.definitionScopeId }]) :
    controlPositionDelta? program hosting before (interruptScope before root.id parent output) = some
      { consumedTokens := (projectTokens program before.tokens).filter fun token => region.contains token.owner
        producedTokens := [{ sequenceFlowId := tokenOrigin program { placeId := output, owner := parent }
                             owner := parent, multiplicity := 1 }]
        enteredScopes := []
        exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope => region.contains scope.id } := by
  have afterValid := interruptScope_preserves_position program before hosting hosting root parent output
    valid running member parentEq declared binding
  have outside := regionalChild_parent_outside program before hosting root parent region valid running member parentEq derived
  have tokens := cancelScopeSubtree_tokens_eq_prepared_region program before hosting hosting valid running root.id region derived .remove
  have scopes := cancelScopeSubtree_scopes_eq_prepared_region program before hosting hosting valid running root.id region derived .remove
  have tokenDelta := projectTokens_regional_continuation_differences program before.tokens
    (fun candidate => !region.contains candidate) output parent (by simp [outside])
  have scopeDelta := projectScopes_filter_differences program before.scopeOccurrences (fun candidate => !region.contains candidate)
  simp only [controlPositionDelta?, projectControlPosition?, valid, afterValid, ↓reduceIte,
    Option.bind_eq_bind, Option.bind_some, pure, Pure.pure]
  change some (α := PublicControlPositionDelta)
      { consumedTokens := tokenDifference (projectTokens program before.tokens)
          (projectTokens program (addToken (cancelScopeSubtree before root.id .remove).tokens output parent))
        producedTokens := tokenDifference
          (projectTokens program (addToken (cancelScopeSubtree before root.id .remove).tokens output parent))
          (projectTokens program before.tokens)
        enteredScopes := scopeDifference (projectScopes program (cancelScopeSubtree before root.id .remove).scopeOccurrences)
          (projectScopes program before.scopeOccurrences)
        exitedScopes := scopeDifference (projectScopes program before.scopeOccurrences)
          (projectScopes program (cancelScopeSubtree before root.id .remove).scopeOccurrences) } = _
  rw [tokens, scopes, tokenDelta.1, tokenDelta.2, scopeDelta.1, scopeDelta.2]
  simp

theorem regionalSelection_error_execution (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program before (.throwError id origin input error handler) = some selected)
    (result : throwErrorState? before input error handler = some after) :
    ∃ parent, selected.kind = .interrupting parent ∧ selected.root.parent = some parent ∧
      after = interruptScope before selected.root.id parent handler.output := by
  unfold selectInternalRegional? at found
  obtain ⟨hosting, running, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · split at found
    · contradiction
    · rename_i matching
      split at found
      · next root census =>
          obtain ⟨parent, parentEq, found⟩ := Option.bind_eq_some_iff.mp found
          split at found
          · cases found
            have identity := scope_identity_of_census before owner root census
            refine ⟨parent, rfl, parentEq, ?_⟩
            unfold throwErrorState? at result
            simp only [owned, running, Option.bind_eq_bind, Option.bind_some, if_neg matching,
              census, parentEq] at result
            split at result
            · simpa only [Option.some.injEq, identity] using result.symm
            · contradiction
          · contradiction
      · contradiction

theorem preparedError_position_delta (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before (.throwError id origin input error handler) = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have operation := regionalSelection_operation program before _ prepared.selection selection
  have member := regionalSelection_root_member program before _ prepared.selection selection
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
  have result : throwErrorState? before input error handler = some after := by
    simp only [fire?, snapshots] at fired
    change throwErrorState? before input error handler = some after at fired
    exact fired
  obtain ⟨parent, kind, parentEq, actual⟩ :=
    regionalSelection_error_execution program before after id origin input error handler prepared.selection selection result
  simp only [regionalPositionDelta?, operation, kind, positionsExact] at positioned
  obtain ⟨produced, output, positioned⟩ := Option.bind_eq_some_iff.mp positioned
  unfold regionalOutputPosition? at output
  obtain ⟨outputOrigin, originFound, output⟩ := Option.bind_eq_some_iff.mp output
  have selectedOrigin := internalLocalControlPlaceOrigin?_selectedInputOrigin program handler.output parent outputOrigin originFound
  obtain ⟨declared, binding⟩ := selectedInputOrigin?_exact_bindings program handler.output parent outputOrigin selectedOrigin
  have originExact := internalLocalControlPlaceOrigin?_tokenOrigin program handler.output parent outputOrigin originFound
  have position := interruptScope_regional_position_delta program before hosting prepared.selection.root parent handler.output
    prepared.region valid runningState member parentEq derived declared binding
  refine ⟨hosting, after, runningState, applied, ?_⟩
  rw [actual, position, template]
  cases output
  cases positioned
  simp only [originExact]

end BpmnSemantics.SemanticProcess.InternalCommutation
