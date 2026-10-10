import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! Retained topology and state fixtures are shared by executable publication probes and their proof owners. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def sequentialCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 :=
          "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    processId := ⟨"Process_SequentialUserTask"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_SequentialUserTask"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_SequentialUserTask"⟩
      [⟨"EndEvent_1"⟩, ⟨"StartEvent_1"⟩, ⟨"UserTask_Approve"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Process_SequentialUserTask"⟩
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToEnd"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_Approve"⟩ (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTask"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"UserTask_Approve"⟩ }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"EndEvent_1"⟩ } ] }

def sequentialProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 := "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_SequentialUserTask"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_SequentialUserTask"⟩]
    operationScopes := ["EndEvent_1", "StartEvent_1", "UserTask_Approve",
      "complete-scope:scope:Process_SequentialUserTask"].map fun name =>
      { operationId := ⟨"operation:" ++ name⟩, scopeId := ⟨"scope:Process_SequentialUserTask"⟩ }
    controlPlaceScopes := ["Flow_StartToTask", "Flow_TaskToEnd"].map fun name =>
      { controlPlaceId := ⟨"place:" ++ name⟩, scopeId := ⟨"scope:Process_SequentialUserTask"⟩ }
    controlPlaces := ["Flow_StartToTask", "Flow_TaskToEnd"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := ⟨⟨name⟩⟩ }
    operations :=
      [ .reachNoneEnd ⟨"operation:EndEvent_1"⟩ ⟨⟨"EndEvent_1"⟩⟩ ⟨"place:Flow_TaskToEnd"⟩
      , .initiate ⟨"operation:StartEvent_1"⟩ ⟨⟨"StartEvent_1"⟩⟩ ⟨"place:Flow_StartToTask"⟩
      , .awaitUserTask ⟨"operation:UserTask_Approve"⟩ ⟨⟨"UserTask_Approve"⟩⟩
          ⟨"place:Flow_StartToTask"⟩ ⟨"place:Flow_TaskToEnd"⟩
          { id := ⟨"UserTask_Approve"⟩, name := some "Approve" }
      , .completeScope ⟨"operation:complete-scope:scope:Process_SequentialUserTask"⟩
          ⟨⟨"Process_SequentialUserTask"⟩⟩ ⟨"scope:Process_SequentialUserTask"⟩ none ] }

def parallelCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"parallel-two-user-tasks-process"⟩
        sourceSha256 :=
          "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6" }
    processId := ⟨"Process_ParallelForkJoin"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_ParallelForkJoin"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_ParallelForkJoin"⟩
      [ ⟨"EndEvent_1"⟩, ⟨"Gateway_Fork"⟩, ⟨"Gateway_Join"⟩
      , ⟨"StartEvent_1"⟩, ⟨"UserTask_A"⟩, ⟨"UserTask_B"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Process_ParallelForkJoin"⟩
      [ ⟨"Flow_AToJoin"⟩, ⟨"Flow_BToJoin"⟩, ⟨"Flow_ForkToA"⟩
      , ⟨"Flow_ForkToB"⟩, ⟨"Flow_JoinToEnd"⟩, ⟨"Flow_StartToFork"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .parallelGateway ⟨"Gateway_Fork"⟩ .diverging
      , .parallelGateway ⟨"Gateway_Join"⟩ .converging
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_A"⟩ (some "A")
      , .userTask ⟨"UserTask_B"⟩ (some "B") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_AToJoin"⟩
          sourceId := ⟨"UserTask_A"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_BToJoin"⟩
          sourceId := ⟨"UserTask_B"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_ForkToA"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_A"⟩ }
      , { id := ⟨"Flow_ForkToB"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_B"⟩ }
      , { id := ⟨"Flow_JoinToEnd"⟩
          sourceId := ⟨"Gateway_Join"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_StartToFork"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"Gateway_Fork"⟩ } ] }

def parallelProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"parallel-two-user-tasks-process"⟩
        sourceSha256 := "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_ParallelForkJoin"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_ParallelForkJoin"⟩]
    operationScopes := ["EndEvent_1", "Gateway_Fork", "Gateway_Join", "StartEvent_1",
      "UserTask_A", "UserTask_B", "complete-scope:scope:Process_ParallelForkJoin"].map fun name =>
      { operationId := ⟨"operation:" ++ name⟩, scopeId := ⟨"scope:Process_ParallelForkJoin"⟩ }
    controlPlaceScopes := ["Flow_AToJoin", "Flow_BToJoin", "Flow_ForkToA", "Flow_ForkToB",
      "Flow_JoinToEnd", "Flow_StartToFork"].map fun name =>
      { controlPlaceId := ⟨"place:" ++ name⟩, scopeId := ⟨"scope:Process_ParallelForkJoin"⟩ }
    controlPlaces := ["Flow_AToJoin", "Flow_BToJoin", "Flow_ForkToA", "Flow_ForkToB",
      "Flow_JoinToEnd", "Flow_StartToFork"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := ⟨⟨name⟩⟩ }
    operations :=
      [ .reachNoneEnd ⟨"operation:EndEvent_1"⟩ ⟨⟨"EndEvent_1"⟩⟩ ⟨"place:Flow_JoinToEnd"⟩
      , .duplicate ⟨"operation:Gateway_Fork"⟩ ⟨⟨"Gateway_Fork"⟩⟩ ⟨"place:Flow_StartToFork"⟩
          [⟨"place:Flow_ForkToA"⟩, ⟨"place:Flow_ForkToB"⟩]
      , .synchronize ⟨"operation:Gateway_Join"⟩ ⟨⟨"Gateway_Join"⟩⟩
          [⟨"place:Flow_AToJoin"⟩, ⟨"place:Flow_BToJoin"⟩] ⟨"place:Flow_JoinToEnd"⟩
      , .initiate ⟨"operation:StartEvent_1"⟩ ⟨⟨"StartEvent_1"⟩⟩ ⟨"place:Flow_StartToFork"⟩
      , .awaitUserTask ⟨"operation:UserTask_A"⟩ ⟨⟨"UserTask_A"⟩⟩
          ⟨"place:Flow_ForkToA"⟩ ⟨"place:Flow_AToJoin"⟩ { id := ⟨"UserTask_A"⟩, name := some "A" }
      , .awaitUserTask ⟨"operation:UserTask_B"⟩ ⟨⟨"UserTask_B"⟩⟩
          ⟨"place:Flow_ForkToB"⟩ ⟨"place:Flow_BToJoin"⟩ { id := ⟨"UserTask_B"⟩, name := some "B" }
      , .completeScope ⟨"operation:complete-scope:scope:Process_ParallelForkJoin"⟩
          ⟨⟨"Process_ParallelForkJoin"⟩⟩ ⟨"scope:Process_ParallelForkJoin"⟩ none ] }

def parallelInstanceId : SemanticId := ⟨"Instance_Parallel"⟩
def parallelStartOperation : OperationId := ⟨"operation:StartEvent_1"⟩
def parallelForkOperation : OperationId := ⟨"operation:Gateway_Fork"⟩
def parallelJoinOperation : OperationId := ⟨"operation:Gateway_Join"⟩
def parallelTaskAOperation : OperationId := ⟨"operation:UserTask_A"⟩
def parallelTaskBOperation : OperationId := ⟨"operation:UserTask_B"⟩
def parallelEndOperation : OperationId := ⟨"operation:EndEvent_1"⟩

def parallelStartState : RuntimeState :=
  (runningProgramStartState? parallelProgram parallelInstanceId []).getD initialState

def parallelAfterStart : RuntimeState :=
  { parallelStartState with
    initiationPending := false
    tokens := [rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
      ⟨"place:Flow_StartToFork"⟩] }

def parallelAfterFork : RuntimeState :=
  { parallelAfterStart with
    tokens :=
      [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_ForkToA"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_ForkToB"⟩ ] }

def parallelWaitingStateFor (instanceId : SemanticId) : RuntimeState :=
  let start :=
    (runningProgramStartState? parallelProgram instanceId []).getD initialState
  (runChoices parallelProgram start
    [ parallelStartOperation
    , parallelForkOperation
    , parallelTaskAOperation
    , parallelTaskBOperation ]).getD initialState

def parallelWaitingState : RuntimeState :=
  parallelWaitingStateFor parallelInstanceId

def parallelWaitingStateBThenA : RuntimeState :=
  (runChoices parallelProgram parallelStartState
    [ parallelStartOperation
    , parallelForkOperation
    , parallelTaskBOperation
    , parallelTaskAOperation ]).getD initialState

def parallelJoinInputs : List ControlPlaceId :=
  [⟨"place:Flow_AToJoin"⟩, ⟨"place:Flow_BToJoin"⟩]

def duplicateLeftNoRightState : RuntimeState :=
  { parallelAfterFork with
    tokens :=
      [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩ ] }

def timerUserTaskCompositionCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile :=
          ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        sourceId := ⟨"timer-user-task-composition-process"⟩
        sourceSha256 :=
          "8d608a6dd0a7b40824c7ff43cb71ac92518f8171abf164110c07bfc3061521b2" }
    processId := ⟨"Process_TimerUserTaskComposition"⟩
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_TimerUserTaskComposition"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_TimerUserTaskComposition"⟩
      [ ⟨"EndEvent_1"⟩, ⟨"StartEvent_1"⟩, ⟨"TimerCatch_PT1S"⟩
      , ⟨"UserTask_Approve"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_TimerUserTaskComposition"⟩
      [⟨"Flow_StartToTimer"⟩, ⟨"Flow_TaskToEnd"⟩, ⟨"Flow_TimerToTask"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .intermediateCatchTimerEvent ⟨"TimerCatch_PT1S"⟩ "PT1S"
      , .userTask ⟨"UserTask_Approve"⟩ (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTimer"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"TimerCatch_PT1S"⟩ }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_TimerToTask"⟩
          sourceId := ⟨"TimerCatch_PT1S"⟩
          targetId := ⟨"UserTask_Approve"⟩ } ] }

def timerUserTaskCompositionProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        sourceId := ⟨"timer-user-task-composition-process"⟩
        sourceSha256 := "8d608a6dd0a7b40824c7ff43cb71ac92518f8171abf164110c07bfc3061521b2" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_TimerUserTaskComposition"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_TimerUserTaskComposition"⟩]
    operationScopes := ["EndEvent_1", "StartEvent_1", "TimerCatch_PT1S", "UserTask_Approve",
      "complete-scope:scope:Process_TimerUserTaskComposition"].map fun name =>
      { operationId := ⟨"operation:" ++ name⟩, scopeId := ⟨"scope:Process_TimerUserTaskComposition"⟩ }
    controlPlaceScopes := ["Flow_StartToTimer", "Flow_TaskToEnd", "Flow_TimerToTask"].map fun name =>
      { controlPlaceId := ⟨"place:" ++ name⟩, scopeId := ⟨"scope:Process_TimerUserTaskComposition"⟩ }
    controlPlaces := ["Flow_StartToTimer", "Flow_TaskToEnd", "Flow_TimerToTask"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := ⟨⟨name⟩⟩ }
    operations :=
      [ .reachNoneEnd ⟨"operation:EndEvent_1"⟩ ⟨⟨"EndEvent_1"⟩⟩ ⟨"place:Flow_TaskToEnd"⟩
      , .initiate ⟨"operation:StartEvent_1"⟩ ⟨⟨"StartEvent_1"⟩⟩ ⟨"place:Flow_StartToTimer"⟩
      , .awaitTimer ⟨"operation:TimerCatch_PT1S"⟩ ⟨⟨"TimerCatch_PT1S"⟩⟩
          ⟨"place:Flow_StartToTimer"⟩ ⟨"place:Flow_TimerToTask"⟩
          { elementId := ⟨"TimerCatch_PT1S"⟩, durationMs := 1000 }
      , .awaitUserTask ⟨"operation:UserTask_Approve"⟩ ⟨⟨"UserTask_Approve"⟩⟩
          ⟨"place:Flow_TimerToTask"⟩ ⟨"place:Flow_TaskToEnd"⟩
          { id := ⟨"UserTask_Approve"⟩, name := some "Approve" }
      , .completeScope ⟨"operation:complete-scope:scope:Process_TimerUserTaskComposition"⟩
          ⟨⟨"Process_TimerUserTaskComposition"⟩⟩ ⟨"scope:Process_TimerUserTaskComposition"⟩ none ] }

