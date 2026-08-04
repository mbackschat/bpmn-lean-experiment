import BpmnSemantics.SemanticProcess

/-! # Embedded Sub-Process Error propagation conformance

This module owns the direct Lean account for one exact-code Error End caught by the single interrupting boundary Error on its directly enclosing embedded Sub-Process. It locks both child-command orders, regional sibling cancellation, the unreachable normal route, exact stale refusal, recovery completion, and the deliberate internal End-history difference behind one equal public recovery observation.
-/

namespace BpmnSemantics.SubProcessErrorPropagationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"cibseven-2.2.0-subprocess-error-propagation-draft"⟩

def processId : ProcessId :=
  ⟨"Process_SubProcessErrorPropagationProbe"⟩

def rootScopeId : DefinitionScopeId :=
  ⟨"scope:Process_SubProcessErrorPropagationProbe"⟩

def childScopeId : DefinitionScopeId :=
  ⟨"scope:SubProcess_Work"⟩

def thrownError : ErrorReference :=
  { errorDefinitionId := ⟨"ErrorEventDefinition_ThrownScopedFailure"⟩
    errorElementId := ⟨"Error_ScopedFailure"⟩
    code := "ScopedFailure" }

def caughtError : ErrorReference :=
  { errorDefinitionId := ⟨"ErrorEventDefinition_CaughtScopedFailure"⟩
    errorElementId := ⟨"Error_ScopedFailure"⟩
    code := "ScopedFailure" }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"subprocess-error-propagation-process"⟩
        sourceSha256 :=
          "f920ed0454a56b6649d0ecaa915a0ab5b3ed4f3bb974fba9c6255039ecb801a2" }
    processId
    definitionScopes :=
      [ { id := rootScopeId
          parentScopeId := none
          originElementId := ⟨processId.value⟩ }
      , { id := childScopeId
          parentScopeId := some rootScopeId
          originElementId := ⟨"SubProcess_Work"⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"BoundaryEvent_ScopedFailure"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"EndEvent_Normal"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"EndEvent_Recovered"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"EndEvent_ScopedFailure"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"EndEvent_SiblingWork"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"Gateway_ChildFork"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"StartEvent_Child"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"StartEvent_Outer"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"SubProcess_Work"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"UserTask_Recover"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"UserTask_SiblingWork"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"UserTask_TriggerError"⟩, scopeId := childScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"Flow_BoundaryToRecover"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildStartToFork"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ForkToSiblingWork"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ForkToTriggerError"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_OuterStartToScope"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_RecoverToRecoveredEnd"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_ScopeToNormalEnd"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_SiblingWorkToNoneEnd"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_TriggerErrorToErrorEnd"⟩, scopeId := childScopeId } ]
    nodes :=
      [ .boundaryErrorEvent ⟨"BoundaryEvent_ScopedFailure"⟩
          ⟨"SubProcess_Work"⟩ caughtError ⟨"Flow_BoundaryToRecover"⟩
      , .noneEndEvent ⟨"EndEvent_Normal"⟩
      , .noneEndEvent ⟨"EndEvent_Recovered"⟩
      , .errorEndEvent ⟨"EndEvent_ScopedFailure"⟩ thrownError
      , .noneEndEvent ⟨"EndEvent_SiblingWork"⟩
      , .parallelGateway ⟨"Gateway_ChildFork"⟩ .diverging
      , .noneStartEvent ⟨"StartEvent_Child"⟩
      , .noneStartEvent ⟨"StartEvent_Outer"⟩
      , .embeddedSubProcess ⟨"SubProcess_Work"⟩ childScopeId
      , .userTask ⟨"UserTask_Recover"⟩ (some "Recover")
      , .userTask ⟨"UserTask_SiblingWork"⟩ (some "Sibling Work")
      , .userTask ⟨"UserTask_TriggerError"⟩ (some "Trigger Error") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_BoundaryToRecover"⟩
          sourceId := ⟨"BoundaryEvent_ScopedFailure"⟩
          targetId := ⟨"UserTask_Recover"⟩ }
      , { id := ⟨"Flow_ChildStartToFork"⟩
          sourceId := ⟨"StartEvent_Child"⟩
          targetId := ⟨"Gateway_ChildFork"⟩ }
      , { id := ⟨"Flow_ForkToSiblingWork"⟩
          sourceId := ⟨"Gateway_ChildFork"⟩
          targetId := ⟨"UserTask_SiblingWork"⟩ }
      , { id := ⟨"Flow_ForkToTriggerError"⟩
          sourceId := ⟨"Gateway_ChildFork"⟩
          targetId := ⟨"UserTask_TriggerError"⟩ }
      , { id := ⟨"Flow_OuterStartToScope"⟩
          sourceId := ⟨"StartEvent_Outer"⟩
          targetId := ⟨"SubProcess_Work"⟩ }
      , { id := ⟨"Flow_RecoverToRecoveredEnd"⟩
          sourceId := ⟨"UserTask_Recover"⟩
          targetId := ⟨"EndEvent_Recovered"⟩ }
      , { id := ⟨"Flow_ScopeToNormalEnd"⟩
          sourceId := ⟨"SubProcess_Work"⟩
          targetId := ⟨"EndEvent_Normal"⟩ }
      , { id := ⟨"Flow_SiblingWorkToNoneEnd"⟩
          sourceId := ⟨"UserTask_SiblingWork"⟩
          targetId := ⟨"EndEvent_SiblingWork"⟩ }
      , { id := ⟨"Flow_TriggerErrorToErrorEnd"⟩
          sourceId := ⟨"UserTask_TriggerError"⟩
          targetId := ⟨"EndEvent_ScopedFailure"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"Instance_1"⟩

def taskId (elementId : String) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨elementId⟩
    activation := 1 }

