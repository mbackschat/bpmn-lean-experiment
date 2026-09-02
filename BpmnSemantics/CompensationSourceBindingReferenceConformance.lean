import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source reference-binding conformance

Endpoint, dependency direction, and effect identity remain independent negative decisions.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem binding_rejects_a_swapped_restored_endpoint :
    definitionBindingValid checkedProcess swappedRestoredBindingProgram = false := by
  decide +kernel

theorem binding_rejects_a_reversed_dependency :
    definitionBindingValid checkedProcess reversedDependencyProgram = false := by
  decide +kernel

theorem binding_rejects_a_substituted_effect :
    definitionBindingValid checkedProcess substitutedEffectProgram = false := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
