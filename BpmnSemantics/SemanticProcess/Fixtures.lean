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
      , .awaitTimer
          ⟨"operation:A_Timer"⟩
          { elementId := ⟨"A_Timer"⟩ }
          ⟨"place:timer-input"⟩
          ⟨"place:timer-output"⟩
          { elementId := ⟨"A_Timer"⟩, durationMs := 1000 }
      , .awaitEffect
          ⟨"operation:M_Effect"⟩
          { elementId := ⟨"M_Effect"⟩ }
          ⟨"place:effect-input"⟩
          ⟨"place:effect-output"⟩
          { elementId := ⟨"M_Effect"⟩
            descriptor :=
              { protocol := "urn:bpmn-lean:effect:probe-v1"
                handler := "bpmnLeanEffectHandler" }
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
          output := ⟨"place:user-output"⟩ } ]
    timerWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          elementId := ⟨"A_Timer"⟩
          activation := 1
          deadlineMs := 1000
          output := ⟨"place:timer-output"⟩ } ]
    effectWaits :=
      [ { processInstanceId := ⟨"Instance_ProjectionOrder"⟩
          elementId := ⟨"M_Effect"⟩
          activation := 1
          descriptor :=
            { protocol := "urn:bpmn-lean:effect:probe-v1"
              handler := "bpmnLeanEffectHandler" }
          arguments := []
          outputMappings := []
          output := ⟨"place:effect-output"⟩
          bpmnErrorRoute := none } ] }

theorem active_wait_projection_orders_by_kind_then_element_id :
    (observeStableState mixedWaitProjectionProgram mixedWaitProjectionState).map
        (·.activeWaits) =
      some
        [ { elementId := ⟨"Z_UserTask"⟩
            kind := .userTask
            multiplicity := 1 }
        , { elementId := ⟨"A_Timer"⟩
            kind := .timer
            multiplicity := 1 }
        , { elementId := ⟨"M_Effect"⟩
            kind := .effect
            multiplicity := 1 } ] := by
  decide

/-- The nearest count-based join proposition is false for two offers on only the left incoming flow. -/
theorem duplicate_left_no_right_non_law :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true ∧
      perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide


end BpmnSemantics.SemanticProcess
