import BpmnSemantics.SemanticProcess.Transition

/-! # Interrupting Sub-Process Error propagation

This module owns reusable regional-interruption laws and the nearest synthetic negative witness for the direct catch-only Error profile. The admitted program fixture and artifact equality remain in the capsule conformance module; these laws deliberately range over runtime state without depending on one topology.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Regional interruption never rewrites monotonic activation or End occurrence history. -/
theorem interruptScope_preserves_runtime_history
    (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) :
    let after := interruptScope state root parent output
    after.activations = state.activations ∧
      after.messageActivations = state.messageActivations ∧
      after.timerActivations = state.timerActivations ∧
      after.effectActivations = state.effectActivations ∧
      after.scopeActivations = state.scopeActivations ∧
      after.endOccurrences = state.endOccurrences := by
  simp [interruptScope]

/-- Every User Task wait owned by the interrupted occurrence subtree is removed. -/
theorem interruptScope_removes_interrupted_user_wait
    (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) (wait : UserTaskWait)
    (interrupted : occurrenceInSubtree state.scopeOccurrences root wait.owner = true) :
    wait ∉ (interruptScope state root parent output).waits := by
  simp [interruptScope, interrupted]

/-- A User Task wait outside the interrupted occurrence subtree survives. -/
theorem interruptScope_preserves_unrelated_user_wait
    (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) (wait : UserTaskWait)
    (present : wait ∈ state.waits)
    (unrelated : occurrenceInSubtree state.scopeOccurrences root wait.owner = false) :
    wait ∈ (interruptScope state root parent output).waits := by
  simp [interruptScope, present, unrelated]

private def instanceId : SemanticId := ⟨"ErrorInstance"⟩

private def rootId : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:Process_Error" ⟩
    activation := 1 }

private def childId : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:SubProcess_Error" ⟩
    activation := 1 }

private def descendantId : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:SyntheticDescendant" ⟩
    activation := 1 }

private def errorReference : ErrorReference :=
  { errorDefinitionId := ⟨"ErrorDefinition_Throw"⟩
    errorElementId := ⟨"Error_ScopedFailure"⟩
    code := "ScopedFailure" }

private def errorHandler : InterruptingErrorHandler :=
  { attachedScopeId := childId.definitionScopeId
    code := "ScopedFailure"
    output := ⟨"place:BoundaryToRecover"⟩
    origin :=
      { boundaryEventId := ⟨"BoundaryEvent_ScopedFailure"⟩
        errorDefinitionId := ⟨"ErrorDefinition_Catch"⟩
        errorElementId := ⟨"Error_ScopedFailure"⟩
        sequenceFlowId := ⟨"BoundaryToRecover"⟩ } }

private def childEffectId : EffectOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"SyntheticChildEffect"⟩
    activation := 1 }

private def syntheticState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences :=
      [ { id := descendantId, parent := some childId }
      , { id := childId, parent := some rootId }
      , { id := rootId, parent := none } ]
    tokens :=
      [ { placeId := ⟨"place:ErrorInput"⟩, owner := childId }
      , { placeId := ⟨"place:Descendant"⟩, owner := descendantId }
      , { placeId := ⟨"place:RootWork"⟩, owner := rootId } ]
    waits :=
      [ { processInstanceId := instanceId
          owner := childId
          task := { id := ⟨"ChildTask"⟩, name := some "Child" }
          activation := 1
          output := ⟨"place:ChildTaskOutput"⟩ }
      , { processInstanceId := instanceId
          owner := rootId
          task := { id := ⟨"RootTask"⟩, name := some "Root" }
          activation := 1
          output := ⟨"place:RootTaskOutput"⟩ } ]
    messageWaits :=
      [ { processInstanceId := instanceId
          owner := childId
          elementId := ⟨"ChildMessage"⟩
          activation := 1
          channel :=
            (.operationMessage ⟨"Interface"⟩ ⟨"Operation"⟩ ⟨"Message"⟩)
          output := ⟨"place:MessageOutput"⟩ } ]
    timerWaits :=
      [ { processInstanceId := instanceId
          owner := descendantId
          elementId := ⟨"ChildTimer"⟩
          activation := 1
          deadlineMs := 1000
          output := ⟨"place:TimerOutput"⟩ } ]
    effectWaits :=
      [ { processInstanceId := instanceId
          owner := childId
          elementId := ⟨"SyntheticChildEffect"⟩
          activation := 1
          descriptor := { protocol := "synthetic", operation := "synthetic" }
          arguments := []
          outputMappings := []
          output := ⟨"place:EffectOutput"⟩
          bpmnErrorRoute := none } ]
    variables :=
      { process := { bindings := [] }
        activities := [{ owner := childEffectId, bindings := [] }] }
    activations := [{ taskId := ⟨"HistoryTask"⟩, count := 7 }]
    messageActivations := [{ elementId := ⟨"HistoryMessage"⟩, count := 5 }]
    timerActivations := [{ elementId := ⟨"HistoryTimer"⟩, count := 4 }]
    effectActivations := [{ elementId := ⟨"HistoryEffect"⟩, count := 3 }]
    scopeActivations := [{ scopeId := ⟨"HistoryScope"⟩, count := 2 }]
    endOccurrences := 1 }

private def syntheticInterrupted : RuntimeState :=
  interruptScope syntheticState childId rootId errorHandler.output

/-- The executable throw performs the full regional interruption atomically. -/
theorem synthetic_throw_catches_and_cancels_region :
    throwErrorState? syntheticState ⟨"place:ErrorInput"⟩
      errorReference errorHandler = some syntheticInterrupted := by
  decide

/-- The synthetic cross-kind witness locks descendant removal, parent preservation, Activity-scope cleanup, and monotonic history together. -/
theorem synthetic_interruption_inventory :
    syntheticInterrupted.scopeOccurrences = [{ id := rootId, parent := none }] ∧
      syntheticInterrupted.tokens =
        [ { placeId := ⟨"place:BoundaryToRecover"⟩, owner := rootId }
        , { placeId := ⟨"place:RootWork"⟩, owner := rootId } ] ∧
      syntheticInterrupted.waits.length = 1 ∧
      syntheticInterrupted.messageWaits = [] ∧
      syntheticInterrupted.timerWaits = [] ∧
      syntheticInterrupted.effectWaits = [] ∧
      syntheticInterrupted.variables.activities = [] ∧
      syntheticInterrupted.activations = syntheticState.activations ∧
      syntheticInterrupted.messageActivations = syntheticState.messageActivations ∧
      syntheticInterrupted.timerActivations = syntheticState.timerActivations ∧
      syntheticInterrupted.effectActivations = syntheticState.effectActivations ∧
      syntheticInterrupted.scopeActivations = syntheticState.scopeActivations ∧
      syntheticInterrupted.endOccurrences = 1 := by
  decide

/-- Nearest checked non-law: interrupting a child region is not global wait cancellation. -/
theorem regional_interruption_is_not_global_cancellation :
    syntheticInterrupted.waits ≠ [] := by
  decide

end BpmnSemantics.SemanticProcess