def start : Stimulus :=
  .startProcess ⟨"start-process"⟩ ⟨processId.value⟩ instanceId []

def completeTask (commandId elementId : String) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ (taskId elementId) []

def childWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState start

def triggerCommittedBeforeClosure : RuntimeState :=
  (completeUserTask childWaiting.state instanceId
    ⟨"UserTask_TriggerError"⟩ 1).getD initialState

def triggerFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit program childWaiting.state
    (completeTask "complete-trigger-error" "UserTask_TriggerError")

def siblingFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit program childWaiting.state
    (completeTask "complete-sibling-work" "UserTask_SiblingWork")

def siblingThenTrigger : StimulusResult :=
  applyStimulus scenarioClosureLimit program siblingFirst.state
    (completeTask "complete-trigger-error" "UserTask_TriggerError")

def completed : StimulusResult :=
  applyStimulus scenarioClosureLimit program triggerFirst.state
    (completeTask "complete-recover" "UserTask_Recover")

private def taskObservation (elementId name : String) : OpenUserTask :=
  { id := taskId elementId, name := some name, state := .active }

def recoveryObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [{ elementId := ⟨"UserTask_Recover"⟩, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [taskObservation "UserTask_Recover" "Recover"]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance (taskId "UserTask_Recover")]
    logicalTimeMs := 0 }

def wrongAttachedScopeProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .throwError id origin input error handler =>
          .throwError id origin input error
            { handler with attachedScopeId := rootScopeId }
      | other => other }

def wrongHandlerOutputProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .throwError id origin input error handler =>
          .throwError id origin input error
            { handler with output := ⟨"place:Flow_ScopeToNormalEnd"⟩ }
      | other => other }

/-- The exact checked Error graph is admitted and independently lowers to its program. -/
theorem exact_error_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- Typed nested-handler mutations remain representable but cannot pass exact checked-source lowering equality. -/
theorem handler_mutations_fail_exact_lowering :
    wrongAttachedScopeProgram ≠ lowerCheckedProcess checkedProcess ∧
      wrongHandlerOutputProgram ≠ lowerCheckedProcess checkedProcess ∧
      definitionBindingValid checkedProcess wrongAttachedScopeProgram = false ∧
      definitionBindingValid checkedProcess wrongHandlerOutputProgram = false := by
  decide +kernel

/-- Before automatic closure, the Error throw is uniquely enabled and child normal completion cannot compete. -/
theorem throw_precedes_unreachable_normal_completion :
    enabledInternalOperationCount program triggerCommittedBeforeClosure = 1 ∧
      step program triggerCommittedBeforeClosure
          ⟨"operation:EndEvent_ScopedFailure"⟩ ≠ none ∧
      step program triggerCommittedBeforeClosure
          ⟨"operation:complete-scope:scope:SubProcess_Work"⟩ = none := by
  decide +kernel

/-- Trigger-first cancellation removes the child occurrence and preserves its zero-End history. -/
theorem trigger_first_reaches_exact_recovery_state :
    triggerFirst.outcome = .committed ∧
      observeStableState program triggerFirst.state = some recoveryObservation ∧
      triggerFirst.state.scopeOccurrences.length = 1 ∧
      triggerFirst.state.endOccurrences = 0 ∧
      tokenMultiplicity triggerFirst.state ⟨"place:Flow_ScopeToNormalEnd"⟩ = 0 ∧
      enabledInternalOperationCount program triggerFirst.state = 0 ∧
      stableStateResumable triggerFirst.state = true := by
  decide +kernel

/-- Sibling-first retains its historical End count while exposing the same public recovery result. -/
theorem sibling_first_has_same_public_recovery_not_same_history :
    siblingFirst.state.endOccurrences = 1 ∧
      siblingThenTrigger.state.endOccurrences = 1 ∧
      observeStableState program siblingThenTrigger.state = some recoveryObservation ∧
      observeStableState program siblingThenTrigger.state =
        observeStableState program triggerFirst.state ∧
      siblingThenTrigger.state ≠ triggerFirst.state := by
  decide +kernel

/-- A command against the interrupted sibling is rejected with exact state preservation. -/
theorem stale_sibling_completion_preserves_recovery :
    applyStimulus scenarioClosureLimit program triggerFirst.state
        (completeTask "refuse-stale-sibling-after-error" "UserTask_SiblingWork") =
      { outcome := .rejected
        state := triggerFirst.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Completing Recover reaches only the recovered root completion. -/
theorem recover_completes_process_without_normal_route :
    completed.outcome = .committed ∧
      completed.state.control = .completed instanceId ∧
      completed.state.scopeOccurrences = [] ∧
      completed.state.endOccurrences = 1 ∧
      tokenMultiplicity completed.state ⟨"place:Flow_ScopeToNormalEnd"⟩ = 0 := by
  decide +kernel

end BpmnSemantics.SubProcessErrorPropagationConformance
