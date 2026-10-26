module

public import BpmnSemantics.CompensationSourceLoweringFixtures
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation

/-! # Compensation source reference-binding conformance

Endpoint, dependency direction, and effect identity remain independent negative decisions.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def binding_rejects_a_swapped_restored_endpoint : Bool := decide <|
    definitionBindingValid checkedProcess swappedRestoredBindingProgram = false

def binding_rejects_a_reversed_dependency : Bool := decide <|
    definitionBindingValid checkedProcess reversedDependencyProgram = false

def binding_rejects_a_substituted_effect : Bool := decide <|
    definitionBindingValid checkedProcess substitutedEffectProgram = false

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceBindingReferenceConformanceChecks : List (String × Bool) := [
  ("binding_rejects_a_swapped_restored_endpoint", binding_rejects_a_swapped_restored_endpoint),
  ("binding_rejects_a_reversed_dependency", binding_rejects_a_reversed_dependency),
  ("binding_rejects_a_substituted_effect", binding_rejects_a_substituted_effect)
]

end BpmnSemantics.CompensationSourceLoweringConformance
