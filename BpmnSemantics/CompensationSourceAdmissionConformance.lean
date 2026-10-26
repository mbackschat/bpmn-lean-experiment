module

public import BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation

/-! # Compensation source admission and lowering conformance

The exact checked graph, independently authored Program, profile admission, lowering equality, and
cross-artifact definition binding remain separate kernel decisions so no compound fixture term can
consume the complete memory allowance.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def exact_checked_source_is_admitted : Bool := decide <|
    checkedWellFormed checkedProcess = true

theorem exact_source_lowers_to_independent_program :
    lowerCheckedProcess checkedProcess = expectedProgram := by
  rfl

theorem exact_program_is_admitted :
    programWellFormed expectedProgram = true := by
  decide +kernel

theorem exact_program_profile_is_admitted :
    programProfileCapabilitiesValid expectedProgram = true := by
  decide +kernel

def exact_checked_source_and_program_are_bound : Bool := decide <|
    definitionBindingValid checkedProcess expectedProgram = true

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceAdmissionConformanceChecks : List (String × Bool) := [
  ("exact_checked_source_is_admitted", exact_checked_source_is_admitted),
  ("exact_checked_source_and_program_are_bound", exact_checked_source_and_program_are_bound)
]

end BpmnSemantics.CompensationSourceLoweringConformance
