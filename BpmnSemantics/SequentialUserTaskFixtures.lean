module

public import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions of [`SequentialUserTask`](SequentialUserTask.lean), apart from its theorems so that
the executable closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.SequentialUserTask


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program :=
  sequentialProgram

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-process"⟩
    ⟨program.processId.value⟩
    ⟨"Instance_1"⟩
    [ { name := "requestTitle", value := .string "Review invoice 42" } ]

def exactTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"UserTask_Approve"⟩
    activation := 1 }

def submittedValues : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "reviewNote", value := .null } ]

def initialBindings : List VariableBinding :=
  [ { name := "requestTitle", value := .string "Review invoice 42" } ]

def completedBindings : List VariableBinding :=
  [ { name := "decision", value := .string "approved" }
  , { name := "requestTitle", value := .string "Review invoice 42" }
  , { name := "reviewNote", value := .null } ]

def completionStimulus : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-user-task-instance"⟩
    exactTaskInstanceId
    submittedValues

def rootOwner : ScopeOccurrenceId :=
  rootScopeOccurrenceId ⟨"Instance_1"⟩ program.processId

def exactWait : UserTaskWait :=
  { processInstanceId := ⟨"Instance_1"⟩
    owner := rootOwner
    task :=
      { id := ⟨"UserTask_Approve"⟩
        name := some "Approve" }
    activation := 1
    output := ⟨"place:Flow_TaskToEnd"⟩ }

def afterStartState : RuntimeState :=
  { (runningProgramStartState? program ⟨"Instance_1"⟩ initialBindings).getD
      initialState with
    initiationPending := false
    waits := [exactWait]
    activations := [{ taskId := exactWait.task.id, count := 1 }] }

def completedState : RuntimeState :=
  { afterStartState with
    control := .completed ⟨"Instance_1"⟩
    scopeOccurrences := []
    waits := []
    variables :=
      { afterStartState.variables with
        process := { bindings := completedBindings } }
    endOccurrences := 1 }

def runWithClosureLimit (closureLimit : Nat) : ScenarioRunner :=
  fun scenario =>
    runScenarioWithClosureLimit closureLimit program scenario

def run : ScenarioRunner :=
  fun scenario => runScenario program scenario

end BpmnSemantics.SequentialUserTask
