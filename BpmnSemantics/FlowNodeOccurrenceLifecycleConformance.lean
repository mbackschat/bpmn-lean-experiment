import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceCancellationProofs
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.CallActivityConformance
import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import BpmnSemantics.EventBasedGatewayConformance
import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.ReceiveTaskConformance
import BpmnSemantics.ConfiguredTaskConformance
import BpmnSemantics.MappedBoundaryErrorConformance
import BpmnSemantics.SubProcessErrorPropagationConformance
import BpmnSemantics.ServiceTaskIncidentCancellationConformance

/-! # Flow-node occurrence lifecycle conformance

This module owns the executable witnesses for exact flow-node starts, terminals, private-anchor folding, and independent open-set projection. Public revision numbering, wall-clock time, wire publication, Temporal hosting, and Product 2 aggregation remain outside Lean.
-/

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- An accepted fold proves every start anchor fresh and unique against the prior open set. -/
theorem accepted_flow_node_delta_starts_are_fresh_and_unique
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (current ++ delta.started).map (·.anchor) |>.Nodup := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

/-- An accepted fold resolves each terminal anchor exactly once. -/
theorem accepted_flow_node_delta_terminals_resolve_once
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (delta.ended.map (·.anchor)).Nodup ∧
      (delta.ended.map (·.anchor)).all
        ((availableAfterStarts current delta).map (·.anchor)).contains = true := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

/-- A transition-local anchor can never survive an accepted delta. -/
theorem accepted_flow_node_delta_retains_no_transition_anchor
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    after.all (fun occurrence => !transitionAnchor occurrence.anchor) = true := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  repeat' split at accepted <;> simp_all

def lifecycleStarts (result : TracedStimulusResult) :
    List UnnumberedFlowNodeOccurrenceStart :=
  result.flowNodeOccurrenceLifecycles.flatMap (·.started)

def lifecycleEnds (result : TracedStimulusResult) :
    List UnnumberedFlowNodeOccurrenceEnd :=
  result.flowNodeOccurrenceLifecycles.flatMap (·.ended)

def sequentialStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SequentialUserTask.program initialState
    SequentialUserTask.startStimulus

def sequentialCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SequentialUserTask.program
    SequentialUserTask.afterStartState SequentialUserTask.completionStimulus

def sequentialTaskAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .wait SequentialUserTask.exactTaskInstanceId

def sequentialAwaitBeforeState : RuntimeState :=
  { (runningProgramStartState? SequentialUserTask.program ⟨"Instance_1"⟩
      SequentialUserTask.initialBindings).getD initialState with
    initiationPending := false
    tokens :=
      [rootToken ⟨"Instance_1"⟩ SequentialUserTask.program.processId
        ⟨"place:Flow_StartToTask"⟩] }

def corruptedSequentialTaskStart : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := sequentialTaskAnchor
    processId := ⟨"Process_Corrupted"⟩
    elementId := ⟨"UserTask_Approve"⟩
    owner := SequentialUserTask.rootOwner }

def corruptedSequentialTaskDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [corruptedSequentialTaskStart], ended := [] }

/-- A candidate cannot smuggle a false Process identity through an otherwise exact open-state oracle. -/
theorem corrupted_candidate_process_id_is_rejected_while_open_oracle_is_exact :
    projectOpenFlowNodeOccurrences? SequentialUserTask.program sequentialAwaitBeforeState = some [] ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        SequentialUserTask.afterStartState =
          some
            [{ anchor := sequentialTaskAnchor
               processId := SequentialUserTask.program.processId
               elementId := ⟨"UserTask_Approve"⟩
               owner := SequentialUserTask.rootOwner }] ∧
      acceptFlowNodeOccurrenceCandidate? SequentialUserTask.program sequentialAwaitBeforeState
        SequentialUserTask.afterStartState corruptedSequentialTaskDelta = none := by
  decide +kernel

