module

public import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source valid near-miss conformance

These Programs remain structurally valid, so their later rejection isolates checked-to-Program
definition binding rather than generic Program admission.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def swapped_restored_binding_remains_a_valid_program : Bool := decide <|
    programWellFormed swappedRestoredBindingProgram = true

def reversed_dependency_remains_a_valid_program : Bool := decide <|
    programWellFormed reversedDependencyProgram = true

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceBindingValidProgramConformanceChecks : List (String × Bool) := [
  ("swapped_restored_binding_remains_a_valid_program", swapped_restored_binding_remains_a_valid_program),
  ("reversed_dependency_remains_a_valid_program", reversed_dependency_remains_a_valid_program)
]

end BpmnSemantics.CompensationSourceLoweringConformance
