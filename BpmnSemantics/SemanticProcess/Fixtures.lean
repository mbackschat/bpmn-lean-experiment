module

public import BpmnSemantics.SemanticProcess.TopologyFixtures
public import BpmnSemantics.SemanticProcess.Scenario

/-! # Semantic Process retained topology fixtures

This module owns the retained sequential and parallel checked graphs, independent expected programs, discriminating runtime states, and generic parallel laws used by the current conformance capsules. The expected programs are authored separately from lowering so the exact-lowering laws can detect a changed lowering result, as required by AA-25 in the assurance architecture repair proposal.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def parallel_start_creates_exact_branch_waits : Bool := decide <|
    waitMultiplicity parallelWaitingState ⟨"UserTask_A"⟩ = 1 ∧
      waitMultiplicity parallelWaitingState ⟨"UserTask_B"⟩ = 1 ∧
      parallelWaitingState.tokens = []

def parallel_task_activation_order_has_same_observation : Bool := decide <|
    observeStableState parallelProgram parallelWaitingState =
      observeStableState parallelProgram parallelWaitingStateBThenA

def parallel_supported_closure_reaches_exact_waiting_state : Bool := decide <|
    (applyStimulus scenarioClosureLimit parallelProgram initialState
      (.startProcess ⟨"start-process"⟩
        ⟨"Process_ParallelForkJoin"⟩ ⟨"Instance_1"⟩ [])) =
      { outcome := .committed
        state := parallelWaitingStateFor ⟨"Instance_1"⟩
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def exact_completion_removes_only_named_occurrence : Bool := decide <|
    waitMultiplicity parallelAfterCompletingA ⟨"UserTask_A"⟩ = 0 ∧
      waitMultiplicity parallelAfterCompletingA ⟨"UserTask_B"⟩ = 1 ∧
      tokenMultiplicity parallelAfterCompletingA ⟨"place:Flow_AToJoin"⟩ = 1

def completion_order_independent_at_final_state : Bool := decide <|
    parallelFinalAThenB = parallelFinalBThenA

def synchronize_consumes_per_incoming_and_preserves_excess : Bool := decide <|
    step parallelProgram excessJoinState parallelJoinOperation =
      some excessAfterJoin

def token_projection_ignores_storage_permutation : Bool := decide <|
    projectTokenMultiplicities parallelProgram
        { excessJoinState with
          tokens :=
            [ rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_BToJoin"⟩
            , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_AToJoin"⟩
            , rootToken parallelInstanceId ⟨"Process_ParallelForkJoin"⟩
                ⟨"place:Flow_AToJoin"⟩ ] } =
      projectTokenMultiplicities parallelProgram excessJoinState

/-- This synthetic state is deliberately outside current admission: it locks the cross-language canonical order before mixed wait kinds become reachable. -/
def mixedWaitProjectionProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"projection-order-test"⟩
        sourceId := ⟨"projection-order-test"⟩
        sourceSha256 := "projection-order-test" }
    internalSchedulingMode := .rejectObservableChoice
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

def mixedWaitProjectionState : RuntimeState :=
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
def active_wait_projection_orders_by_semantic_kind : Bool := decide <|
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
            multiplicity := 1 } ]

/-- The nearest count-based join proposition is false for two offers on only the left incoming flow. -/
def duplicate_left_no_right_non_law : Bool := decide <|
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true ∧
      perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false


/-- Every executable check of this module, named for the driver's failure report. -/
def fixturesChecks : List (String × Bool) := [
  ("parallel_start_creates_exact_branch_waits", parallel_start_creates_exact_branch_waits),
  ("parallel_task_activation_order_has_same_observation", parallel_task_activation_order_has_same_observation),
  ("parallel_supported_closure_reaches_exact_waiting_state", parallel_supported_closure_reaches_exact_waiting_state),
  ("exact_completion_removes_only_named_occurrence", exact_completion_removes_only_named_occurrence),
  ("completion_order_independent_at_final_state", completion_order_independent_at_final_state),
  ("synchronize_consumes_per_incoming_and_preserves_excess", synchronize_consumes_per_incoming_and_preserves_excess),
  ("token_projection_ignores_storage_permutation", token_projection_ignores_storage_permutation),
  ("active_wait_projection_orders_by_semantic_kind", active_wait_projection_orders_by_semantic_kind),
  ("duplicate_left_no_right_non_law", duplicate_left_no_right_non_law)
]

end BpmnSemantics.SemanticProcess
