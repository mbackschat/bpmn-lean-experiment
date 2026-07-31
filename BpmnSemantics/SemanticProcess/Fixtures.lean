import BpmnSemantics.SemanticProcess.Scenario

/-! # Semantic Process retained topology fixtures

This module owns the retained sequential and parallel checked graphs, lowered programs, discriminating runtime states, and generic parallel laws used by the current conformance capsules.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def sequentialCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-user-task-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 :=
          "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    processId := ⟨"Process_SequentialUserTask"⟩
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
        semanticProfile := ⟨"cibseven-2.2.0-user-task-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 :=
          "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    processId := ⟨"Process_SequentialUserTask"⟩
    controlPlaces :=
      [ { id := ⟨"place:Flow_StartToTask"⟩
          origin := { elementId := ⟨"Flow_StartToTask"⟩ } }
      , { id := ⟨"place:Flow_TaskToEnd"⟩
          origin := { elementId := ⟨"Flow_TaskToEnd"⟩ } } ]
    operations :=
      [ .terminate
          ⟨"operation:EndEvent_1"⟩
          { elementId := ⟨"EndEvent_1"⟩ }
          ⟨"place:Flow_TaskToEnd"⟩
      , .initiate
          ⟨"operation:StartEvent_1"⟩
          { elementId := ⟨"StartEvent_1"⟩ }
          ⟨"place:Flow_StartToTask"⟩
      , .awaitUserTask
          ⟨"operation:UserTask_Approve"⟩
          { elementId := ⟨"UserTask_Approve"⟩ }
          ⟨"place:Flow_StartToTask"⟩
          ⟨"place:Flow_TaskToEnd"⟩
          { id := ⟨"UserTask_Approve"⟩, name := some "Approve" } ] }

def parallelCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"parallel-two-user-tasks-process"⟩
        sourceSha256 :=
          "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6" }
    processId := ⟨"Process_ParallelForkJoin"⟩
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
  runningStartState parallelInstanceId

def parallelAfterStart : RuntimeState :=
  { parallelStartState with
    initiationPending := false
    tokens := [⟨"place:Flow_StartToFork"⟩] }

def parallelAfterFork : RuntimeState :=
  { parallelAfterStart with
    tokens :=
      [ ⟨"place:Flow_ForkToA"⟩
      , ⟨"place:Flow_ForkToB"⟩ ] }

def parallelWaitingState : RuntimeState :=
  (runChoices parallelProgram parallelStartState
    [ parallelStartOperation
    , parallelForkOperation
    , parallelTaskAOperation
    , parallelTaskBOperation ]).getD initialState

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
    tokens := [⟨"place:Flow_AToJoin"⟩, ⟨"place:Flow_AToJoin"⟩] }

def timerUserTaskCompositionCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile :=
          ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        sourceId := ⟨"timer-user-task-composition-process"⟩
        sourceSha256 :=
          "8d608a6dd0a7b40824c7ff43cb71ac92518f8171abf164110c07bfc3061521b2" }
    processId := ⟨"Process_TimerUserTaskComposition"⟩
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
      [ ⟨"place:Flow_AToJoin"⟩
      , ⟨"place:Flow_AToJoin"⟩
      , ⟨"place:Flow_BToJoin"⟩ ] }

def excessAfterJoin : RuntimeState :=
  { excessJoinState with
    tokens :=
      [ ⟨"place:Flow_JoinToEnd"⟩
      , ⟨"place:Flow_AToJoin"⟩ ] }

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
  decide

theorem parallel_task_activation_order_has_same_observation :
    observeStableState parallelProgram parallelWaitingState =
      observeStableState parallelProgram parallelWaitingStateBThenA := by
  decide

theorem parallel_supported_closure_reaches_exact_waiting_state :
    (applyStimulus scenarioClosureLimit parallelProgram initialState
      (.startProcess ⟨"start-process"⟩
        ⟨"Process_ParallelForkJoin"⟩ ⟨"Instance_1"⟩)) =
      { outcome := .committed
        state :=
          { parallelWaitingState with
            control := .running ⟨"Instance_1"⟩
            waits := parallelWaitingState.waits.map fun wait =>
              { wait with processInstanceId := ⟨"Instance_1"⟩ } }
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide

theorem exact_completion_removes_only_named_occurrence :
    waitMultiplicity parallelAfterCompletingA ⟨"UserTask_A"⟩ = 0 ∧
      waitMultiplicity parallelAfterCompletingA ⟨"UserTask_B"⟩ = 1 ∧
      tokenMultiplicity parallelAfterCompletingA ⟨"place:Flow_AToJoin"⟩ = 1 := by
  decide

theorem completion_order_independent_at_final_state :
    parallelFinalAThenB = parallelFinalBThenA := by
  decide

theorem synchronize_consumes_per_incoming_and_preserves_excess :
    step parallelProgram excessJoinState parallelJoinOperation =
      some excessAfterJoin := by
  decide

theorem token_projection_ignores_storage_permutation :
    projectTokenMultiplicities parallelProgram
        { excessJoinState with
          tokens :=
            [ ⟨"place:Flow_BToJoin"⟩
            , ⟨"place:Flow_AToJoin"⟩
            , ⟨"place:Flow_AToJoin"⟩ ] } =
      projectTokenMultiplicities parallelProgram excessJoinState := by
  decide

/-- This synthetic state is deliberately outside current admission: it locks the cross-language canonical order before mixed wait kinds become reachable. -/
private def mixedWaitProjectionProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"projection-order-test"⟩
        sourceId := ⟨"projection-order-test"⟩
        sourceSha256 := "projection-order-test" }
    processId := ⟨"Process_ProjectionOrder"⟩
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
              { interfaceId := ⟨"Interface_Projection"⟩
                interfaceOperationId := ⟨"Operation_Projection"⟩
                messageId := ⟨"Message_Projection"⟩ } }
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
  { initialState with
    control := .running ⟨"Instance_ProjectionOrder"⟩
    waits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          task := { id := ⟨"Z_UserTask"⟩, name := some "Z" }
          activation := 1
          output := ⟨"place:user-output"⟩ }
      , { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          task := { id := ⟨"B_UserTask"⟩, name := some "B" }
          activation := 1
          output := ⟨"place:user-b-output"⟩ } ]
    messageWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          elementId := ⟨"A_Message"⟩
          activation := 1
          channel :=
            { interfaceId := ⟨"Interface_Projection"⟩
              interfaceOperationId := ⟨"Operation_Projection"⟩
              messageId := ⟨"Message_Projection"⟩ }
          output := ⟨"place:message-output"⟩ } ]
    timerWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          elementId := ⟨"C_Timer"⟩
          activation := 1
          deadlineMs := 1000
          output := ⟨"place:timer-output"⟩ } ]
    effectWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
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
  decide

/-- The nearest count-based join proposition is false for two offers on only the left incoming flow. -/
theorem duplicate_left_no_right_non_law :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true ∧
      perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide


end BpmnSemantics.SemanticProcess