def reverseTimerUserTaskCompositionCheckedProcess : CheckedProcess :=
  { timerUserTaskCompositionCheckedProcess with
    identity :=
      { timerUserTaskCompositionCheckedProcess.identity with
        sourceId := ⟨"reverse-timer-user-task-composition"⟩ }
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_TimerUserTaskComposition"⟩
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToTimer"⟩, ⟨"Flow_TimerToEnd"⟩]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTask"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"UserTask_Approve"⟩ }
      , { id := ⟨"Flow_TaskToTimer"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"TimerCatch_PT1S"⟩ }
      , { id := ⟨"Flow_TimerToEnd"⟩
          sourceId := ⟨"TimerCatch_PT1S"⟩
          targetId := ⟨"EndEvent_1"⟩ } ] }

def reverseTimerUserTaskCompositionProgram : Program :=
  lowerCheckedProcess reverseTimerUserTaskCompositionCheckedProcess

def timerUserTaskCompositionStart : Stimulus :=
  .startProcess
    ⟨"start-timer-user-task-composition"⟩
    ⟨"Process_TimerUserTaskComposition"⟩
    ⟨"CompositionInstance_1"⟩
    []

def timerUserTaskCompositionFire : Stimulus :=
  .fireTimer
    ⟨"fire-timer-sha256:c6c6b5904c8ae7a91ee52294ba85c07d8e76d31c531a67f9bf3b3172e34fb1cd"⟩
    { processInstanceId := ⟨"CompositionInstance_1"⟩
      elementId := ⟨"TimerCatch_PT1S"⟩
      activation := 1 }
    1000

