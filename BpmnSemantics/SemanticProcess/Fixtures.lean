import BpmnSemantics.SemanticProcess.Scenario

/-! # Semantic Process retained topology fixtures

This module owns the retained sequential and parallel checked graphs, lowered programs, discriminating runtime states, and generic parallel laws used by the current conformance capsules.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def rootDefinitionScopeId (processId : ProcessId) : DefinitionScopeId :=
  ⟨"scope:" ++ processId.value⟩

def rootDefinitionScope (processId : ProcessId) : DefinitionScope :=
  { id := rootDefinitionScopeId processId
    parentScopeId := none
    originElementId := ⟨processId.value⟩ }

def rootNodeScopes (processId : ProcessId) (nodeIds : List NodeId) :
    List NodeScopeOwnership :=
  nodeIds.map fun nodeId => { nodeId, scopeId := rootDefinitionScopeId processId }

def rootSequenceFlowScopes (processId : ProcessId)
    (flowIds : List SequenceFlowId) : List SequenceFlowScopeOwnership :=
  flowIds.map fun sequenceFlowId =>
    { sequenceFlowId, scopeId := rootDefinitionScopeId processId }

def rootScopeOccurrenceId (instanceId : SemanticId) (processId : ProcessId) :
    ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := rootDefinitionScopeId processId
    activation := 1 }

def rootToken (instanceId : SemanticId) (processId : ProcessId)
    (placeId : ControlPlaceId) : ControlToken :=
  { placeId, owner := rootScopeOccurrenceId instanceId processId }

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
  lowerCheckedProcess sequentialCheckedProcess

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
  lowerCheckedProcess parallelCheckedProcess

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
  lowerCheckedProcess timerUserTaskCompositionCheckedProcess

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
          ⟨"place:Flow_JoinToEnd"⟩
      , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
          ⟨"place:Flow_AToJoin"⟩ ] }

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

theorem parallel_start_creates_exact_branch_waits :
    waitMultiplicity parallelWaitingState ⟨"UserTask_A"⟩ = 1 ∧
      waitMultiplicity parallelWaitingState ⟨"UserTask_B"⟩ = 1 ∧
      parallelWaitingState.tokens = [] := by
  decide +kernel

theorem parallel_task_activation_order_has_same_observation :
    observeStableState parallelProgram parallelWaitingState =
      observeStableState parallelProgram parallelWaitingStateBThenA := by
  decide +kernel

