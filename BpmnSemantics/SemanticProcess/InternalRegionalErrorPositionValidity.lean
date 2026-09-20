import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission

/-! # Error continuation position

The selected interrupting Error removes a child region and emits a continuation in its parent.
The parent must survive the actual cancellation mask, and checked admission must bind the
handler output to that same parent's definition scope.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Actual Error selection exposes its exact child and parent before cancellation; matching
the error reference never substitutes for the runtime occurrence census. -/
theorem throwErrorState_selection (before after : RuntimeState) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler)
    (result : throwErrorState? before input error handler = some after) :
    ∃ root parent, root ∈ before.scopeOccurrences ∧ root.id.definitionScopeId = handler.attachedScopeId ∧
      root.parent = some parent ∧ after = interruptScope before root.id parent handler.output := by
  unfold throwErrorState? at result
  obtain ⟨owner, selected, result⟩ := Option.bind_eq_some_iff.mp result
  obtain ⟨_, _, result⟩ := Option.bind_eq_some_iff.mp result
  split at result
  · simp at result
  · rename_i matching
    have attached : owner.definitionScopeId = handler.attachedScopeId := by
      by_cases equal : owner.definitionScopeId = handler.attachedScopeId
      · exact equal
      · simp [equal] at matching
    dsimp only at result
    split at result
    · rename_i root census
      simp only [Option.bind_eq_bind, Option.bind_some] at result
      obtain ⟨parent, parentEq, result⟩ := Option.bind_eq_some_iff.mp result
      have rootIn : root ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) := by
        rw [census]; simp
      obtain ⟨member, identity⟩ := List.mem_filter.mp rootIn
      have identity := of_decide_eq_true identity
      split at result
      · simp only [Option.some.injEq] at result
        exact ⟨root, parent, member, by rw [identity]; exact attached, parentEq, by simpa only [identity] using result.symm⟩
      · simp at result
    · simp at result

/-- Static parent rank excludes the parent from its child's cancellation region, and valid Call
endpoints cannot seed a called-instance deletion from a child. The continuation owner survives. -/
theorem interruptScope_preserves_position (program : Program) (before : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (root : RuntimeScopeOccurrence)
    (parent : ScopeOccurrenceId) (output : ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (member : root ∈ before.scopeOccurrences) (parentEq : root.parent = some parent)
    (declared : ∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [place])
    (binding : program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = output)) =
      [{ controlPlaceId := output, scopeId := parent.definitionScopeId }]) :
    runtimePositionValid program expectedInstanceId (interruptScope before root.id parent output) = true := by
  have child : root.parent ≠ none := by simp [parentEq]
  have cancelled := cancelScopeSubtree_child_preserves_position program before expectedInstanceId instanceId
    valid running root member child .remove
  have live : exactLiveOccurrence before parent = true := by
    obtain ⟨_, _, _, _, parentBinding⟩ := runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
      before valid running root member
    rcases parentBinding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, _, live⟩
    · simp [parentless] at parentEq
    · simpa only [Option.some.inj (ownerEq.symm.trans parentEq)] using live
  have survives := cancelScopeSubtree_preserves_uncancelled_owner before root.id .remove parent live
    (by rw [calledInstanceClosure_child_empty program before expectedInstanceId instanceId valid running root member child,
      runtimePositionValid_parent_outside_child_subtree program before expectedInstanceId instanceId valid running root member parent parentEq]; rfl)
  exact runtimePositionValid_addToken program expectedInstanceId (cancelScopeSubtree before root.id .remove) output parent
    cancelled survives declared binding

/-- The actual Error selector followed by child interruption preserves position when its
continuation has the declared parent binding; no intermediate validity is assumed. -/
theorem throwErrorState_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (continuation : ∀ root ∈ before.scopeOccurrences, ∀ parent, root.parent = some parent →
      root.id.definitionScopeId = handler.attachedScopeId →
      (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = handler.output)) = [place]) ∧
        program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = handler.output)) =
          [{ controlPlaceId := handler.output, scopeId := parent.definitionScopeId }])
    (result : throwErrorState? before input error handler = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨root, parent, member, attached, parentEq, result⟩ := throwErrorState_selection before after input error handler result
  obtain ⟨declared, binding⟩ := continuation root member parent parentEq attached
  rw [result]
  exact interruptScope_preserves_position program before expectedInstanceId instanceId root parent handler.output valid running
    member parentEq declared binding

/-- Checked Error ownership and the selected child's static parent determine the continuation's
exact place census; matching a runtime handler alone cannot establish that declaration. -/
theorem declaredError_continuation_binding (program : Program) (before : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (error : ErrorReference) (handler : InterruptingErrorHandler)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (operation : .throwError id origin input error handler ∈ program.operations)
    (member : root ∈ before.scopeOccurrences) (attached : root.id.definitionScopeId = handler.attachedScopeId)
    (parentEq : root.parent = some parent) :
    (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = handler.output)) = [place]) ∧
      program.controlPlaceScopes.filter (fun candidate => decide (candidate.controlPlaceId = handler.output)) =
        [{ controlPlaceId := handler.output, scopeId := parent.definitionScopeId }] := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid; exact valid.1.1
  have graph := programWellFormed_graph program programValid
  obtain ⟨entryRoot, _, _, ownership⟩ := programGraphWellFormed_scopeContract program graph
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  have respects := List.all_eq_true.mp ownership.2 _ operation
  unfold operationRespectsScopes at respects
  dsimp only at respects
  split at respects
  · contradiction
  · rename_i owner ownerFound
    simp only [Bool.and_eq_true, decide_eq_true_eq] at respects
    have route := respects.2
    change (match program.definitionScopes.find? (fun scope => decide (scope.id = owner)) with
      | some scope => match scope.parentScopeId with
        | some parentScope => [handler.output].all (fun place =>
            ((program.controlPlaceScopes.find? fun binding => decide (binding.controlPlaceId = place)).map
              (·.scopeId)) == some parentScope)
        | none => false
      | none => false) = true at route
    obtain ⟨_, definition, definitionMember, definitionId, parentBinding⟩ :=
      runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId before valid running root member
    have lookup := programWellFormed_definition_lookup_of_member program definition programValid definitionMember
    rw [definitionId, attached, respects.1.1] at lookup
    rw [lookup] at route
    rcases parentBinding with ⟨_, parentless⟩ | ⟨ownerParent, ownerEq, definitionParent, _, _⟩
    · simp [parentless] at parentEq
    · have same := Option.some.inj (ownerEq.symm.trans parentEq)
      simp only [definitionParent, same, List.all_cons, List.all_nil, Bool.and_true, beq_iff_eq] at route
      have unique : (program.controlPlaces.map (·.id)).Nodup := by
        apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
          (fun _ _ different equal => different (congrArg ControlPlaceId.value equal))
        rw [List.map_map]
        exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program programValid)
      exact programGraphWellFormed_exactPlaceBinding program handler.output parent.definitionScopeId graph unique route

/-- Declared Error preserves position from checked predecessor position and actual success.
Admission supplies the continuation binding, and cancellation supplies parent survival. -/
theorem declaredError_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (error : ErrorReference) (handler : InterruptingErrorHandler)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (operation : .throwError id origin input error handler ∈ program.operations)
    (result : throwErrorState? before input error handler = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  exact throwErrorState_preserves_position program before after expectedInstanceId instanceId input error handler valid running
    (fun root member parent parentEq attached => declaredError_continuation_binding program before expectedInstanceId instanceId
      id origin input error handler root parent valid running operation member attached parentEq) result

end BpmnSemantics.SemanticProcess
