import BpmnSemantics.Contract
import BpmnSemantics.Scenario
import BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.Conformance — profile-independent contract locks

These facts lock only distinctions required directly by the architecture handoff.
They are not evidence of BPMN or CIB Seven compatibility.
-/

namespace BpmnSemantics

namespace CommandOutcome

theorem isCommit_iff_committed (outcome : CommandOutcome) :
    outcome.isCommit = true ↔ outcome = .committed := by
  cases outcome <;> decide +kernel

end CommandOutcome

theorem rollback_and_rejection_outcomes_are_distinct :
    ScenarioOutcome.semantic .rolledBack ≠ .semantic .rejected := by
  decide +kernel

theorem semantic_and_harness_failures_are_distinct :
    ScenarioOutcome.semantic .semanticFailure ≠ .harnessFailure := by
  decide +kernel

theorem infrastructure_and_harness_failures_are_distinct :
    ScenarioOutcome.infrastructureFailure ≠ .harnessFailure := by
  decide +kernel

def contractScenario : Scenario :=
  { kind := .scenario
    id := ⟨"user-task-discovery-completion"⟩
    profile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
    bpmn :=
      { id := ⟨"sequential-user-task-process"⟩
        relativePath := "scenarios/user-task-discovery-completion/process.bpmn"
        sha256 := "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d"
        sourceOverlay := none }
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

theorem contract_scenario_has_two_stimuli :
    contractScenario.stimuli.length = 2 := rfl

def emptyRunner : ScenarioRunner :=
  fun _ =>
    { outcome := .semantic .committed
      trace := [] }

theorem empty_runner_emits_no_trace :
    (emptyRunner contractScenario).trace = [] := rfl

#check SemanticProcess.Obligations.evaluator_sound
#check SemanticProcess.Obligations.lower_preserves_supported_run

end BpmnSemantics
