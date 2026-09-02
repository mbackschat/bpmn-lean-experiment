import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcessJsonMain
import Lean.Data.Json

/-! # Compensation trigger and handler runtime contract checkpoint -/

namespace BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJsonMain
open Lean

private def instanceId : SemanticId := ⟨"compensation-runtime-instance"⟩

private def occurrence (elementId : String) : OccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨elementId⟩, activation := 1 }

private def failure : CompensationHandlerFailure :=
  { kind := .compensationHandlerFailure
    triggerId := occurrence "trigger"
    handlerId := occurrence "handler"
    effectId := occurrence "effect"
    code := "COMPENSATION_FAILED"
    message := some "handler failed" }

private def owner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:process"⟩
    activation := 1 }

private def subject : CompensationSubjectOccurrence :=
  .boundaryActivity
    { processInstanceId := instanceId
      activityElementId := ⟨"activity"⟩
      activation := 1 }

private def eventSubProcessParent : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:parent"⟩
    activation := 1 }

private def restoredContext : CompensationParentContextSnapshot :=
  { frames :=
      [ { owner
          bindings := [{ name := "completionContext", value := .string "frozen" }] }
      , { owner := eventSubProcessParent, bindings := [] } ] }

private def pendingEventSubProcessHandler : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "event-handler"
        subject := .eventSubProcess eventSubProcessParent
        handlerElementId := ⟨"event-handler"⟩ }
    lifecycle := .pending (some restoredContext) }

private def failedHandler : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "handler"
        subject
        handlerElementId := ⟨"handler"⟩ }
    lifecycle := .failed }

private def failedTrigger : CompensationTriggerExecution :=
  { id := occurrence "trigger"
    owner
    output := ⟨"place:output"⟩
    lifecycle := .failed
    handlers := [failedHandler]
    dependencies := [] }

private def declaration : CompensationExecutionDeclaration :=
  { definitionScopeId := owner.definitionScopeId
    triggerOperationId := ⟨"trigger"⟩
    subjects := []
    dependencies := []
    limits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 4096 } }

private def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"compensation-runtime-contract"⟩
        sourceId := ⟨"source"⟩
        sourceSha256 := "source-sha256" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"process"⟩
    definitionScopes := []
    operationScopes := []
    controlPlaceScopes := []
    controlPlaces := []
    operations := []
    compensationExecution := some declaration }

private def failedState : RuntimeState :=
  { initialState with
    control := .failed instanceId failure
    compensationTriggers := [failedTrigger] }

private def liveHandlerWait : CompensationHandlerEffectWait :=
  { id := occurrence "effect"
    triggerId := occurrence "trigger"
    handlerId := occurrence "handler"
    descriptor :=
      { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
        operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
    arguments := [] }

private def failedStateWithLiveWait : RuntimeState :=
  { failedState with compensationHandlerEffectWaits := [liveHandlerWait] }

private def failedStateWithoutTombstone : RuntimeState :=
  { failedState with compensationTriggers := [] }

private def expectedFailedObservation : StateObservation :=
  { instanceId
    status := .failed
    failure := some failure
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    openIncidents := []
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

private def completedObservationWithMalformedFailure : StateObservation :=
  { expectedFailedObservation with status := .completed }

private def occurrenceJson (id : OccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson id.processInstanceId.value)
    , ("elementId", toJson id.elementId.value)
    , ("activation", toJson id.activation) ]

private def expectedFailureJson : Json :=
  Json.mkObj
    [ ("kind", toJson "compensationHandlerFailure")
    , ("triggerId", occurrenceJson failure.triggerId)
    , ("handlerId", occurrenceJson failure.handlerId)
    , ("effectId", occurrenceJson failure.effectId)
    , ("code", toJson failure.code)
    , ("message", toJson failure.message) ]

private def expectedFailedJson : Json :=
  Json.mkObj
    [ ("kind", toJson "state")
    , ("instanceId", toJson instanceId.value)
    , ("status", toJson "failed")
    , ("failure", expectedFailureJson)
    , ("activeWaits", .arr #[])
    , ("openUserTasks", .arr #[])
    , ("openMessageSubscriptions", .arr #[])
    , ("openTimers", .arr #[])
    , ("openEffects", .arr #[])
    , ("openIncidents", .arr #[])
    , ("variables", .arr #[])
    , ("enabledInteractions", .arr #[])
    , ("logicalTimeMs", toJson 0) ]

private def expectedCompletedJson : Json :=
  Json.mkObj
    [ ("kind", toJson "state")
    , ("instanceId", toJson instanceId.value)
    , ("status", toJson "completed")
    , ("activeWaits", .arr #[])
    , ("openUserTasks", .arr #[])
    , ("openMessageSubscriptions", .arr #[])
    , ("openTimers", .arr #[])
    , ("openEffects", .arr #[])
    , ("openIncidents", .arr #[])
    , ("variables", .arr #[])
    , ("enabledInteractions", .arr #[])
    , ("logicalTimeMs", toJson 0) ]

private def failedStateWithLiveScope : RuntimeState :=
  { failedState with scopeOccurrences := [{ id := owner, parent := none }] }

theorem failed_projection_requires_closed_state_and_matching_tombstones_while_existing_json_omits_failure :
    observeStableState program failedState = some expectedFailedObservation ∧
      observeStableState program failedStateWithLiveWait = none ∧
      observeStableState program failedStateWithoutTombstone = none ∧
      stateObservationJson expectedFailedObservation = expectedFailedJson ∧
      stateObservationJson completedObservationWithMalformedFailure = expectedCompletedJson ∧
      captureCompensationParentContext? program failedStateWithLiveScope
        { id := owner, parent := none } = none ∧
      stableStateResumable failedState = false := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem pending_event_subprocess_handler_owns_its_frozen_context :
    pendingEventSubProcessHandler.lifecycle = .pending (some restoredContext) := by
  rfl

end BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance
