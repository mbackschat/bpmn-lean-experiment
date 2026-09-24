import BpmnSemantics.SemanticProcess.InternalRegionalPositionAlgebra
import BpmnSemantics.SemanticProcess.InternalRegionalLifecycleSelection
import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts

/-! Completion publication follows the actual root or child update, including bounded withdrawal.
Root quiescence establishes empty tokens before terminal cleanup; child completion adds one unit.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem completion_position_delta_of_fields (program : Program) (before after ordinary : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program hosting before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running hosting)
    (operation : .completeScope id origin definition output ∈ program.operations)
    (unique : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (completed : completeScopeState? before definition output = some ordinary)
    (control : after.control = ordinary.control) (scopes : after.scopeOccurrences = ordinary.scopeOccurrences)
    (calls : after.calledProcessOccurrences = ordinary.calledProcessOccurrences) (tokens : after.tokens = ordinary.tokens)
    (afterValid : runtimePositionValid program hosting after = true) :
    controlPositionDelta? program hosting before after =
      match (generalizing := false) root.parent, output with
      | none, none => some
          { consumedTokens := [], producedTokens := [], enteredScopes := []
            exitedScopes := projectScopes program before.scopeOccurrences }
      | some parent, some place => some
          { consumedTokens := []
            producedTokens := [{ sequenceFlowId := tokenOrigin program { placeId := place, owner := parent }
                                 owner := parent, multiplicity := 1 }]
            enteredScopes := []
            exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope => scope.id == root.id }
      | _, _ => none := by
  obtain ⟨quiet, update⟩ := completeScopeState_selected_update before ordinary definition output root unique completed
  have member : root ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) := by
    rw [unique]; simp
  obtain ⟨member, definitionEq⟩ := List.mem_filter.mp member
  cases parentEq : root.parent with
  | none =>
      cases output with
      | some place => simp [parentEq, running] at update
      | none =>
          have hostingRoot := declaredComplete_hosting_instance program before hosting hosting id origin definition root
            valid structural running operation member (of_decide_eq_true definitionEq) parentEq
          have empty := (quiescent_hosting_root_position_fields program before hosting hosting valid running root member
            parentEq hostingRoot quiet).2.1
          simp only [parentEq, running] at update
          split at update
          · contradiction
          · cases update
            dsimp only at scopes tokens
            simp only [controlPositionDelta?, projectControlPosition?, valid, afterValid, ↓reduceIte,
              Option.bind_eq_bind, Option.bind_some, pure, Pure.pure, scopes, tokens, empty]
            simp [projectTokens, projectScopes, tokenDifference, scopeDifference]
  | some parent =>
      cases output with
      | none => simp [parentEq, running] at update
      | some place =>
          simp only [parentEq, running] at update
          split at update
          · cases update
            dsimp only at scopes tokens
            have tokenDelta := projectTokens_regional_continuation_differences program before.tokens
              (fun _ => true) place parent rfl
            rw [(List.filter_eq_self (p := fun _ : ControlToken => true)).mpr (by intros; rfl)] at tokenDelta
            have noRemoval : (projectTokens program before.tokens).filter (fun _ => !true) = [] :=
              List.filter_eq_nil_iff.mpr (by simp)
            rw [noRemoval] at tokenDelta
            have scopeDelta := projectScopes_filter_differences program before.scopeOccurrences
              (fun owner => decide (owner ≠ root.id))
            simp only [controlPositionDelta?, projectControlPosition?, valid, afterValid, ↓reduceIte,
              Option.bind_eq_bind, Option.bind_some, pure, Pure.pure, scopes, tokens]
            rw [tokenDelta.1, tokenDelta.2, scopeDelta.1, scopeDelta.2]
            congr 2
            apply List.filter_congr
            intro scope member
            apply Bool.eq_iff_iff.mpr
            simp
          · contradiction

theorem completeBoundedScope_position_delta (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program hosting before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running hosting)
    (operation : .completeScope id origin definition output ∈ program.operations)
    (unique : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeBoundedScope? program before definition output = some after) :
    controlPositionDelta? program hosting before after =
      match (generalizing := false) root.parent, output with
      | none, none => some
          { consumedTokens := [], producedTokens := [], enteredScopes := []
            exitedScopes := projectScopes program before.scopeOccurrences }
      | some parent, some place => some
          { consumedTokens := []
            producedTokens := [{ sequenceFlowId := tokenOrigin program { placeId := place, owner := parent }
                                 owner := parent, multiplicity := 1 }]
            enteredScopes := []
            exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope => scope.id == root.id }
      | _, _ => none := by
  obtain ⟨ordinary, completed, control, scopes, calls, tokens⟩ :=
    completeBoundedScope_position_fields program before after definition output result
  exact completion_position_delta_of_fields program before after ordinary hosting id origin
    definition output root valid structural running operation unique completed control scopes calls tokens
    (declaredBoundedComplete_preserves_position program before after hosting hosting id origin
      definition output valid structural running operation result)

