module

public import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
public import BpmnSemantics.SemanticProcessContract

/-! # Call Activity program admission

This module owns standalone well-formedness for the paired cross-root operations and the virtual called-End-to-return graph edge. Source binding and runtime transitions remain separate owners.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

structure InvokeBinding where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  calledEntry : ControlPlaceId
  returnOperationId : OperationId
  data : CallDataInterface

structure ReturnBinding where
  id : OperationId
  origin : BpmnElementOrigin
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  callerOutput : ControlPlaceId
  data : CallDataInterface

def operationScopeOf? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun owner =>
    decide (owner.operationId = operationId)).map (·.scopeId)

def placeScope? (program : Program) (placeId : ControlPlaceId) :
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

/-- The parentless root above `scopeId`; the fuel bound terminates a cyclic parent relation. -/
def processRootWithin (scopes : List DefinitionScope) :
    Nat → DefinitionScopeId → Option DefinitionScopeId
  | 0, _ => none
  | fuel + 1, scopeId =>
      match scopes.filter (·.id == scopeId) with
      | [scope] =>
          match scope.parentScopeId with
          | none => some scope.id
          | some parent => processRootWithin scopes fuel parent
      | _ => none

/-- Count every identity-associated invoke/return before validating its other fields. Each invocation
crosses from the scope that holds it into one exact called-root return pair, the called root never
the entry root nor the root of the caller's own Process tree (CALLN-ADMIT-01). Stage B admits that
scope to be an embedded scope of the caller Process; the caller output lies in the same scope. -/
def callOperationsPaired (program : Program) : Bool :=
  let invokes : List InvokeBinding := program.operations.filterMap fun
    | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data =>
        some (show InvokeBinding from
          { id
            origin
            input
            calledProcessId
            calledRoot
            calledEntry
            returnOperationId := returned, data })
    | _ => none
  let returns : List ReturnBinding := program.operations.filterMap fun
    | .returnProcess id origin calledProcessId calledRoot callerOutput data =>
        some (show ReturnBinding from
          { id, origin, calledProcessId, calledRoot, callerOutput, data })
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
                      (match operationScopeOf? program invoke.id with
                        | some callerScope =>
                            match processRootWithin program.definitionScopes
                                program.definitionScopes.length callerScope with
                            | some callerRoot => callerRoot ≠ calledRoot.id
                            | none => false
                        | none => false) &&
                      operationScopeOf? program returned.id = some calledRoot.id &&
                      placeScope? program invoke.input = operationScopeOf? program invoke.id &&
                      placeScope? program invoke.calledEntry = some calledRoot.id &&
                      placeScope? program returned.callerOutput = operationScopeOf? program invoke.id &&
                      returned.origin = invoke.origin &&
                      returned.calledProcessId = invoke.calledProcessId &&
                      returned.calledRoot = invoke.calledRoot && returned.data = invoke.data
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
    {invokeData returnData : CallDataInterface}
    (paired : callOperationsPaired program = true)
    (invocation : .invokeProcess invokeId invokeOrigin input calledProcess calledRoot calledEntry returnedId invokeData ∈ program.operations)
    (returning : .returnProcess returnedId returnOrigin returnProcess returnRoot output returnData ∈ program.operations)
    (caller : (program.operationScopes.find? fun binding => decide (binding.operationId = invokeId)).map (·.scopeId) = some callerScope) :
    (program.controlPlaceScopes.find? fun binding => decide (binding.controlPlaceId = output)).map (·.scopeId) = some callerScope := by
  let actual : ReturnBinding :=
    { id := returnedId, origin := returnOrigin, calledProcessId := returnProcess,
      calledRoot := returnRoot, callerOutput := output, data := returnData }
  have actualMember : actual ∈ program.operations.filterMap (fun
      | .returnProcess id origin process root output data => some (show ReturnBinding from
          { id, origin, calledProcessId := process, calledRoot := root, callerOutput := output, data })
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
        -- `erw`: `returns` carries the definition's matcher and `selectedMember` this proof's private one
        -- (docs/LEAN-BUILD-MODULARITY-SPEC.md#module-matcher-defect).
        erw [returns] at selectedMember
        have same := List.mem_singleton.mp selectedMember
        rw [← same] at selected
        dsimp only [actual] at selected
        split at selected
        · simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
          have selected := selected.1
          obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨_, _⟩, _⟩, _⟩, _⟩, _⟩, outputScope⟩, _⟩, _⟩, _⟩ := selected
          exact outputScope.trans caller
        · contradiction
      · contradiction
    · contradiction

/-- The paired Call account excludes the hosting definition from every declared called root. -/
theorem callOperationsPaired_calledRoot_ne_entryRoot (program : Program) (entryRoot : DefinitionScopeId)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (process : ProcessId)
    (root : DefinitionScopeId) (entry : ControlPlaceId) (returned : OperationId)
    {data : CallDataInterface}
    (paired : callOperationsPaired program = true)
    (hosting : (match (generalizing := false) program.definitionScopes.filter (fun scope =>
        scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value) with
      | [scope] => some scope.id | _ => none) = some entryRoot)
    (member : .invokeProcess id origin input process root entry returned data ∈ program.operations) : root ≠ entryRoot := by
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
          have selected := selected.1
          obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨same, different⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩ := selected
          exact fun equal => different (same.trans (equal.trans rootEq.symm))
        · contradiction
      · contradiction
    · contradiction

/-- Virtual graph edges from the unique called End operation to its return. -/
def callCompletionPairs (program : Program) : List (OperationId × OperationId) :=
  program.operations.filterMap fun
    | .returnProcess returnId _ _ calledRoot _ _ =>
        match program.operations.filter fun operation =>
            match operation with
            | .reachNoneEnd endId _ _ =>
                operationScopeOf? program endId = some calledRoot
            | _ => false with
        | [.reachNoneEnd endId _ _] => some (endId, returnId)
        | _ => none
    | _ => none


theorem invoke_return_count (operations : List SemanticOperation) (returned : OperationId) :
    (operations.filter fun
      | .invokeProcess _ _ _ _ _ _ candidate _ => decide (candidate = returned)
      | _ => false).length =
    ((operations.filterMap fun
      | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data =>
          some (show InvokeBinding from
            { id, origin, input, calledProcessId, calledRoot, calledEntry
              returnOperationId := returned, data })
      | _ => none).filter fun invoke => decide (invoke.returnOperationId = returned)).length := by
  induction operations with
  | nil => rfl
  | cons operation rest ih =>
      cases operation
      all_goals simp only [List.filter_cons, List.filterMap_cons]
      all_goals first
        | exact ih
        | (split <;> simp_all)

/-- Paired Calls declare at most one invocation of each return operation: an invocation's return is
declared, and each return counts exactly one invocation. -/
theorem callOperationsPaired_invokes_by_return_le_one (program : Program) (returned : OperationId)
    (paired : callOperationsPaired program = true) :
    (program.operations.filter fun
      | .invokeProcess _ _ _ _ _ _ candidate _ => decide (candidate = returned)
      | _ => false).length ≤ 1 := by
  rw [invoke_return_count]
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · rename_i empty
    simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
    rw [empty.1]
    simp
  · split at paired
    · simp only [Bool.and_eq_true, List.all_eq_true] at paired
      -- Restated once so `cases` abstracts it: a module gives this proof's `match` its own private matcher
      -- (docs/LEAN-BUILD-MODULARITY-SPEC.md#module-matcher-defect).
      let invokes := program.operations.filterMap fun
        | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data =>
            some (show InvokeBinding from
              { id, origin, input, calledProcessId, calledRoot, calledEntry
                returnOperationId := returned, data })
        | _ => none
      show (invokes.filter fun invoke => decide (invoke.returnOperationId = returned)).length ≤ 1
      cases filtered : invokes.filter (fun invoke => decide (invoke.returnOperationId = returned)) with
      | nil => simp
      | cons first rest =>
          have firstIn : first ∈ invokes.filter (fun invoke => decide (invoke.returnOperationId = returned)) := by
            rw [filtered]; exact List.mem_cons_self
          obtain ⟨firstMember, firstReturned⟩ := List.mem_filter.mp firstIn
          have firstReturnedEq := of_decide_eq_true firstReturned
          have selected := paired.1.2 first firstMember
          split at selected
          · rename_i returnBinding returns
            have returnIn : returnBinding ∈ _ := returns ▸ List.mem_singleton_self returnBinding
            obtain ⟨returnMember, returnId⟩ := List.mem_filter.mp returnIn
            have counted := of_decide_eq_true (paired.2 returnBinding returnMember)
            rw [← filtered]
            rw [of_decide_eq_true returnId, firstReturnedEq] at counted
            exact Nat.le_of_eq counted
          · contradiction
    · contradiction

/-- A paired invocation is held by the scope that holds its input place. -/
theorem callOperationsPaired_invoke_input_scope (program : Program) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRoot : DefinitionScopeId) (calledEntry : ControlPlaceId) (returned : OperationId)
    {data : CallDataInterface}
    (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data ∈
      program.operations) :
    (program.operationScopes.find? fun owner => decide (owner.operationId = id)).map (·.scopeId) =
      (program.controlPlaceScopes.find? fun owner => decide (owner.controlPlaceId = input)).map (·.scopeId) := by
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · rename_i empty
    simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
    have absent := List.filterMap_eq_nil_iff.mp empty.1 _ member
    contradiction
  · split at paired
    · simp only [Bool.and_eq_true] at paired
      have selected := paired.1.2
      rw [List.all_filterMap] at selected
      have selected := List.all_eq_true.mp selected _ member
      dsimp only at selected
      split at selected
      · split at selected
        · simp only [Bool.and_eq_true, decide_eq_true_eq] at selected
          obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨_, _⟩, _⟩, _⟩, inputFound⟩, _⟩, _⟩, _⟩, _⟩, _⟩ := selected.1
          exact inputFound.symm
        · contradiction
      · contradiction
    · contradiction

end BpmnSemantics.SemanticProcess