/-- The real admitted Start to User Task transition emits the exact instantaneous Start and one retained task occurrence. -/
theorem sequential_start_emits_exact_flow_node_units :
    sequentialStartTrace.result =
        applyStimulus scenarioClosureLimit SequentialUserTask.program initialState
          SequentialUserTask.startStimulus ∧
      sequentialStartTrace.flowNodeOccurrenceLifecycles.length =
        sequentialStartTrace.committedTransitions.length ∧
      (lifecycleStarts sequentialStartTrace).map (fun start => start.elementId.value) =
        ["StartEvent_1", "UserTask_Approve"] ∧
      (lifecycleEnds sequentialStartTrace).map (fun ending => ending.terminal) =
        [.completed] ∧
      (lifecycleStarts sequentialStartTrace).count
        { anchor := sequentialTaskAnchor
          processId := SequentialUserTask.program.processId
          elementId := ⟨"UserTask_Approve"⟩
          owner := SequentialUserTask.rootOwner } = 1 := by
  decide +kernel

/-- Completing the exact task resolves its prior anchor once and emits one instantaneous End Event. -/
theorem sequential_completion_pairs_the_task_and_end_once :
    (lifecycleEnds sequentialCompletionTrace).count
        { anchor := sequentialTaskAnchor, terminal := .completed } = 1 ∧
      (lifecycleStarts sequentialCompletionTrace).map (fun start => start.elementId.value) =
        ["EndEvent_1"] ∧
      (lifecycleEnds sequentialCompletionTrace).filter
        (fun ending => ending.terminal = .cancelled) = [] := by
  decide +kernel

/-- Both real sequential command prefixes fold to their independently projected exact heads. -/
theorem sequential_lifecycle_fold_matches_independent_projection :
    foldFlowNodeOccurrenceDeltas [] sequentialStartTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialStartTrace.result.state ∧
      foldFlowNodeOccurrenceDeltas
          ((projectOpenFlowNodeOccurrences? SequentialUserTask.program
            SequentialUserTask.afterStartState).getD [])
          sequentialCompletionTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialCompletionTrace.result.state := by
  decide +kernel

def callStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit CallActivityConformance.program initialState
    CallActivityConformance.start

def callReturnTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit CallActivityConformance.program
    CallActivityConformance.calledWaiting.state CallActivityConformance.completeCalled

def callAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .callActivity
    { processInstanceId := CallActivityConformance.callerInstanceId
      elementId := ⟨"B_Call"⟩
      activation := 1 }

/-- Invoke and Return are one Call Activity occurrence, never two operation-count occurrences. -/
theorem call_activity_invoke_and_return_pair_one_occurrence :
    ((lifecycleStarts callStartTrace).filter (fun start => start.anchor = callAnchor)).length = 1 ∧
      ((lifecycleEnds callStartTrace).filter (fun ending => ending.anchor = callAnchor)).isEmpty ∧
      ((lifecycleStarts callReturnTrace).filter (fun start => start.anchor = callAnchor)).isEmpty ∧
      (lifecycleEnds callReturnTrace).count
        { anchor := callAnchor, terminal := .completed } = 1 := by
  decide +kernel

def embeddedStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    initialState EmbeddedSubProcessCompletionConformance.start

def embeddedFirstCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    EmbeddedSubProcessCompletionConformance.childWaiting.state
    EmbeddedSubProcessCompletionConformance.completeA

def embeddedSecondCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    EmbeddedSubProcessCompletionConformance.afterA.state
    EmbeddedSubProcessCompletionConformance.completeB

def embeddedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := EmbeddedSubProcessCompletionConformance.instanceId
      definitionScopeId := EmbeddedSubProcessCompletionConformance.childScopeId
      activation := 1 }

