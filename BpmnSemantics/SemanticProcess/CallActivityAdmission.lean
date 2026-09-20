import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Call Activity program admission

This module owns standalone well-formedness for the paired cross-root operations and the virtual called-End-to-return graph edge. Source binding and runtime transitions remain separate owners.
-/

namespace BpmnSemantics.SemanticProcess

private structure InvokeBinding where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  calledEntry : ControlPlaceId
  returnOperationId : OperationId

private structure ReturnBinding where
  id : OperationId
  origin : BpmnElementOrigin
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  callerOutput : ControlPlaceId

private def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun owner =>
    decide (owner.operationId = operationId)).map (·.scopeId)

private def placeScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  (program.controlPlaceScopes.find? fun owner =>
    decide (owner.controlPlaceId = placeId)).map (·.scopeId)

def invokeProcessOperationWellFormed (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId)
    (calledEntry : ControlPlaceId) (returnOperationId : OperationId) : Bool :=
  nonempty id.value && nonempty origin.elementId.value &&
    nonempty calledProcessId.value && nonempty calledRootScopeId.value &&
    nonempty returnOperationId.value &&
    (program.controlPlaces.any fun place => place.id = input) &&
    (program.controlPlaces.any fun place => place.id = calledEntry) &&
    (program.definitionScopes.any fun scope => scope.id = calledRootScopeId)

def returnProcessOperationWellFormed (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin)
    (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId)
    (callerOutput : ControlPlaceId) : Bool :=
  nonempty id.value && nonempty origin.elementId.value &&
    nonempty calledProcessId.value && nonempty calledRootScopeId.value &&
    (program.controlPlaces.any fun place => place.id = callerOutput) &&
    (program.definitionScopes.any fun scope => scope.id = calledRootScopeId)

/-- Count every identity-associated invoke/return before validating its other fields. -/
def callOperationsPaired (program : Program) : Bool :=
  let invokes : List InvokeBinding := program.operations.filterMap fun
    | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned =>
        some (show InvokeBinding from
          { id
            origin
            input
            calledProcessId
            calledRoot
            calledEntry
            returnOperationId := returned })
    | _ => none
  let returns : List ReturnBinding := program.operations.filterMap fun
    | .returnProcess id origin calledProcessId calledRoot callerOutput =>
        some (show ReturnBinding from
          { id, origin, calledProcessId, calledRoot, callerOutput })
    | _ => none
  if invokes.isEmpty && returns.isEmpty then true
  else
    match program.definitionScopes.filter fun scope =>
        scope.parentScopeId.isNone &&
          scope.originElementId.value = program.processId.value with
    | [entryRoot] =>
        invokes.length = returns.length &&
          (invokes.all fun invoke =>
            match returns.filter fun returned =>
                returned.id = invoke.returnOperationId with
            | [returned] =>
                match program.definitionScopes.filter fun scope =>
                    decide (scope.parentScopeId.isNone &&
                      scope.originElementId.value = invoke.calledProcessId.value) with
                | [calledRoot] =>
                    calledRoot.id = invoke.calledRoot &&
                      calledRoot.id ≠ entryRoot.id &&
                      operationScope? program invoke.id = some entryRoot.id &&
                      operationScope? program returned.id = some calledRoot.id &&
                      placeScope? program invoke.input = some entryRoot.id &&
                      placeScope? program invoke.calledEntry = some calledRoot.id &&
                      placeScope? program returned.callerOutput = some entryRoot.id &&
                      returned.origin = invoke.origin &&
                      returned.calledProcessId = invoke.calledProcessId &&
                      returned.calledRoot = invoke.calledRoot
                | _ => false
            | _ => false)
          && returns.all fun returned =>
            (invokes.filter fun invoke =>
              invoke.returnOperationId = returned.id).length = 1
    | _ => false

