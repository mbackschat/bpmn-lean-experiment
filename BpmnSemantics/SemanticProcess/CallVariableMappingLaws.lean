module

public import BpmnSemantics.SemanticProcess.CallVariableMapping
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.CompensationActivityRetention
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProgramBindingFacts
public import BpmnSemantics.SemanticProcess.CallActivityAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TimerStart

/-! # Call variable mapping laws

The proved lane of the [Call variable mapping specification](../../docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md#lean-assurance-lane).
Isolation is a property of every state reachable while a call is live, which no finite witness
covers, so it is stated over arbitrary scoped variables: resolution from a called-owned scope never
reads or writes the hosting Process binding and never selects a frame of another instance.
-/

@[expose] public section

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

private theorem copyValue?_name (read : String → Option (Option VariableValue)) (mapping : VariableMapping)
    (binding : VariableBinding) (copied : copyValue? read mapping = some binding) :
    binding.name = mapping.target := by
  unfold copyValue? at copied
  split at copied
  · contradiction
  all_goals
    simp only [bind, Option.bind_eq_some_iff, Option.some.injEq] at copied
    obtain ⟨_, _, rfl⟩ := copied
    rfl

/-- Each copied binding is named by its mapping's target, in mapping order. -/
theorem copyValues?_names (read : String → Option (Option VariableValue)) :
    ∀ (mappings : List VariableMapping) (bindings : List VariableBinding),
      copyValues? read mappings = some bindings → bindings.map (·.name) = mappings.map (·.target)
  | [], bindings, copied => by
      simp only [copyValues?, List.mapM_nil, pure, Option.some.injEq] at copied
      simp [← copied]
  | mapping :: rest, bindings, copied => by
      simp only [copyValues?, List.mapM_cons, bind, Option.bind_eq_some_iff, pure, Option.some.injEq] at copied
      obtain ⟨binding, one, others, many, rfl⟩ := copied
      simp only [List.map_cons, copyValue?_name read mapping binding one,
        copyValues?_names read rest others many]

private theorem copyValues?_mem (read : String → Option (Option VariableValue)) :
    ∀ (mappings : List VariableMapping) (bindings : List VariableBinding),
      copyValues? read mappings = some bindings →
      ∀ mapping ∈ mappings, ∃ binding ∈ bindings, copyValue? read mapping = some binding
  | [], _, _ => by simp
  | head :: rest, bindings, copied => by
      simp only [copyValues?, List.mapM_cons, bind, Option.bind_eq_some_iff, pure, Option.some.injEq] at copied
      obtain ⟨binding, one, others, many, rfl⟩ := copied
      intro mapping member
      rcases List.mem_cons.mp member with rfl | member
      · exact ⟨binding, List.mem_cons_self, one⟩
      · obtain ⟨other, otherMember, otherCopied⟩ := copyValues?_mem read rest others many mapping member
        exact ⟨other, List.mem_cons_of_mem _ otherMember, otherCopied⟩

/-- CALLN-FRAME-01, input side: a mapped invocation reads each input along its caller occurrence's
own chain, so for a Call inside a Sub-Process an input whose source a frame on that chain declares
copies that frame's value, never the Process binding (NSD-READ-01). -/
theorem invokeState?_reads_caller_frames (program : Program) (before after : RuntimeState)
    (origin : BpmnElementOrigin) (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (calledEntry : ControlPlaceId) (returnOperationId : OperationId)
    (inputs outputs : List VariableMapping)
    (invoked : invokeState? program before origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId inputs outputs = some after) :
    ∃ caller bindings,
      onlyTokenOwner? before input = some caller ∧
      copyValues? (readOutcome? program before.variables caller.processInstanceId caller.definitionScopeId)
        inputs = some bindings ∧
      ∀ mapping ∈ inputs, ∀ (name : String) (owner : ScopeOccurrenceId),
        mapping.expression = .enclosingVariable name →
        resolveOwner? before.variables.scopes caller.processInstanceId
          (definitionChain program.definitionScopes caller.definitionScopeId) name = some (.frame owner) →
        ∃ frame value, selectScopeVariables? before.variables owner = some frame ∧
          bindingOutcome? frame.bindings name = some value ∧
          ({ name := mapping.target, value := value.getD .null } : VariableBinding) ∈ bindings := by
  obtain ⟨caller, bindings, owned, copied, _⟩ := invokeState?_installs_snapshot program before after origin input
    calledProcessId calledRootScopeId calledEntry returnOperationId inputs outputs invoked
  refine ⟨caller, bindings, owned, copied, ?_⟩
  intro mapping member name owner expression resolved
  obtain ⟨binding, bindingMember, one⟩ := copyValues?_mem _ inputs bindings copied mapping member
  unfold copyValue? at one
  simp only [expression, readOutcome?_frame program before.variables caller.processInstanceId
    caller.definitionScopeId name owner resolved, bind, Option.bind_eq_some_iff, Option.some.injEq] at one
  obtain ⟨value, ⟨frame, selected, outcome⟩, rfl⟩ := one
  exact ⟨frame, value, selected, outcome, bindingMember⟩

/-- CALLN-FRAME-01, output side: a mapped return writes its outputs from the record's caller
occurrence, so for a Call inside a Sub-Process each output whose target that occurrence's chain
resolves to a frame lands in that frame, and the Process binding stays unchanged (NSD-WRITE-01). -/
theorem returnState?_outputs_land_in_caller_frames (program : Program) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId) (inputs outputs : List VariableMapping)
    (result : returnState? program before id origin calledProcessId calledRootScopeId callerOutput inputs outputs =
      some after) :
    ∃ (record : CalledProcessOccurrence) (values : List VariableBinding) (returned : RuntimeState),
      scalarReturnRecord? before id origin = some record ∧
      returnProcessState? before id origin calledProcessId calledRootScopeId callerOutput = some returned ∧
      values.map (·.name) = outputs.map (·.target) ∧
      ((∀ value ∈ values, ∃ owner, resolveOwner? returned.variables.scopes record.caller.processInstanceId
          (definitionChain program.definitionScopes record.caller.definitionScopeId) value.name =
            some (.frame owner)) →
        after.variables.process = returned.variables.process ∧
          ∀ value ∈ values, ∀ owner, resolveOwner? returned.variables.scopes record.caller.processInstanceId
            (definitionChain program.definitionScopes record.caller.definitionScopeId) value.name =
              some (.frame owner) →
            ∀ frame ∈ after.variables.scopes, frame.owner = owner → value ∈ frame.bindings) := by
  have distinct : (outputs.map (·.target)).Nodup := by
    unfold returnState? at result
    split at result
    · contradiction
    · rename_i valid
      simp only [callDataInterfaceValid, variableMappingsValid, Bool.not_eq_true', Bool.not_eq_false,
        Bool.and_eq_true, decide_eq_true_eq] at valid
      exact valid.2
  obtain ⟨record, _, values, returned, selected, _, copied, controlled, wrote⟩ :=
    returnState?_writes_outputs_from_caller program before after id origin calledProcessId calledRootScopeId
      callerOutput inputs outputs result
  have names := copyValues?_names _ outputs values copied
  refine ⟨record, values, returned, selected, controlled, names, fun resolvedAll => ?_⟩
  obtain ⟨process, landed, _⟩ := NestedScopeData.writeAll?_frames program _ _ values returned.variables
    after.variables wrote (names ▸ distinct) resolvedAll
  exact ⟨process, landed⟩

end CallVariableMapping
end BpmnSemantics.SemanticProcess
