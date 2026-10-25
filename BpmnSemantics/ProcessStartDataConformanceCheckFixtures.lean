module

public import BpmnSemantics.SequentialUserTaskFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`ProcessStartDataConformance`](ProcessStartDataConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.ProcessStartDataConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask
/-- Start data does not change the quiescent enabled-operation count of the admitted first wait. -/
def first_wait_enabledness_is_initial_data_independent : Bool := decide <|
    enabledInternalOperationCount program afterStartState =
      enabledInternalOperationCount program
        { afterStartState with variables := emptyScopedVariables }

/-- String start data belongs to the Process-data composition, not to a structurally similar profile. -/
def process_start_value_domain_is_profile_closed : Bool := decide <|
    variableValueAdmitted
        ⟨"bpmn-2.0.2-user-task-preserved-notation-draft"⟩
        .processStart (.string "unexpected") = false ∧
      variableValueAdmitted
        ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        .processStart (.string "unexpected") = false ∧
      variableValueAdmitted
        ⟨"cibseven-2.2.0-user-task-process-data-preserved-notation-draft"⟩
        .processStart (.string "selected") = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("first_wait_enabledness_is_initial_data_independent", first_wait_enabledness_is_initial_data_independent),
  ("process_start_value_domain_is_profile_closed", process_start_value_domain_is_profile_closed)
]

end BpmnSemantics.ProcessStartDataConformance
