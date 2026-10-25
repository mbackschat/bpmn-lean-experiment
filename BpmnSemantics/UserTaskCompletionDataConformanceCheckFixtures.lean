module

public import BpmnSemantics.SequentialUserTaskFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`UserTaskCompletionDataConformance`](UserTaskCompletionDataConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.UserTaskCompletionDataConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask

def existingBindings : List VariableBinding :=
  [ { name := "decision", value := .string "pending" }
  , { name := "untouched", value := .string "kept" } ]

def stateWithExistingBindings : RuntimeState :=
  { afterStartState with
    variables :=
      { afterStartState.variables with
        process := { bindings := existingBindings } } }

def expectedBindings : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "reviewNote", value := .null }
  , { name := "untouched", value := .string "kept" } ]

def completedStateWithMergedBindings : RuntimeState :=
  { completedState with
    variables :=
      { completedState.variables with
        process := { bindings := expectedBindings } } }

/-- Merely placing completion data in a future stimulus cannot affect the operations enabled by the current waiting state. -/
def waiting_enabledness_is_data_independent : Bool := decide <|
    enabledInternalOperationCount program stateWithExistingBindings =
      enabledInternalOperationCount program afterStartState

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("waiting_enabledness_is_data_independent", waiting_enabledness_is_data_independent)
]

end BpmnSemantics.UserTaskCompletionDataConformance
