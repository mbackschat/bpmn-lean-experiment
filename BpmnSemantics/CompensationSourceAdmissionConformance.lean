module

public import BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import all BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.CheckedProcessContract
import all BpmnSemantics.SemanticProcess.UserTaskMetadata
import all BpmnSemantics.SemanticProcessContract
import all BpmnSemantics.WireNatural

/-! # Compensation source admission and lowering conformance

The exact checked graph, independently authored Program, profile admission, lowering equality, and
cross-artifact definition binding remain separate kernel decisions so no compound fixture term can
consume the complete memory allowance.
-/

public section

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
