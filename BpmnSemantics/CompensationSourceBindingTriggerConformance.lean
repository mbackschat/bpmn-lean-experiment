module

public import BpmnSemantics.CompensationSourceLoweringFixtures
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation

/-! # Compensation source trigger-binding conformance

Trigger endpoints, trigger scope, and the deliberately dormant handler scope remain independent
negative decisions.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def binding_rejects_trigger_flow_drift : Bool := decide <|
    definitionBindingValid checkedProcess triggerFlowProgram = false

def binding_rejects_trigger_scope_drift : Bool := decide <|
    definitionBindingValid checkedProcess triggerScopeProgram = false

def binding_rejects_an_executable_dormant_scope : Bool := decide <|
    definitionBindingValid checkedProcess executableDormantScopeProgram = false

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceBindingTriggerConformanceChecks : List (String × Bool) := [
  ("binding_rejects_trigger_flow_drift", binding_rejects_trigger_flow_drift),
  ("binding_rejects_trigger_scope_drift", binding_rejects_trigger_scope_drift),
  ("binding_rejects_an_executable_dormant_scope", binding_rejects_an_executable_dormant_scope)
]

end BpmnSemantics.CompensationSourceLoweringConformance