def timerUserTaskCompositionComplete : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-composed-user-task"⟩
    { processInstanceId := ⟨"CompositionInstance_1"⟩
      elementId := ⟨"UserTask_Approve"⟩
      activation := 1 }
    []

def timerUserTaskCompositionTimerWait : StimulusResult :=
  applyStimulus scenarioClosureLimit timerUserTaskCompositionProgram
    initialState timerUserTaskCompositionStart

def timerUserTaskCompositionTaskWait : StimulusResult :=
  applyStimulus scenarioClosureLimit timerUserTaskCompositionProgram
    timerUserTaskCompositionTimerWait.state timerUserTaskCompositionFire

def timerUserTaskCompositionCompleted : StimulusResult :=
  applyStimulus scenarioClosureLimit timerUserTaskCompositionProgram
    timerUserTaskCompositionTaskWait.state timerUserTaskCompositionComplete

def reverseTimerUserTaskCompositionTaskWait : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseTimerUserTaskCompositionProgram
    initialState timerUserTaskCompositionStart

def reverseTimerUserTaskCompositionTimerWait : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseTimerUserTaskCompositionProgram
    reverseTimerUserTaskCompositionTaskWait.state
    timerUserTaskCompositionComplete

def reverseTimerUserTaskCompositionCompleted : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseTimerUserTaskCompositionProgram
    reverseTimerUserTaskCompositionTimerWait.state
    timerUserTaskCompositionFire

