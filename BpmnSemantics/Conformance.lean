import BpmnSemantics.Contract
import BpmnSemantics.Scenario

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
  { schemaVersion := "0.1.0"
    id := ⟨"m0-sequential-user-task"⟩
    profile := ⟨"cibseven-2.2.0-spike.1"⟩
    bpmn :=
      { id := ⟨"m0-sequential-user-task-process"⟩
        relativePath := "scenarios/m0-sequential-user-task/process.bpmn"
        sha256 := "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295" }
    stimuli :=
      [ .startProcess ⟨"start-process"⟩ ⟨"Process_SequentialUserTask"⟩ ⟨"Instance_1"⟩
      , .completeUserTask ⟨"complete-user-task"⟩ ⟨"UserTask_Approve"⟩ ]
    observations :=
      [ .deployment
      , .commandResults
      , .processStatus
      , .activeWaits
      , .enabledStimuli
      , .logicalTime ]
    provenance :=
      { normativeRefs := ["BPMN 2.0.2 §13.2", "BPMN 2.0.2 §13.3"]
        cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
        cibRefs :=
          [ "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/UserTaskTest.java"
          , "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/TaskAssigneeTest.java" ] } }

example : contractScenario.stimuli.length = 2 := rfl

def emptyRunner : ScenarioRunner :=
  fun _ =>
    { outcome := .semantic .committed
      trace := [] }

example : (emptyRunner contractScenario).trace = [] := rfl

end BpmnSemantics