theorem completeSelectedScope_position_delta (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program hosting before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running hosting)
    (operation : .completeScope id origin definition output ∈ program.operations)
    (unique : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeSelectedScope? program before definition output = some after) :
    controlPositionDelta? program hosting before after =
      match (generalizing := false) root.parent, output with
      | none, none => some
          { consumedTokens := [], producedTokens := [], enteredScopes := []
            exitedScopes := projectScopes program before.scopeOccurrences }
      | some parent, some place => some
          { consumedTokens := []
            producedTokens := [{ sequenceFlowId := tokenOrigin program { placeId := place, owner := parent }
                                 owner := parent, multiplicity := 1 }]
            enteredScopes := []
            exitedScopes := (projectScopes program before.scopeOccurrences).filter fun scope => scope.id == root.id }
      | _, _ => none := by
  obtain ⟨ordinary, completed, control, scopes, calls, tokens⟩ :=
    completeSelectedScope_position_fields program before after definition output result
  exact completion_position_delta_of_fields program before after ordinary hosting id origin
    definition output root valid structural running operation unique completed control scopes calls tokens
    (declaredSelectedComplete_preserves_position program before after hosting hosting id origin
      definition output valid structural running operation result)

theorem regionalSelection_complete_census (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program before (.completeScope id origin definition output) = some selected) :
    ∃ withdrawal, selected.kind = .completing withdrawal ∧
      before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [selected.root] := by
  have facts := regionalSelection_lifecycle_facts program before _ selected found
  cases kind : selected.kind with
  | returning record => simp [kind] at facts
  | interrupting parent => simp [kind] at facts
  | terminating => simp [kind] at facts
  | completing withdrawal => exact ⟨withdrawal, rfl, by simpa only [kind] using facts⟩

theorem preparedComplete_position_delta (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before (.completeScope id origin definition output) = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  obtain ⟨snapshots, declaration, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  have member : .completeScope id origin definition output ∈ program.operations := by
    have selected : .completeScope id origin definition output ∈ program.operations.filter
        (fun operation => decide (operation.id = (SemanticOperation.completeScope id origin definition output).id)) := by
      rw [declaration]; simp
    exact (List.mem_filter.mp selected).1
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have operation := regionalSelection_operation program before _ prepared.selection selection
  obtain ⟨withdrawal, kind, census⟩ :=
    regionalSelection_complete_census program before id origin definition output prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, running, projected, opened,
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
  have structural : flowNodeOccurrenceStructuralProgramValidity program before = true := by
    have validity := (projectOpenFlowNodeOccurrences_validities program before current hosting runningState opened).1
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at validity
    exact validity.1.1.1
  have positionsExact : positions =
      { controlTokens := projectTokens program before.tokens, scopes := projectScopes program before.scopeOccurrences } := by
    simpa [projectControlPosition?, valid] using projected.symm
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : completeSelectedScope? program before definition output = some after := by
    simp only [fire?, snapshots] at fired
    change completeSelectedScope? program before definition output = some after at fired
    exact fired
  have position := completeSelectedScope_position_delta program before after hosting id origin definition output
    prepared.selection.root valid structural runningState member census result
  refine ⟨hosting, after, runningState, applied, ?_⟩
  rw [position, template]
  cases parentEq : prepared.selection.root.parent with
  | none =>
      cases output with
      | none =>
          simpa only [regionalPositionDelta?, operation, kind, positionsExact, parentEq] using positioned
      | some place => simp [regionalPositionDelta?, operation, kind, parentEq] at positioned
  | some parent =>
      cases output with
      | none => simp [regionalPositionDelta?, operation, kind, parentEq] at positioned
      | some place =>
          simp only [regionalPositionDelta?, operation, kind, positionsExact, parentEq] at positioned
          obtain ⟨produced, outputFound, positioned⟩ := Option.bind_eq_some_iff.mp positioned
          unfold regionalOutputPosition? at outputFound
          obtain ⟨outputOrigin, originFound, outputFound⟩ := Option.bind_eq_some_iff.mp outputFound
          have originExact := internalLocalControlPlaceOrigin?_tokenOrigin program place parent outputOrigin originFound
          cases outputFound
          cases positioned
          simp only [originExact]

end BpmnSemantics.SemanticProcess.InternalCommutation
