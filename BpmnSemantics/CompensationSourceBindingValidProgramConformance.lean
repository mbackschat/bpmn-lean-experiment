import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source valid near-miss conformance

These Programs remain structurally valid, so their later rejection isolates checked-to-Program
definition binding rather than generic Program admission.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem swapped_restored_binding_remains_a_valid_program :
    programWellFormed swappedRestoredBindingProgram = true := by
  decide +kernel

theorem reversed_dependency_remains_a_valid_program :
    programWellFormed reversedDependencyProgram = true := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