/-- Paired invocation and Return declarations place the continuation in the invocation's scope.
The returned operation is counted by identity before its output payload is used. -/
theorem callOperationsPaired_return_caller_scope (program : Program)
    (invokeId : OperationId) (invokeOrigin : BpmnElementOrigin) (input : ControlPlaceId)
    (calledProcess : ProcessId) (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnedId : OperationId) (returnOrigin : BpmnElementOrigin) (returnProcess : ProcessId)
    (returnRoot : DefinitionScopeId) (output : ControlPlaceId) (callerScope : DefinitionScopeId)
    (paired : callOperationsPaired program = true)
    (invocation : .invokeProcess invokeId invokeOrigin input calledProcess calledRoot calledEntry returnedId ∈ program.operations)
    (returning : .returnProcess returnedId returnOrigin returnProcess returnRoot output ∈ program.operations)
    (caller : (program.operationScopes.find? fun binding => decide (binding.operationId = invokeId)).map (·.scopeId) = some callerScope) :
    (program.controlPlaceScopes.find? fun binding => decide (binding.controlPlaceId = output)).map (·.scopeId) = some callerScope := by
  let actual : ReturnBinding :=
    { id := returnedId, origin := returnOrigin, calledProcessId := returnProcess,
      calledRoot := returnRoot, callerOutput := output }
  have actualMember : actual ∈ program.operations.filterMap (fun
      | .returnProcess id origin process root output => some (show ReturnBinding from
          { id, origin, calledProcessId := process, calledRoot := root, callerOutput := output })
      | _ => none) := List.mem_filterMap.mpr ⟨_, returning, rfl⟩
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · rename_i empty
    simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
    have absent := List.filterMap_eq_nil_iff.mp empty.1 _ invocation
    contradiction
  · split at paired
    · rename_i entryRoot roots
      simp only [Bool.and_eq_true] at paired
      have selected := paired.1.2
      rw [List.all_filterMap] at selected
      have selected := List.all_eq_true.mp selected _ invocation
      dsimp only at selected
      split at selected
      · rename_i returned returns
        have selectedMember := (List.mem_filter (p := fun value : ReturnBinding => decide (value.id = returnedId))).mpr
          ⟨actualMember, by simp [actual]⟩
        rw [returns] at selectedMember
        have same := List.mem_singleton.mp selectedMember
        rw [← same] at selected
        dsimp only [actual] at selected
        split at selected
        · simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
          obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨_, _⟩, invokeScope⟩, _⟩, _⟩, _⟩, outputScope⟩, _⟩, _⟩, _⟩ := selected
          change (program.operationScopes.find? fun binding => decide (binding.operationId = invokeId)).map (·.scopeId) = some entryRoot.id at invokeScope
          have sameScope := Option.some.inj (caller.symm.trans invokeScope)
          simpa only [placeScope?, sameScope] using outputScope
        · contradiction
      · contradiction
    · contradiction

/-- The paired Call account excludes the hosting definition from every declared called root. -/
theorem callOperationsPaired_calledRoot_ne_entryRoot (program : Program) (entryRoot : DefinitionScopeId)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (process : ProcessId)
    (root : DefinitionScopeId) (entry : ControlPlaceId) (returned : OperationId)
    (paired : callOperationsPaired program = true)
    (hosting : (match (generalizing := false) program.definitionScopes.filter (fun scope =>
        scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value) with
      | [scope] => some scope.id | _ => none) = some entryRoot)
    (member : .invokeProcess id origin input process root entry returned ∈ program.operations) : root ≠ entryRoot := by
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · rename_i empty
    simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
    have absent := List.filterMap_eq_nil_iff.mp empty.1 _ member
    contradiction
  · split at paired
    · rename_i hostingRoot roots
      have rootEq : hostingRoot.id = entryRoot := by
        simpa only [roots, Option.some.injEq] using hosting
      simp only [Bool.and_eq_true] at paired
      have selected := paired.1.2
      rw [List.all_filterMap] at selected
      have selected := List.all_eq_true.mp selected _ member
      dsimp only at selected
      split at selected
      · split at selected
        · simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
          obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨same, different⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩ := selected
          exact fun equal => different (same.trans (equal.trans rootEq.symm))
        · contradiction
      · contradiction
    · contradiction

/-- Virtual graph edges from the unique called End operation to its return. -/
def callCompletionPairs (program : Program) : List (OperationId × OperationId) :=
  program.operations.filterMap fun
    | .returnProcess returnId _ _ calledRoot _ =>
        match program.operations.filter fun operation =>
            match operation with
            | .reachNoneEnd endId _ _ =>
                operationScope? program endId = some calledRoot
            | _ => false with
        | [.reachNoneEnd endId _ _] => some (endId, returnId)
        | _ => none
    | _ => none

end BpmnSemantics.SemanticProcess
