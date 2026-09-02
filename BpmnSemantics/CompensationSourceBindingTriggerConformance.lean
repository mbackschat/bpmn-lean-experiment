import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source trigger-binding conformance

Trigger endpoints, trigger scope, and the deliberately dormant handler scope remain independent
negative decisions.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem binding_rejects_trigger_flow_drift :
    definitionBindingValid checkedProcess triggerFlowProgram = false := by
  decide +kernel

theorem binding_rejects_trigger_scope_drift :
    definitionBindingValid checkedProcess triggerScopeProgram = false := by
  decide +kernel

theorem binding_rejects_an_executable_dormant_scope :
    definitionBindingValid checkedProcess executableDormantScopeProgram = false := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
