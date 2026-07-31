import BpmnSemantics.Contract
import BpmnSemantics.Scenario
import BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.Conformance — profile-independent contract locks

These examples lock only distinctions required directly by the architecture handoff.
They are not evidence of BPMN or CIB Seven compatibility.
-/

namespace BpmnSemantics

example : CommandOutcome.committed.isCommit = true := rfl
example : CommandOutcome.rolledBack.isCommit = false := rfl
example : CommandOutcome.rejected.isCommit = false := rfl
example : CommandOutcome.semanticFailure.isCommit = false := rfl
example : CommandOutcome.unsupported.isCommit = false := rfl

example : ScenarioOutcome.semantic .rolledBack ≠ .semantic .rejected := by
  decide

example : ScenarioOutcome.semantic .semanticFailure ≠ .harnessFailure := by
  decide

example : ScenarioOutcome.infrastructureFailure ≠ .harnessFailure := by
  decide

def contractScenario : Scenario :=
  { kind := .scenario
    id := ⟨"user-task-discovery-completion"⟩
    profile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
    bpmn :=
      { id := ⟨"sequential-user-task-process"⟩
        relativePath := "scenarios/user-task-discovery-completion/process.bpmn"
        sha256 := "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    stimuli :=
      [ .startProcess ⟨"start-process"⟩ ⟨"Process_SequentialUserTask"⟩ ⟨"Instance_1"⟩
          [ { name := "requestTitle", value := .string "Review invoice 42" } ]
      , .completeUserTaskInstance ⟨"complete-user-task-instance"⟩
          { processInstanceId := ⟨"Instance_1"⟩
            elementId := ⟨"UserTask_Approve"⟩
            activation := 1 }
          [ { name := "decision", value := .string "approved" }
          , { name := "reviewNote", value := .null } ] ]
    observations :=
      [ .deployment
      , .commandResults
      , .processStatus
      , .activeWaits
      , .openUserTasks
      , .openTimers
      , .openEffects
      , .variables
      , .enabledInteractions
      , .logicalTime ]
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.7.3"
          , "BPMN 2.0.2 §13.3.2"
          , "BPMN 2.0.2 §13.3.3" ]
        cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
        cibRefs :=
          [ "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/UserTaskTest.java#testTaskPropertiesNotNull"
          , "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/TaskAssigneeTest.java#testTaskAssignee"
          , "engine/src/test/java/org/cibseven/bpm/engine/test/api/task/TaskServiceTest.java#testCompleteTaskUnexistingTaskId" ] } }

example : contractScenario.stimuli.length = 2 := rfl

def emptyRunner : ScenarioRunner :=
  fun _ =>
    { outcome := .semantic .committed
      trace := [] }

example : (emptyRunner contractScenario).trace = [] := rfl

#check SemanticProcess.Obligations.evaluator_sound
#check SemanticProcess.Obligations.lower_preserves_supported_run

end BpmnSemantics
