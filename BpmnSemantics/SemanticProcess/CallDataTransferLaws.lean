import BpmnSemantics.SemanticProcess.CallDataTransfer
import BpmnSemantics.SemanticProcess.ActivityDataEndpointLaws

/-! Scalar Call snapshots preserve caller and callee inputs beyond the local constructor-selection bridges. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem invokeScalarProcessStep_snapshot {before after : RuntimeState}
    {origin input calledProcessId calledRootScopeId calledEntry returnOperationId data}
    (step : InvokeScalarProcessStep before origin input calledProcessId calledRootScopeId
      calledEntry returnOperationId data after) :
    ∃ caller binding,
      onlyTokenOwner? before input = some caller ∧
      readActivityDataInput? .scalar before caller data.directInput = some binding ∧
      selectProcessInterface? after.variables (scalarInvocationRoot before caller origin calledRootScopeId) =
        some { owner := scalarInvocationRoot before caller origin calledRootScopeId
               inputs := [{ name := data.called.input.id, value := binding.value }], outputs := [] } ∧
      readProcessInterfaceOutput? after.variables (scalarInvocationRoot before caller origin calledRootScopeId)
        data.called.output.id = none ∧
      after.variables.process = before.variables.process ∧
      after.variables.activities = before.variables.activities ∧
      after.variables.processInterfaces.filter (fun scope => decide
        (scope.owner ≠ scalarInvocationRoot before caller origin calledRootScopeId)) =
      before.variables.processInterfaces.filter (fun scope => decide
        (scope.owner ≠ scalarInvocationRoot before caller origin calledRootScopeId)) := by
  cases step with
  | permitted caller binding controlAfter valid owned available fresh scalar control =>
      refine ⟨caller, binding, owned, available, ?_, ?_, rfl, rfl, ?_⟩
      · exact addProcessInterface_installs (addProcessInterface_success_iff.mpr ⟨fresh, scalar, rfl⟩)
      · exact (addProcessInterface_input_available_output_unavailable
          (input := { name := data.called.input.id, value := binding.value })
          (addProcessInterface_success_iff.mpr ⟨fresh, scalar, rfl⟩) _).2
      · exact addProcessInterface_frames_others (input := { name := data.called.input.id, value := binding.value })
          (addProcessInterface_success_iff.mpr ⟨fresh, scalar, rfl⟩)

end BpmnSemantics.SemanticProcess
