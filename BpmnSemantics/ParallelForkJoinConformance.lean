import BpmnSemantics.Conformance

/-! Exact neutral scenario inputs for the bounded parallel fork/join differential lane. -/

namespace BpmnSemantics.ParallelForkJoinConformance

open BpmnSemantics

private def parallelBpmn : ResourceIdentity :=
  { id := ⟨"parallel-two-user-tasks-process"⟩
    relativePath := "scenarios/parallel-fork-join/process.bpmn"
    sha256 :=
      "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6" }

private def parallelObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .enabledInteractions
  , .logicalTime ]

private def parallelProvenance : ScenarioProvenance :=
  { normativeRefs :=
      [ "BPMN 2.0.2 §10.6.4"
      , "BPMN 2.0.2 §13.4.1"
      , "BPMN 2.0.2 Table 13.1" ]
    cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
    cibRefs :=
      [ "engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/ParallelGatewayActivityBehavior.java"
      , "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/gateway/ParallelGatewayTest.java#testForkJoin" ] }

private def parallelTaskId (elementId : String) : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨elementId⟩
    activation := 1 }

private def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-process"⟩
    ⟨"Process_ParallelForkJoin"⟩
    ⟨"Instance_1"⟩

private def completionStimulus (commandId elementId : String) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ (parallelTaskId elementId)

private def parallelScenario (id : String) (completions : List Stimulus) :
    Scenario :=
  { kind := .scenario
    id := ⟨id⟩
    profile := ⟨"parallel-fork-join-draft"⟩
    bpmn := parallelBpmn
    stimuli := startStimulus :: completions
    observations := parallelObservations
    provenance := parallelProvenance }

def aThenBScenario : Scenario :=
  parallelScenario "parallel-fork-join-a-then-b"
    [ completionStimulus "complete-user-task-a" "UserTask_A"
    , completionStimulus "complete-user-task-b" "UserTask_B" ]

def bThenAScenario : Scenario :=
  parallelScenario "parallel-fork-join-b-then-a"
    [ completionStimulus "complete-user-task-b" "UserTask_B"
    , completionStimulus "complete-user-task-a" "UserTask_A" ]

end BpmnSemantics.ParallelForkJoinConformance
