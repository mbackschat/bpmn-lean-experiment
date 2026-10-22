import BpmnSemantics.SemanticProcess.CallVariableMapping
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws

/-! # Call variable mapping laws

The proved lane of the [Call variable mapping proposal](../../docs/capsules/CALL-VARIABLE-MAPPING-PROPOSAL.md#lean-assurance-lane).
Isolation is a property of every state reachable while a call is live, which no finite witness
covers, so it is stated over arbitrary scoped variables: resolution from a called-owned scope never
reads or writes the hosting Process binding and never selects a frame of another instance.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace CallVariableMapping

open NestedScopeData

/-- CVM-IN-01 and CVM-OUT-01: an absent source copies a present null. -/
theorem copyValues?_absent_is_null (read : String → Option (Option VariableValue)) (target name : String)
    (expression : MappingExpression)
    (named : expression = .localVariable name ∨ expression = .enclosingVariable name)
    (absent : read name = some none) :
    copyValues? read [{ target, expression }] = some [{ name := target, value := .null }] := by
  rcases named with rfl | rfl <;> simp [copyValues?, copyValue?, absent]

/-- A refused read disables the whole copy instead of fabricating a null, whatever its position. -/
theorem copyValues?_refused (read : String → Option (Option VariableValue)) (name : String)
    (refused : read name = none) :
    ∀ (mappings : List VariableMapping) (mapping : VariableMapping), mapping ∈ mappings →
      (mapping.expression = .localVariable name ∨ mapping.expression = .enclosingVariable name) →
      copyValues? read mappings = none
  | [], _, member, _ => by simp at member
  | head :: tail, mapping, member, named => by
      rcases List.mem_cons.mp member with rfl | later
      · rcases named with named | named <;> simp [copyValues?, copyValue?, List.mapM_cons, named, refused]
      · have rest := copyValues?_refused read name refused tail mapping later named
        simp only [copyValues?, List.mapM_cons] at rest ⊢
        rw [rest]
        cases copyValue? read head <;> rfl

/-- CVM-ISOLATE-01, write side: from a chain that ends at a called root, a write never touches the
hosting Process binding, Activity-local data or Process interfaces; only frames change. -/
theorem write?_called_keeps_process (program : Program) (variables result : ScopedVariables)
    (instanceId : SemanticId) (scopeId : DefinitionScopeId) (binding : VariableBinding) (root : DefinitionScopeId)
    (called : calledRootOf? program (definitionChain program.definitionScopes scopeId) = some root)
    (written : write? program variables instanceId scopeId binding = some result) :
    result = { variables with scopes := result.scopes } := by
  unfold write? at written
  simp only [bind, Option.bind] at written
  split at written
  · contradiction
  · rename_i owner _
    cases owner with
    | process =>
        simp only [called] at written
        split at written
        · cases written; rfl
        · contradiction
    | frame owner =>
        cases selected : selectScopeVariables? variables owner <;> simp [selected] at written
        cases written; rfl

/-- CVM-ISOLATE-01, read side: from a chain that ends at a called root, a read is independent of the
hosting Process binding. -/
theorem readOutcome?_called_ignores_process (program : Program) (variables : ScopedVariables)
    (process : ProcessVariableScope) (instanceId : SemanticId) (scopeId : DefinitionScopeId) (name : String)
    (root : DefinitionScopeId)
    (called : calledRootOf? program (definitionChain program.definitionScopes scopeId) = some root) :
    readOutcome? program { variables with process } instanceId scopeId name =
      readOutcome? program variables instanceId scopeId name := by
  unfold readOutcome?
  simp only [called]
  rfl

/-- CVM-ISOLATE-01, frame side: resolution selects only a frame of the resolving instance, so a
called-owned read or write never selects a caller frame. -/
theorem resolveOwner?_frame_same_instance (variables : ScopedVariables) (instanceId : SemanticId)
    (chain : List DefinitionScopeId) (name : String) (owner : ScopeOccurrenceId)
    (resolved : resolveOwner? variables.scopes instanceId chain name = some (.frame owner)) :
    owner.processInstanceId = instanceId := by
  obtain ⟨_, scopeId, _, frame, _, frames, same, _, _⟩ :=
    resolveOwner?_frame_nearest variables instanceId name chain owner resolved
  have member : frame ∈ framesOf variables.scopes instanceId scopeId := by simp [frames]
  simp only [framesOf, List.mem_filter, Bool.and_eq_true, beq_iff_eq] at member
  rw [← same]
  exact member.2.1

/-- CVM-IN-01: a mapped invocation installs exactly one frame for the derived called root, holding
the input copies read along the caller's chain in the predecessor state. -/
theorem invokeState?_installs_snapshot (program : Program) (before after : RuntimeState)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (calledEntry : ControlPlaceId) (returnOperationId : OperationId)
    (inputs outputs : List VariableMapping)
    (invoked : invokeState? program before origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId inputs outputs = some after) :
    ∃ caller bindings,
      onlyTokenOwner? before input = some caller ∧
      copyValues? (readOutcome? program before.variables caller.processInstanceId caller.definitionScopeId)
        inputs = some bindings ∧
      (after.variables.scopes.filter fun frame =>
        decide (frame.owner = scalarInvocationRoot before caller origin calledRootScopeId)) =
        [calledRootFrame (scalarInvocationRoot before caller origin calledRootScopeId) bindings] := by
  unfold invokeState? at invoked
  split at invoked
  · contradiction
  · simp only [bind, Option.bind_eq_some_iff] at invoked
    obtain ⟨caller, owned, bindings, copied, control, _, invoked⟩ := invoked
    split at invoked
    · contradiction
    · rename_i fresh
      simp only [Option.some.injEq] at invoked
      subst invoked
      refine ⟨caller, bindings, owned, copied, ?_⟩
      let root := scalarInvocationRoot before caller origin calledRootScopeId
      have absent : control.variables.scopes.filter (fun frame => decide (frame.owner = root)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro frame member same
        apply fresh
        exact List.any_eq_true.mpr ⟨frame, member, by simpa using of_decide_eq_true same⟩
      have perm := filter_canonicalInsertBy_perm (fun left right => scopeOwnerBefore left.owner right.owner)
        (fun frame => decide (frame.owner = root)) (calledRootFrame root bindings) control.variables.scopes
        (by simp [calledRootFrame, root])
      rw [absent] at perm
      exact List.perm_singleton.mp perm

private theorem write?_frame_owners (program : Program) (variables result : ScopedVariables)
    (instanceId : SemanticId) (scopeId : DefinitionScopeId) (binding : VariableBinding)
    (written : write? program variables instanceId scopeId binding = some result) :
    result.scopes.map (·.owner) = variables.scopes.map (·.owner) := by
  unfold write? at written
  simp only [bind, Option.bind] at written
  split at written
  · contradiction
  · rename_i owner _
    cases owner with
    | process =>
        split at written
        · cases written; rfl
        · split at written
          · cases written
            simp only [List.map_map]
            congr 1
            funext candidate
            simp only [Function.comp]
            split <;> rfl
          · contradiction
    | frame owner =>
        cases selected : selectScopeVariables? variables owner <;> simp [selected] at written
        cases written
        simp only [List.map_map]
        congr 1
        funext candidate
        simp only [Function.comp]
        split <;> rfl

/-- Writes update bindings in place; they never create or remove a frame. -/
theorem writeAll?_frame_owners (program : Program) (instanceId : SemanticId) (scopeId : DefinitionScopeId) :
    ∀ (bindings : List VariableBinding) (variables result : ScopedVariables),
      writeAll? program variables instanceId scopeId bindings = some result →
      result.scopes.map (·.owner) = variables.scopes.map (·.owner)
  | [], _, _, written => by simp [writeAll?] at written; rw [written]
  | binding :: rest, variables, result, written => by
      simp only [writeAll?, bind, Option.bind] at written
      split at written
      · contradiction
      · rename_i middle wrote
        rw [writeAll?_frame_owners program instanceId scopeId rest middle result written,
          write?_frame_owners program variables middle instanceId scopeId binding wrote]

/-- CVM-OUT-01: a mapped return reads every output from the predecessor's called-root frame alone and
writes them by NSD-WRITE-01 from the Call's enclosing occurrence after disposal, so each lands at its
nearest caller owner by that rule's laws. -/
theorem returnState?_writes_outputs_from_caller (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId) (inputs outputs : List VariableMapping)
    (result : returnState? program before id origin calledProcessId calledRootScopeId callerOutput inputs outputs =
      some after) :
    ∃ record frame values returned,
      scalarReturnRecord? before id origin = some record ∧
      selectScopeVariables? before.variables record.calledRoot = some frame ∧
      copyValues? (bindingOutcome? frame.bindings) outputs = some values ∧
      returnProcessState? before id origin calledProcessId calledRootScopeId callerOutput = some returned ∧
      writeAll? program returned.variables record.caller.processInstanceId record.caller.definitionScopeId values =
        some after.variables := by
  unfold returnState? at result
  split at result
  · contradiction
  · simp only [bind, Option.bind_eq_some_iff] at result
    obtain ⟨record, selected, frame, framed, values, copied, returned, controlled, variables, wrote, result⟩ :=
      result
    simp only [Option.some.injEq] at result
    subst result
    exact ⟨record, frame, values, returned, selected, framed, copied, controlled, wrote⟩

/-- CVM-RETIRE-01: after a mapped return no frame of the called instance remains, because return
disposes the called tree before writing and the writes create no frame. -/
theorem returnState?_retires_called_frames (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId) (inputs outputs : List VariableMapping)
    (returned : returnState? program before id origin calledProcessId calledRootScopeId callerOutput inputs outputs =
      some after) :
    ∃ record, scalarReturnRecord? before id origin = some record ∧
      ∀ frame ∈ after.variables.scopes, frame.owner.processInstanceId ≠ record.calledRoot.processInstanceId := by
  unfold returnState? at returned
  split at returned
  · contradiction
  · simp only [bind, Option.bind_eq_some_iff] at returned
    obtain ⟨record, selected, _, _, _, _, control, controlled, variables, wrote, returned⟩ := returned
    refine ⟨record, selected, ?_⟩
    simp only [Option.some.injEq] at returned
    subst returned
    intro frame member same
    have owners := writeAll?_frame_owners program _ _ _ _ _ wrote
    have ownerMember : frame.owner ∈ control.variables.scopes.map (·.owner) := by
      rw [← owners]; exact List.mem_map.mpr ⟨frame, member, rfl⟩
    obtain ⟨actual, _, actualSelected, _, _, _, exact⟩ :=
      return_step_removes_exact_association_and_emits_one_continuation _ _ _ _ _ _ _
        (returnProcessState_sound _ _ _ _ _ _ _ controlled)
    have sameRecord : actual = record := by
      unfold scalarReturnRecord? at selected
      rw [actualSelected] at selected
      simpa using selected
    subst sameRecord
    rw [exact] at ownerMember
    obtain ⟨kept, keptMember, keptOwner⟩ := List.mem_map.mp ownerMember
    have seeded := processInstanceClosureWithin_seed_subset before.calledProcessOccurrences
      [actual.calledRoot.processInstanceId] (before.calledProcessOccurrences.length + 1)
      (List.mem_singleton_self _)
    simp only [removeCalledProcessTree, List.mem_filter] at keptMember
    rw [keptOwner, same] at keptMember
    simp [seeded] at keptMember

end CallVariableMapping
end BpmnSemantics.SemanticProcess
