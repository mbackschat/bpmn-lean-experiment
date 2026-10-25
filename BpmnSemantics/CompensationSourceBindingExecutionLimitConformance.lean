module

public import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source execution-limit binding conformance

Trigger-count, handler-count, and canonical-byte limits remain three separately reduced binding
obligations.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def binding_rejects_execution_trigger_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateExecutionLimits 2 3 20480) = false

def binding_rejects_execution_handler_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateExecutionLimits 1 4 20480) = false

def binding_rejects_execution_byte_limit_drift : Bool := decide <|
    definitionBindingValid checkedProcess (mutateExecutionLimits 1 3 20481) = false

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceBindingExecutionLimitConformanceChecks : List (String × Bool) := [
  ("binding_rejects_execution_trigger_limit_drift", binding_rejects_execution_trigger_limit_drift),
  ("binding_rejects_execution_handler_limit_drift", binding_rejects_execution_handler_limit_drift),
  ("binding_rejects_execution_byte_limit_drift", binding_rejects_execution_byte_limit_drift)
]

end BpmnSemantics.CompensationSourceLoweringConformance
