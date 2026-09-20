import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.SubProcessErrorPropagationConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.InternalRegionalPreparation

/-! Separating states for the cancellation projection obligation. The existing bounded
scope fixture supplies an actually armed state; each mutation removes only Activity
ownership evidence, retaining its child scope and parent-owned deadline. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness

open BpmnSemantics
open SubProcessBoundaryTimerConformance

def child : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := childScopeId, activation := 1 }

def missingActivities : RuntimeState := { armedState with activityOccurrences := [] }

def missingAttachments : RuntimeState :=
  { armedState with activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with attachedHandlers := [] } }

theorem missing_activity_predecessor_valid : runtimeStateWellFormed program instanceId missingActivities = true := by
  decide +kernel

theorem missing_activity_predecessor_projection_refused : projectOpenFlowNodeOccurrences? program missingActivities = none := by
  decide +kernel

theorem missing_attachment_predecessor_valid : runtimeStateWellFormed program instanceId missingAttachments = true := by
  decide +kernel

theorem missing_attachment_predecessor_projection_refused : projectOpenFlowNodeOccurrences? program missingAttachments = none := by
  decide +kernel

theorem missing_activity_cancellation_leaves_deadline :
    (cancelScopeSubtree missingActivities child .remove).timerWaits = missingActivities.timerWaits ∧
      missingActivities.timerWaits.length = 1 := by
  decide +kernel

theorem missing_attachment_cancellation_leaves_deadline :
    (cancelScopeSubtree missingAttachments child .remove).timerWaits = missingAttachments.timerWaits ∧
      missingAttachments.timerWaits.length = 1 := by
  decide +kernel

theorem missing_activity_cancellation_projection_refused :
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree missingActivities child .remove) = none := by
  decide +kernel

theorem missing_attachment_cancellation_projection_refused :
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree missingAttachments child .remove) = none := by
  decide +kernel

def errorProgram : Program :=
  let source := SubProcessErrorPropagationConformance.checkedProcess
  lowerCheckedProcess
    { source with
      nodes := source.nodes ++
        [.timerBoundaryEvent ⟨"Deadline"⟩ ⟨"SubProcess_Work"⟩ .interrupting "PT1S" ⟨"Flow_Timeout"⟩,
          .noneEndEvent ⟨"TimeoutEnd"⟩]
      nodeScopes := source.nodeScopes ++
        [{ nodeId := ⟨"Deadline"⟩, scopeId := SubProcessErrorPropagationConformance.rootScopeId },
          { nodeId := ⟨"TimeoutEnd"⟩, scopeId := SubProcessErrorPropagationConformance.rootScopeId }]
      sequenceFlows := source.sequenceFlows.flatMap fun flow =>
        if flow.id.value = "Flow_TriggerErrorToErrorEnd" then
          [{ id := ⟨"Flow_Timeout"⟩, sourceId := ⟨"Deadline"⟩, targetId := ⟨"TimeoutEnd"⟩ }, flow]
        else [flow]
      sequenceFlowScopes := source.sequenceFlowScopes.flatMap fun ownership =>
        if ownership.sequenceFlowId.value = "Flow_TriggerErrorToErrorEnd" then
          [{ sequenceFlowId := ⟨"Flow_Timeout"⟩, scopeId := SubProcessErrorPropagationConformance.rootScopeId }, ownership]
        else [ownership] }

def errorOperation : SemanticOperation :=
  (errorProgram.operations.find? fun operation => match operation with | .throwError .. => true | _ => false).getD
    (.reachNoneEnd ⟨"missing-error"⟩ ⟨⟨"missing-error"⟩⟩ ⟨"missing-error"⟩)

def errorReady : RuntimeState :=
  let started := (applyStimulus scenarioClosureLimit errorProgram initialState
    (.startProcess ⟨"start-error-timer"⟩ ⟨errorProgram.processId.value⟩ instanceId [])).state
  (completeUserTask started instanceId ⟨"UserTask_TriggerError"⟩ 1).getD initialState

def errorMissingActivities : RuntimeState := { errorReady with activityOccurrences := [] }

def errorMissingAttachments : RuntimeState :=
  { errorReady with activityOccurrences := errorReady.activityOccurrences.map fun record =>
      { record with attachedHandlers := [] } }

def preparedErrorSuccessor (state : RuntimeState) : Option RuntimeState := do
  let prepared ← prepareInternalRegional? errorProgram state errorOperation
  applyPreparedInternalRegional? errorProgram state prepared

theorem error_program_is_well_formed : programWellFormed errorProgram = true := by
  decide +kernel

theorem error_missing_activity_predecessor_valid : runtimeStateWellFormed errorProgram instanceId errorMissingActivities = true := by
  decide +kernel

theorem error_missing_attachment_predecessor_valid : runtimeStateWellFormed errorProgram instanceId errorMissingAttachments = true := by
  decide +kernel

theorem error_missing_activity_preparation_refused :
    prepareInternalRegional? errorProgram errorMissingActivities errorOperation = none := by
  decide +kernel

theorem error_missing_attachment_preparation_refused :
    prepareInternalRegional? errorProgram errorMissingAttachments errorOperation = none := by
  decide +kernel

theorem prepared_error_missing_activity_execution_refused :
    preparedErrorSuccessor errorMissingActivities = none := by
  decide +kernel

theorem prepared_error_missing_attachment_execution_refused :
    preparedErrorSuccessor errorMissingAttachments = none := by
  decide +kernel

theorem intact_error_predecessor_valid : runtimeStateWellFormed errorProgram instanceId errorReady = true := by
  decide +kernel

theorem intact_prepared_error_successor_projectable :
    (preparedErrorSuccessor errorReady).map (fun after => (projectOpenFlowNodeOccurrences? errorProgram after).isSome) = some true := by
  decide +kernel

def divergentDeadline : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait => { wait with activation := 2 }
    timerActivations := armedState.timerActivations.map fun counter => { counter with count := 2 }
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with attachedHandlers := record.attachedHandlers.map fun handler =>
          match handler with
          | .timer occurrence => .timer { occurrence with activation := 2 }
          | .message occurrence => .message occurrence } }

theorem divergent_deadline_predecessor_valid : runtimeStateWellFormed program instanceId divergentDeadline = true := by
  decide +kernel

theorem divergent_deadline_projection_unchanged :
    projectOpenFlowNodeOccurrences? program divergentDeadline = projectOpenFlowNodeOccurrences? program armedState ∧
      (projectOpenFlowNodeOccurrences? program armedState).isSome = true := by
  decide +kernel

end BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness
