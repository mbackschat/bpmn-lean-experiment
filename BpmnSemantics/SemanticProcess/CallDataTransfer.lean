import BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime
import BpmnSemantics.SemanticProcess.CallActivity

/-! # Atomic scalar Call transfers

CDATA-INPUT-01 and CDATA-OUTPUT-01 compose explicit owned data movement with the existing
Call control relations. Empty interfaces retain the original control domain.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def scalarInvocationRoot (state : RuntimeState) (caller : ScopeOccurrenceId)
    (origin : BpmnElementOrigin) (calledRootScopeId : DefinitionScopeId) : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId caller.processInstanceId origin.elementId
      (callActivationCount state origin.elementId + 1)
    definitionScopeId := calledRootScopeId, activation := 1 }

def scalarReturnRecord? (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) : Option CalledProcessOccurrence :=
  match state.calledProcessOccurrences.filter fun record =>
      decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value) with
  | [record] => some record
  | _ => none

def invokeProcessWithDataState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId) (data : CallDataInterface) : Option RuntimeState :=
  match data with
  | .empty => invokeProcessState? state origin input calledProcessId calledRootScopeId calledEntry returnOperationId
  | .scalar data => do
      if callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value then
        let caller ← onlyTokenOwner? state input
        let binding ← readActivityDataInput? .scalar state caller data.directInput
        let variables ← addProcessInterface? state.variables
          (scalarInvocationRoot state caller origin calledRootScopeId)
          { name := data.called.input.id, value := binding.value }
        let invoked ← invokeProcessState? state origin input calledProcessId calledRootScopeId calledEntry returnOperationId
        some { invoked with variables }
      else none
  -- Mapped copies resolve names through the Program's scope chain, so the dispatcher routes them to
  -- `CallVariableMapping.invokeState?`; this Program-free transfer refuses them.
  | .variableMappings .. => none

def returnProcessWithDataState? (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId)
    (data : CallDataInterface) : Option RuntimeState :=
  match data with
  | .empty => returnProcessState? state id origin calledProcessId calledRootScopeId callerOutput
  | .scalar data => do
      if callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value then
        let record ← scalarReturnRecord? state id origin
        let binding ← readProcessInterfaceOutput? state.variables record.calledRoot data.called.output.id
        let returned ← returnProcessState? state id origin calledProcessId calledRootScopeId callerOutput
        let variables ← writeActivityDataOutput? .scalar returned record.caller returned.variables data.directOutput binding
        some { returned with variables }
      else none
  | .variableMappings .. => none

/-- Input transfer fixes the exact source, fresh owner, scalar snapshot and complete control step. -/
inductive InvokeScalarProcessStep : RuntimeState → BpmnElementOrigin → ControlPlaceId →
    ProcessId → DefinitionScopeId → ControlPlaceId → OperationId → ScalarCallData → RuntimeState → Prop where
  | permitted before origin input calledProcessId calledRootScopeId calledEntry returnOperationId data
      caller binding controlAfter
      (valid : callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value = true)
      (owned : onlyTokenOwner? before input = some caller)
      (available : readActivityDataInput? .scalar before caller data.directInput = some binding)
      (fresh : before.variables.processInterfaces.any (fun scope => decide
        (scope.owner = scalarInvocationRoot before caller origin calledRootScopeId)) = false)
      (scalar : processInterfaceScalar binding.value = true)
      (control : InvokeProcessStep before origin input calledProcessId calledRootScopeId calledEntry returnOperationId controlAfter) :
      InvokeScalarProcessStep before origin input calledProcessId calledRootScopeId calledEntry returnOperationId data
        { controlAfter with variables := { before.variables with processInterfaces :=
          (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
            { owner := scalarInvocationRoot before caller origin calledRootScopeId
              inputs := [{ name := data.called.input.id, value := binding.value }], outputs := [] }
            before.variables.processInterfaces) } }

/-- Output transfer requires a unique owned output before the control relation removes its owner. -/
inductive ReturnScalarProcessStep : RuntimeState → OperationId → BpmnElementOrigin →
    ProcessId → DefinitionScopeId → ControlPlaceId → ScalarCallData → RuntimeState → Prop where
  | permitted before id origin calledProcessId calledRootScopeId callerOutput data
      record scope binding controlAfter variables
      (valid : callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value = true)
      (selected : before.calledProcessOccurrences.filter (fun record => decide
        (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) = [record])
      (owned : before.variables.processInterfaces.filter
        (fun candidate => decide (candidate.owner = record.calledRoot)) = [scope])
      (available : scope.outputs.filter (fun candidate => decide (candidate.name = data.called.output.id)) = [binding])
      (scalar : processInterfaceScalar binding.value = true)
      (control : ReturnProcessStep before id origin calledProcessId calledRootScopeId callerOutput controlAfter)
      (routed : ActivityDataOutputRouting .scalar controlAfter record.caller controlAfter.variables data.directOutput binding variables) :
      ReturnScalarProcessStep before id origin calledProcessId calledRootScopeId callerOutput data
        { controlAfter with variables }

theorem scalarReturnRecord_iff {state : RuntimeState} {id : OperationId} {origin : BpmnElementOrigin}
    {record : CalledProcessOccurrence} : scalarReturnRecord? state id origin = some record ↔
    state.calledProcessOccurrences.filter (fun record => decide
      (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) = [record] := by
  unfold scalarReturnRecord?
  split <;> simp_all

private theorem scalarCallOutput_is_property {data : ScalarCallData} {callId processId : String}
    (valid : callDataInterfaceValid (.scalar data) callId processId = true) :
    ∃ property, data.directOutput.target = .property property := by
  cases source : data.directInput.source <;> cases target : data.directOutput.target
  all_goals first | exact ⟨_, rfl⟩ | simp [callDataInterfaceValid, source, target] at valid

/-- The control relation and data selector must identify the same record; copy-back cannot choose
a different caller after cleanup. The complete successor equality frames every unrelated field. -/
theorem returnScalarProcessStep_exact_copy_back {before after : RuntimeState}
    {id origin calledProcessId calledRootScopeId callerOutput data}
    (step : ReturnScalarProcessStep before id origin calledProcessId calledRootScopeId callerOutput data after) :
    ∃ record scope binding property,
      before.calledProcessOccurrences.filter (fun record => decide
        (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) = [record] ∧
      before.variables.processInterfaces.filter (fun candidate => decide (candidate.owner = record.calledRoot)) = [scope] ∧
      scope.outputs.filter (fun candidate => decide (candidate.name = data.called.output.id)) = [binding] ∧
      data.directOutput.target = .property property ∧
      after = { removeCalledProcessTree before record with
        tokens := addToken (removeCalledProcessTree before record).tokens callerOutput record.caller
        variables := { (removeCalledProcessTree before record).variables with process := { bindings :=
          (mergeProcessVariableBindings (removeCalledProcessTree before record).variables.process.bindings
            [{ name := property, value := binding.value }]) } } } := by
  cases step with
  | permitted record scope binding controlAfter variables valid selected owned available scalar control routed =>
      obtain ⟨actual, root, actualSelected, _, _, _, controlExact⟩ :=
        return_step_removes_exact_association_and_emits_one_continuation _ _ _ _ _ _ _ control
      have same : actual = record := by
        rw [selected] at actualSelected
        simpa using actualSelected.symm
      subst actual
      obtain ⟨property, target⟩ := scalarCallOutput_is_property valid
      have routing := routed.2
      simp only [target] at routing
      obtain ⟨_, rfl⟩ := routing
      exact ⟨record, scope, binding, property, selected, owned, available, target, by rw [controlExact]⟩

theorem returnProcessWithDataState_missing_output_refused
    (state : RuntimeState) (id origin calledProcessId calledRootScopeId callerOutput data record)
    (selected : scalarReturnRecord? state id origin = some record)
    (missing : readProcessInterfaceOutput? state.variables record.calledRoot data.called.output.id = none) :
    returnProcessWithDataState? state id origin calledProcessId calledRootScopeId callerOutput (.scalar data) = none := by
  simp [returnProcessWithDataState?, selected, missing]

theorem returnScalarProcessStep_disposes_exact_owner {before after : RuntimeState}
    {id origin calledProcessId calledRootScopeId callerOutput data}
    (step : ReturnScalarProcessStep before id origin calledProcessId calledRootScopeId callerOutput data after) :
    ∃ record,
      before.calledProcessOccurrences.filter (fun record => decide
        (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) = [record] ∧
      record ∉ after.calledProcessOccurrences ∧
      after.variables.processInterfaces.all (fun scope => decide (scope.owner ≠ record.calledRoot)) = true := by
  obtain ⟨record, _, _, _, selected, _, _, _, rfl⟩ := returnScalarProcessStep_exact_copy_back step
  refine ⟨record, selected, ?_, ?_⟩
  · simp [removeCalledProcessTree]
  · apply List.all_eq_true.mpr
    intro scope member
    apply decide_eq_true
    intro same
    have rootMember : record.calledRoot.processInstanceId ∈ processInstanceClosureWithin
        before.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (before.calledProcessOccurrences.length + 1) :=
      processInstanceClosureWithin_seed_subset _ _ _ (by simp)
    simp [removeCalledProcessTree, same, rootMember] at member

theorem invokeProcessWithDataState_missing_input_refused
    (state : RuntimeState) (origin input calledProcessId calledRootScopeId calledEntry returnOperationId data caller)
    (selected : onlyTokenOwner? state input = some caller)
    (missing : readActivityDataInput? .scalar state caller data.directInput = none) :
    invokeProcessWithDataState? state origin input calledProcessId calledRootScopeId
      calledEntry returnOperationId (.scalar data) = none := by
  simp [invokeProcessWithDataState?, selected, missing]

theorem invokeProcessWithDataState_sound (before after : RuntimeState)
    (origin input calledProcessId calledRootScopeId calledEntry returnOperationId data)
    (result : invokeProcessWithDataState? before origin input calledProcessId calledRootScopeId
      calledEntry returnOperationId (.scalar data) = some after) :
    InvokeScalarProcessStep before origin input calledProcessId calledRootScopeId calledEntry returnOperationId data after := by
  by_cases valid : callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value = true
  · simp [invokeProcessWithDataState?, valid, Option.bind_eq_some_iff] at result
    obtain ⟨caller, owned, binding, available, variables, added, controlAfter, invoked, rfl⟩ := result
    obtain ⟨fresh, scalar, rfl⟩ := addProcessInterface_success_iff.mp added
    exact .permitted before origin input calledProcessId calledRootScopeId calledEntry returnOperationId data
      caller binding controlAfter valid owned available fresh scalar
      (invokeProcessState_sound _ _ _ _ _ _ _ _ invoked)
  · simp [invokeProcessWithDataState?, valid] at result

theorem returnProcessWithDataState_sound (before after : RuntimeState)
    (id origin calledProcessId calledRootScopeId callerOutput data)
    (result : returnProcessWithDataState? before id origin calledProcessId calledRootScopeId
      callerOutput (.scalar data) = some after) :
    ReturnScalarProcessStep before id origin calledProcessId calledRootScopeId callerOutput data after := by
  by_cases valid : callDataInterfaceValid (.scalar data) origin.elementId.value calledProcessId.value = true
  · simp [returnProcessWithDataState?, valid, Option.bind_eq_some_iff] at result
    obtain ⟨record, selected, binding, available, controlAfter, returned, variables, written, rfl⟩ := result
    obtain ⟨scope, owned, output, scalar⟩ := readProcessInterfaceOutput_iff.mp available
    exact .permitted before id origin calledProcessId calledRootScopeId callerOutput data
      record scope binding controlAfter variables valid (scalarReturnRecord_iff.mp selected)
      (selectProcessInterface_iff.mp owned) output scalar
      (returnProcessState_sound _ _ _ _ _ _ _ returned) (writeActivityDataOutput_sound written)
  · simp [returnProcessWithDataState?, valid] at result

end BpmnSemantics.SemanticProcess
