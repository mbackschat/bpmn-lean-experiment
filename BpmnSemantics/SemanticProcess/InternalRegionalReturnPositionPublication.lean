import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra
import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleSelection
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts

/-! Return publication binds the selected Call cleanup to the prepared occurrence region.
Quiescence protects the caller; continuation insertion preserves existing output multiplicity.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem returnProcessState_regional_position_delta (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (retained : CalledProcessOccurrence) (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (selected : before.calledProcessOccurrences.filter (fun candidate =>
      decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) = [retained])
    (derived : deriveInternalOccurrenceRegion? before retained.calledRoot = some region)
    (declared : ∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [place])
    (binding : program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = output)) =
      [{ controlPlaceId := output, scopeId := retained.caller.definitionScopeId }])
    (result : returnProcessState? before id origin process definition output = some after) :
    controlPositionDelta? program hosting before after = some
      { consumedTokens := (projectTokens program before.tokens).filter fun token => region.contains token.owner
        producedTokens := [{ sequenceFlowId := tokenOrigin program { placeId := output, owner := retained.caller }
                             owner := retained.caller, multiplicity := 1 }]
        enteredScopes := []
        exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope => region.contains scope.id } := by
  have continuation : ∀ record ∈ before.calledProcessOccurrences,
      record.returnOperationId = id → record.id.elementId.value = origin.elementId.value →
      program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = output)) =
        [{ controlPlaceId := output, scopeId := record.caller.definitionScopeId }] := by
    intro record member operation element
    have chosen : record ∈ before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
      simp [member, operation, element]
    rw [selected] at chosen
    simpa only [List.eq_of_mem_singleton chosen] using binding
  have afterValid := returnProcessState_preserves_position program before after hosting hosting id origin process definition
    output valid running declared continuation result
  have step := returnProcessState_sound before after id origin process definition output result
  cases step with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiescent =>
      have same : record = retained := by simpa using uniqueReturn.symm.trans selected
      subst record
      have recordMember : retained ∈ before.calledProcessOccurrences := by
        have member : retained ∈ before.calledProcessOccurrences.filter (fun candidate =>
            decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
          rw [selected]; simp
        exact (List.mem_filter.mp member).1
      have rootId := scope_identity_of_census before retained.calledRoot root uniqueRoot
      have rootMember : root ∈ before.scopeOccurrences := by
        have member : root ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate.id = retained.calledRoot)) := by
          rw [uniqueRoot]; simp
        exact (List.mem_filter.mp member).1
      have prepared : deriveInternalOccurrenceRegion? before root.id = some region := by simpa only [rootId] using derived
      have singleton := quiescent_prepared_region_singleton before root.id region prepared quiescent
      have different := quiescent_root_excludes_call_caller before hosting running associations root rootMember parentless
        quiescent retained recordMember
      have outside : region.contains retained.caller = false := by
        simp only [InternalOccurrenceRegion.contains, singleton, List.contains_cons, List.contains_nil, Bool.or_false,
          beq_eq_false_iff_ne]
        intro equal
        exact different (congrArg ScopeOccurrenceId.processInstanceId equal)
      have scopes : (removeCalledProcessTree before retained).scopeOccurrences =
          before.scopeOccurrences.filter (fun scope => !region.contains scope.id) := by
        apply List.filter_congr
        intro scope member
        have mask := regional_called_tree_mask program before hosting hosting valid running root region prepared
          rootMember parentless scope.id (List.mem_map.mpr ⟨scope, member, rfl⟩)
        simpa only [rootId] using congrArg Bool.not mask
      have tokens : (removeCalledProcessTree before retained).tokens =
          before.tokens.filter (fun token => !region.contains token.owner) := by
        apply List.filter_congr
        intro token member
        have live := runtimePositionValid_token_owner_live program hosting hosting before token valid running member
        obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
        have present : scope ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id = token.owner)) := by
          rw [census]; simp
        obtain ⟨scopeMember, identity⟩ := List.mem_filter.mp present
        have mask := regional_called_tree_mask program before hosting hosting valid running root region prepared
          rootMember parentless token.owner (List.mem_map.mpr ⟨scope, scopeMember, of_decide_eq_true identity⟩)
        simpa only [rootId] using congrArg Bool.not mask
      have tokenDelta := projectTokens_regional_continuation_differences program before.tokens
        (fun candidate => !region.contains candidate) output retained.caller (by simp [outside])
      have scopeDelta := projectScopes_filter_differences program before.scopeOccurrences (fun candidate => !region.contains candidate)
      simp only [controlPositionDelta?, projectControlPosition?, valid, afterValid, ↓reduceIte,
        Option.bind_eq_bind, Option.bind_some, pure, Pure.pure]
      change some (α := PublicControlPositionDelta)
          { consumedTokens := tokenDifference (projectTokens program before.tokens)
              (projectTokens program (addToken (removeCalledProcessTree before retained).tokens output retained.caller))
            producedTokens := tokenDifference
              (projectTokens program (addToken (removeCalledProcessTree before retained).tokens output retained.caller))
              (projectTokens program before.tokens)
            enteredScopes := scopeDifference (projectScopes program (removeCalledProcessTree before retained).scopeOccurrences)
              (projectScopes program before.scopeOccurrences)
            exitedScopes := scopeDifference (projectScopes program before.scopeOccurrences)
              (projectScopes program (removeCalledProcessTree before retained).scopeOccurrences) } = _
      rw [tokens, scopes, tokenDelta.1, tokenDelta.2, scopeDelta.1, scopeDelta.2]
      simp

theorem regionalSelection_return_record (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program before (.returnProcess id origin process definition output) = some selected) :
    ∃ record, selected.kind = .returning record ∧ selected.root.id = record.calledRoot ∧
      before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) = [record] := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  dsimp only at found
  repeat' first
    | (solve | simp at found)
    | (solve |
        cases found
        rename_i _ _ record census _ _ _ root scopes _ _ _ _
        exact ⟨record, rfl, scope_identity_of_census before record.calledRoot root scopes, census⟩)
    | split at found

theorem preparedReturn_position_delta (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have operation := regionalSelection_operation program before _ prepared.selection selection
  obtain ⟨record, kind, rootId, census⟩ :=
    regionalSelection_return_record program before id origin process definition output prepared.selection selection
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
  have result : returnProcessState? before id origin process definition output = some after := by
    simp only [fire?, snapshots] at fired
    change returnProcessState? before id origin process definition output = some after at fired
    exact fired
  simp only [regionalPositionDelta?, operation, kind, positionsExact] at positioned
  obtain ⟨produced, outputFound, positioned⟩ := Option.bind_eq_some_iff.mp positioned
  unfold regionalOutputPosition? at outputFound
  obtain ⟨outputOrigin, originFound, outputFound⟩ := Option.bind_eq_some_iff.mp outputFound
  have selectedOrigin := internalLocalControlPlaceOrigin?_selectedInputOrigin program output record.caller outputOrigin originFound
  obtain ⟨declared, binding⟩ := selectedInputOrigin?_exact_bindings program output record.caller outputOrigin selectedOrigin
  have originExact := internalLocalControlPlaceOrigin?_tokenOrigin program output record.caller outputOrigin originFound
  have position := returnProcessState_regional_position_delta program before after hosting id origin process definition output
    record prepared.region valid runningState census (by simpa only [rootId] using derived) declared binding result
  refine ⟨hosting, after, runningState, applied, ?_⟩
  rw [position, template]
  cases outputFound
  cases positioned
  simp only [originExact]

end BpmnSemantics.SemanticProcess.InternalCommutation