def excessJoinState : RuntimeState :=
  { parallelAfterFork with
    tokens :=
      [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_BToJoin"⟩ ] }

def excessAfterJoin : RuntimeState :=
  { excessJoinState with
    tokens :=
      [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_JoinToEnd"⟩ ] }

def parallelAfterCompletingA : RuntimeState :=
  (completeUserTask parallelWaitingState parallelInstanceId
    ⟨"UserTask_A"⟩ 1).getD initialState

def parallelAfterAThenB : RuntimeState :=
  (completeUserTask parallelAfterCompletingA parallelInstanceId
    ⟨"UserTask_B"⟩ 1).getD initialState

def parallelAfterCompletingB : RuntimeState :=
  (completeUserTask parallelWaitingState parallelInstanceId
    ⟨"UserTask_B"⟩ 1).getD initialState

def parallelAfterBThenA : RuntimeState :=
  (completeUserTask parallelAfterCompletingB parallelInstanceId
    ⟨"UserTask_A"⟩ 1).getD initialState

def parallelFinalAThenB : RuntimeState :=
  (runChoices parallelProgram parallelAfterAThenB
    [parallelJoinOperation, parallelEndOperation]).getD initialState

def parallelFinalBThenA : RuntimeState :=
  (runChoices parallelProgram parallelAfterBThenA
    [parallelJoinOperation, parallelEndOperation]).getD initialState

end BpmnSemantics.SemanticProcess