theorem parallel_supported_closure_reaches_exact_waiting_state :
    (applyStimulus scenarioClosureLimit parallelProgram initialState
      (.startProcess ⟨"start-process"⟩
        ⟨"Process_ParallelForkJoin"⟩ ⟨"Instance_1"⟩ [])) =
      { outcome := .committed
        state := parallelWaitingStateFor ⟨"Instance_1"⟩
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem exact_completion_removes_only_named_occurrence :
    waitMultiplicity parallelAfterCompletingA ⟨"UserTask_A"⟩ = 0 ∧
      waitMultiplicity parallelAfterCompletingA ⟨"UserTask_B"⟩ = 1 ∧
      tokenMultiplicity parallelAfterCompletingA ⟨"place:Flow_AToJoin"⟩ = 1 := by
  decide +kernel

theorem completion_order_independent_at_final_state :
    parallelFinalAThenB = parallelFinalBThenA := by
  decide +kernel

theorem synchronize_consumes_per_incoming_and_preserves_excess :
    step parallelProgram excessJoinState parallelJoinOperation =
      some excessAfterJoin := by
  decide +kernel

theorem token_projection_ignores_storage_permutation :
    projectTokenMultiplicities parallelProgram
        { excessJoinState with
          tokens :=
            [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_BToJoin"⟩
            , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_AToJoin"⟩
            , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_AToJoin"⟩ ] } =
      projectTokenMultiplicities parallelProgram excessJoinState := by
  decide +kernel

/-- This synthetic state is deliberately outside current admission: it locks the cross-language canonical order before mixed wait kinds become reachable. -/
private def mixedWaitProjectionProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"projection-order-test"⟩
        sourceId := ⟨"projection-order-test"⟩
        sourceSha256 := "projection-order-test" }
    processId := ⟨"Process_ProjectionOrder"⟩
    definitionScopes := []
    operationScopes := []
    controlPlaceScopes := []
    controlPlaces := []
    operations :=
      [ .awaitUserTask
          ⟨"operation:Z_UserTask"⟩
          { elementId := ⟨"Z_UserTask"⟩ }
          ⟨"place:user-input"⟩
          ⟨"place:user-output"⟩
          { id := ⟨"Z_UserTask"⟩, name := some "Z" }
      , .awaitUserTask
          ⟨"operation:B_UserTask"⟩
          { elementId := ⟨"B_UserTask"⟩ }
          ⟨"place:user-b-input"⟩
          ⟨"place:user-b-output"⟩
          { id := ⟨"B_UserTask"⟩, name := some "B" }
      , .awaitMessage
          ⟨"operation:A_Message"⟩
          { elementId := ⟨"A_Message"⟩ }
          ⟨"place:message-input"⟩
          ⟨"place:message-output"⟩
          { elementId := ⟨"A_Message"⟩
            channel :=
              (.operationMessage ⟨"Interface_Projection"⟩
                ⟨"Operation_Projection"⟩ ⟨"Message_Projection"⟩) }
      , .awaitTimer
          ⟨"operation:C_Timer"⟩
          { elementId := ⟨"C_Timer"⟩ }
          ⟨"place:timer-input"⟩
          ⟨"place:timer-output"⟩
          { elementId := ⟨"C_Timer"⟩, durationMs := 1000 }
      , .awaitEffect
          ⟨"operation:D_Effect"⟩
          { elementId := ⟨"D_Effect"⟩ }
          ⟨"place:effect-input"⟩
          ⟨"place:effect-output"⟩
          { elementId := ⟨"D_Effect"⟩
            descriptor :=
              { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
                operation := "urn:bpmn-lean:effect-operation:probe-v1" }
            inputMappings := []
            outputMappings := [] }
          none ] }

private def mixedWaitProjectionState : RuntimeState :=
  let owner : ScopeOccurrenceId :=
    rootScopeOccurrenceId ⟨"Instance_ProjectionOrder"⟩
      ⟨"Process_ProjectionOrder"⟩
  { initialState with
    control := .running ⟨"Instance_ProjectionOrder"⟩
    scopeOccurrences := [{ id := owner, parent := none }]
    waits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          owner
          task := { id := ⟨"Z_UserTask"⟩, name := some "Z" }
          activation := 1
          output := ⟨"place:user-output"⟩ }
      , { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          owner
          task := { id := ⟨"B_UserTask"⟩, name := some "B" }
          activation := 1
          output := ⟨"place:user-b-output"⟩ } ]
    messageWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          owner
          elementId := ⟨"A_Message"⟩
          activation := 1
          channel :=
            (.operationMessage ⟨"Interface_Projection"⟩
              ⟨"Operation_Projection"⟩ ⟨"Message_Projection"⟩)
          output := ⟨"place:message-output"⟩ } ]
    timerWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          owner
          elementId := ⟨"C_Timer"⟩
          activation := 1
          deadlineMs := 1000
          output := ⟨"place:timer-output"⟩ } ]
    effectWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          owner
          elementId := ⟨"D_Effect"⟩
          activation := 1
          descriptor :=
            { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
              operation := "urn:bpmn-lean:effect-operation:probe-v1" }
          arguments := []
          outputMappings := []
          output := ⟨"place:effect-output"⟩
          bpmnErrorRoute := none } ] }

/-- This four-kind lock makes a global element-ID sort disagree with semantic-kind order and reverses the two User Task definitions so the projection must also sort by element ID within a kind. -/
theorem active_wait_projection_orders_by_semantic_kind :
    (observeStableState mixedWaitProjectionProgram mixedWaitProjectionState).map
        (·.activeWaits) =
      some
        [ { elementId := ⟨"B_UserTask"⟩
            kind := .userTask
            multiplicity := 1 }
        , { elementId := ⟨"Z_UserTask"⟩
            kind := .userTask
            multiplicity := 1 }
        , { elementId := ⟨"A_Message"⟩
            kind := .message
            multiplicity := 1 }
        , { elementId := ⟨"C_Timer"⟩
            kind := .timer
            multiplicity := 1 }
        , { elementId := ⟨"D_Effect"⟩
            kind := .effect
            multiplicity := 1 } ] := by
  decide +kernel

/-- The nearest count-based join proposition is false for two offers on only the left incoming flow. -/
theorem duplicate_left_no_right_non_law :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true ∧
      perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide +kernel


end BpmnSemantics.SemanticProcess
