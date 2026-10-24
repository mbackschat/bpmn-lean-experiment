module

public import BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Compensation source valid near-miss conformance

These Programs remain structurally valid, so their later rejection isolates checked-to-Program
definition binding rather than generic Program admission.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem swapped_restored_binding_remains_a_valid_program :
    programWellFormed swappedRestoredBindingProgram = true := by
  decide +kernel

theorem reversed_dependency_remains_a_valid_program :
    programWellFormed reversedDependencyProgram = true := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance
