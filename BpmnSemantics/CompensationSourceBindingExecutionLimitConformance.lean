module

public import BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Compensation source execution-limit binding conformance

Trigger-count, handler-count, and canonical-byte limits remain three separately reduced binding
obligations.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem binding_rejects_execution_trigger_limit_drift :
    definitionBindingValid checkedProcess (mutateExecutionLimits 2 3 20480) = false := by
  decide +kernel

theorem binding_rejects_execution_handler_limit_drift :
    definitionBindingValid checkedProcess (mutateExecutionLimits 1 4 20480) = false := by
  decide +kernel

theorem binding_rejects_execution_byte_limit_drift :
    definitionBindingValid checkedProcess (mutateExecutionLimits 1 3 20481) = false := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