/-- Enter and quiescent Complete are one embedded Sub-Process occurrence across commands. -/
theorem embedded_scope_entry_and_completion_pair_one_occurrence :
    ((lifecycleStarts embeddedStartTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).length = 1 ∧
      ((lifecycleEnds embeddedFirstCompletionTrace).filter
        (fun ending => ending.anchor = embeddedScopeAnchor)).isEmpty ∧
      ((lifecycleStarts embeddedSecondCompletionTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).isEmpty ∧
      (lifecycleEnds embeddedSecondCompletionTrace).count
        { anchor := embeddedScopeAnchor, terminal := .completed } = 1 := by
  decide +kernel

def armedBoundaryOpen : Option (List OpenSemanticFlowNodeOccurrence) :=
  projectOpenFlowNodeOccurrences? ActivityBoundaryTimerConformance.program
    ActivityBoundaryTimerConformance.armedState

def armedEventRaceOpen : Option (List OpenSemanticFlowNodeOccurrence) :=
  projectOpenFlowNodeOccurrences? EventBasedGatewayConformance.program
    EventBasedGatewayConformance.armed.state

/-- An armed Boundary Timer is not a flow-node occurrence, while both armed Event-Based candidates are. -/
theorem boundary_subscription_and_event_race_candidates_are_distinct :
    armedBoundaryOpen.map (fun current => current.map fun occurrence => occurrence.elementId.value) =
        some ["BoundedTask"] ∧
      armedEventRaceOpen.map (fun current => current.map fun occurrence => occurrence.elementId.value) =
        some ["MessageCatch", "TimerCatch"] := by
  decide +kernel

def selfParentedEmbeddedState : RuntimeState :=
  { EmbeddedSubProcessCompletionConformance.childWaiting.state with
    scopeOccurrences :=
      EmbeddedSubProcessCompletionConformance.childWaiting.state.scopeOccurrences.map fun occurrence =>
        if occurrence.id.definitionScopeId = EmbeddedSubProcessCompletionConformance.childScopeId then
          { occurrence with parent := some occurrence.id }
        else occurrence }

def terminalStateWithActivityLocal : RuntimeState :=
  { initialState with
    control := .completed ⟨"instance:terminal-activity-local"⟩
    variables :=
      { emptyScopedVariables with
        activities :=
          [{ owner := ConfiguredTaskConformance.effectId, bindings := [] }] } }

def configuredMissingActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables := { ConfiguredTaskConformance.startedResult.state.variables with activities := [] } }

def configuredDuplicateActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables :=
      { ConfiguredTaskConformance.startedResult.state.variables with
        activities := ConfiguredTaskConformance.startedResult.state.variables.activities ++
          ConfiguredTaskConformance.startedResult.state.variables.activities } }

def configuredUnownedActivityLocal : RuntimeState :=
  { ConfiguredTaskConformance.startedResult.state with
    variables :=
      { ConfiguredTaskConformance.startedResult.state.variables with
        activities := ConfiguredTaskConformance.startedResult.state.variables.activities ++
          [{ owner := { ConfiguredTaskConformance.effectId with activation := 2 }, bindings := [] }] } }

/-- Open projection rejects malformed scope trees, residual terminal locals, and every non-exact effect-local association. -/
theorem independent_open_projection_rejects_every_runtime_validity_counterexample :
    projectOpenFlowNodeOccurrences? EmbeddedSubProcessCompletionConformance.program
        selfParentedEmbeddedState = none ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        terminalStateWithActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredMissingActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredDuplicateActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredUnownedActivityLocal = none := by
  decide +kernel

def foreignUserTaskState : RuntimeState :=
  { SequentialUserTask.afterStartState with
    waits := SequentialUserTask.afterStartState.waits.map fun wait =>
      { wait with task := { wait.task with id := ⟨"UserTask_Foreign"⟩ } } }

def orphanBoundaryDeadlineState : RuntimeState :=
  { ActivityBoundaryTimerConformance.armedState with waits := [] }

def foreignCallRecordState : RuntimeState :=
  { CallActivityConformance.calledWaiting.state with
    calledProcessOccurrences :=
      CallActivityConformance.calledWaiting.state.calledProcessOccurrences.map fun record =>
        { record with returnOperationId := ⟨"operation:foreign-return"⟩ } }

theorem independent_open_projection_rejects_program_foreign_user_task :
    projectOpenFlowNodeOccurrences? SequentialUserTask.program foreignUserTaskState = none := by
  decide +kernel

theorem independent_open_projection_rejects_orphan_boundary_deadline :
    projectOpenFlowNodeOccurrences? ActivityBoundaryTimerConformance.program
      orphanBoundaryDeadlineState = none := by
  decide +kernel

theorem independent_open_projection_rejects_program_foreign_call_record :
    projectOpenFlowNodeOccurrences? CallActivityConformance.program foreignCallRecordState = none := by
  decide +kernel

def receiveStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit ReceiveTaskConformance.program initialState
    ReceiveTaskConformance.startStimulus

def configuredStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit ConfiguredTaskConformance.program initialState
    ConfiguredTaskConformance.startStimulus

/-- Reused Message and effect operations retain the admitted Receive Task and Configured Task element identities. -/
theorem reused_wait_shapes_publish_receive_and_configured_tasks :
    ((lifecycleStarts receiveStartTrace).filter
        (fun start => start.anchor = .wait ReceiveTaskConformance.subscriptionId)).map
          (fun start => start.elementId.value) = ["ReceiveTask_WaitForInvoice"] ∧
      ((lifecycleStarts configuredStartTrace).filter
        (fun start => start.anchor = .wait ConfiguredTaskConformance.effectId)).map
          (fun start => start.elementId.value) = ["ConfiguredTask_Probe"] := by
  decide +kernel

def mappedErrorStimulus : Stimulus :=
  .completeEffect ⟨"complete-mapped-error"⟩ MappedBoundaryErrorConformance.effectId
    (MappedBoundaryErrorConformance.errorResult none)

def mappedErrorTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit MappedBoundaryErrorConformance.program
    MappedBoundaryErrorConformance.waitingState mappedErrorStimulus

/-- Matching BPMN Error cancels the Service Task and emits the Boundary Error atomically, never normal completion. -/
theorem matching_effect_error_cancels_service_and_completes_boundary :
    (lifecycleEnds mappedErrorTrace).count
        { anchor := .wait MappedBoundaryErrorConformance.effectId, terminal := .cancelled } = 1 ∧
      (lifecycleEnds mappedErrorTrace).count
        { anchor := .wait MappedBoundaryErrorConformance.effectId, terminal := .completed } = 0 ∧
      ((lifecycleStarts mappedErrorTrace).filter
        (fun start => start.elementId.value = "BoundaryEvent_MappedBusinessError")).length = 1 ∧
      ((lifecycleEnds mappedErrorTrace).filter
        (fun ending => match ending.anchor with
          | .transition commandId _ _ => commandId.value = "complete-mapped-error"
          | _ => false)).length ≥ 1 := by
  decide +kernel

def propagatedErrorTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SubProcessErrorPropagationConformance.program
    SubProcessErrorPropagationConformance.childWaiting.state
    (SubProcessErrorPropagationConformance.completeTask
      "complete-trigger-error" "UserTask_TriggerError")

def propagatedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := SubProcessErrorPropagationConformance.instanceId
      definitionScopeId := SubProcessErrorPropagationConformance.childScopeId
      activation := 1 }

def propagatedSiblingAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .wait (SubProcessErrorPropagationConformance.taskId "UserTask_SiblingWork")

/-- Propagation emits Error End and Boundary Error together while cancelling the scope and its sibling work. -/
theorem propagated_error_publishes_both_events_and_cancels_subtree :
    ((lifecycleStarts propagatedErrorTrace).filter
        (fun start => start.elementId.value = "EndEvent_ScopedFailure")).length = 1 ∧
      ((lifecycleStarts propagatedErrorTrace).filter
        (fun start => start.elementId.value = "BoundaryEvent_ScopedFailure")).length = 1 ∧
      (lifecycleEnds propagatedErrorTrace).count
        { anchor := propagatedScopeAnchor, terminal := .cancelled } = 1 ∧
      (lifecycleEnds propagatedErrorTrace).count
        { anchor := propagatedSiblingAnchor, terminal := .cancelled } = 1 := by
  decide +kernel

def boundedScopeDeadlineTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SubProcessBoundaryTimerConformance.program
    SubProcessBoundaryTimerConformance.armedState
    (.fireTimer ⟨"fire-scope-deadline"⟩
      SubProcessBoundaryTimerConformance.deadlineId 1000)

def boundedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := SubProcessBoundaryTimerConformance.instanceId
      definitionScopeId := SubProcessBoundaryTimerConformance.childScopeId
      activation := 1 }

/-- Interrupting a Sub-Process cancels both its host occurrence and its exact open child work. -/
theorem boundary_interruption_cancels_exact_scope_and_child_occurrences :
    (lifecycleEnds boundedScopeDeadlineTrace).count
        { anchor := boundedScopeAnchor, terminal := .cancelled } = 1 ∧
      (lifecycleEnds boundedScopeDeadlineTrace).count
        { anchor := .wait SubProcessBoundaryTimerConformance.childTaskId,
          terminal := .cancelled } = 1 ∧
      ((lifecycleStarts boundedScopeDeadlineTrace).filter
        (fun start => start.elementId.value = "Deadline")).length = 1 := by
  decide +kernel

def incidentCancellationTrace : TracedStimulusResult :=
  applyStimulusTraced 0 ServiceTaskIncidentCancellationConformance.program
    ServiceTaskIncidentCancellationConformance.incidentState
    ServiceTaskIncidentCancellationConformance.cancellationStimulus

/-- Root incident cancellation resolves the incident-held Service Task and creates no synthetic node. -/
theorem root_incident_cancellation_only_cancels_existing_open_occurrences :
    lifecycleStarts incidentCancellationTrace = [] ∧
      (lifecycleEnds incidentCancellationTrace).count
        { anchor := .wait ServiceTaskIncidentCancellationConformance.effectId,
          terminal := .cancelled } = 1 ∧
      projectOpenFlowNodeOccurrences? ServiceTaskIncidentCancellationConformance.program
        incidentCancellationTrace.result.state = some [] := by
  decide +kernel

def duplicateOwner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance:duplicates"⟩
    definitionScopeId := ⟨"scope:duplicates"⟩
    activation := 1 }

def duplicateStart : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := .wait
      { processInstanceId := duplicateOwner.processInstanceId
        elementId := ⟨"Task_Duplicate"⟩
        activation := 1 }
    processId := ⟨"Process_Duplicates"⟩
    elementId := ⟨"Task_Duplicate"⟩
    owner := duplicateOwner }

def duplicateStartDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [duplicateStart, duplicateStart], ended := [] }

def duplicateEndDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := []
    ended :=
      [ { anchor := duplicateStart.anchor, terminal := .completed }
      , { anchor := duplicateStart.anchor, terminal := .cancelled } ] }

def crossingTransitionDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [{ duplicateStart with anchor := .transition ⟨"command:cross"⟩ 0 0 }]
    ended := [] }

/-- Freshness, reuse, duplicate terminal, unknown terminal, and cross-delta transition anchors all fail closed. -/
theorem every_anchor_multiplicity_violation_is_rejected :
    applyFlowNodeOccurrenceDelta? [] duplicateStartDelta = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart]
        { started := [duplicateStart], ended := [] } = none ∧
      applyFlowNodeOccurrenceDelta? [duplicateStart] duplicateEndDelta = none ∧
      applyFlowNodeOccurrenceDelta? []
        { started := [], ended := [{ anchor := duplicateStart.anchor, terminal := .completed }] } = none ∧
      applyFlowNodeOccurrenceDelta? [] crossingTransitionDelta = none := by
  decide +kernel

/-- Rejected and closure-bounded commands publish neither a trace nor a lifecycle. -/
theorem every_unpublishable_command_has_no_lifecycle :
    (applyStimulusTraced scenarioClosureLimit SequentialUserTask.program initialState
        (.startProcess ⟨"wrong"⟩ ⟨"Other"⟩ ⟨"Instance"⟩ [])).flowNodeOccurrenceLifecycles = [] ∧
      (applyStimulusTraced 1 SequentialUserTask.program initialState
        SequentialUserTask.startStimulus).flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
