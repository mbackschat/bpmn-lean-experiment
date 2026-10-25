module

public import BpmnSemantics.SubProcessBoundaryTimerConformance
public import BpmnSemantics.SubProcessErrorPropagationConformance
public import BpmnSemantics.TerminateEndEventFixtures
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity

/-! Separating states for the cancellation projection obligation. The existing bounded
scope fixture supplies an actually armed state; each mutation removes only Activity
ownership evidence, retaining its child scope and parent-owned deadline. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness

open BpmnSemantics
open SubProcessBoundaryTimerConformance

def child : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := childScopeId, activation := 1 }

def missingActivities : RuntimeState := { armedState with activityOccurrences := [] }

def missingAttachments : RuntimeState :=
  { armedState with activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with attachedHandlers := [] } }

def missing_activity_predecessor_valid : Bool := decide <| runtimeStateWellFormed program instanceId missingActivities = true

def missing_activity_predecessor_projection_refused : Bool := decide <| projectOpenFlowNodeOccurrences? program missingActivities = none

def missing_attachment_predecessor_valid : Bool := decide <| runtimeStateWellFormed program instanceId missingAttachments = true

def missing_attachment_predecessor_projection_refused : Bool := decide <| projectOpenFlowNodeOccurrences? program missingAttachments = none

def missing_activity_cancellation_leaves_deadline : Bool := decide <|
    (cancelScopeSubtree missingActivities child .remove).timerWaits = missingActivities.timerWaits ∧
      missingActivities.timerWaits.length = 1

def missing_attachment_cancellation_leaves_deadline : Bool := decide <|
    (cancelScopeSubtree missingAttachments child .remove).timerWaits = missingAttachments.timerWaits ∧
      missingAttachments.timerWaits.length = 1

def missing_activity_cancellation_projection_refused : Bool := decide <|
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree missingActivities child .remove) = none

def missing_attachment_cancellation_projection_refused : Bool := decide <|
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree missingAttachments child .remove) = none

def errorProgram : Program :=
  let source := SubProcessErrorPropagationConformance.checkedProcess
  lowerCheckedProcess
    { source with
      nodes := source.nodes ++
        [.timerBoundaryEvent ⟨"Deadline"⟩ ⟨"SubProcess_Work"⟩ .interrupting (.duration "PT1S") ⟨"Flow_Timeout"⟩,
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

def error_missing_activity_predecessor_valid : Bool := decide <| runtimeStateWellFormed errorProgram instanceId errorMissingActivities = true

def error_missing_attachment_predecessor_valid : Bool := decide <| runtimeStateWellFormed errorProgram instanceId errorMissingAttachments = true

def error_missing_activity_preparation_refused : Bool := decide <|
    prepareInternalRegional? errorProgram errorMissingActivities errorOperation = none

def error_missing_attachment_preparation_refused : Bool := decide <|
    prepareInternalRegional? errorProgram errorMissingAttachments errorOperation = none

def prepared_error_missing_activity_execution_refused : Bool := decide <|
    preparedErrorSuccessor errorMissingActivities = none

def prepared_error_missing_attachment_execution_refused : Bool := decide <|
    preparedErrorSuccessor errorMissingAttachments = none

def intact_error_predecessor_valid : Bool := decide <| runtimeStateWellFormed errorProgram instanceId errorReady = true

def intact_prepared_error_successor_projectable : Bool := decide <|
    (preparedErrorSuccessor errorReady).map (fun after => (projectOpenFlowNodeOccurrences? errorProgram after).isSome) = some true

def divergentDeadline : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait => { wait with activation := 2 }
    timerActivations := armedState.timerActivations.map fun counter => { counter with count := 2 }
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with attachedHandlers := record.attachedHandlers.map fun handler =>
          match handler with
          | .timer occurrence => .timer { occurrence with activation := 2 }
          | .message occurrence => .message occurrence } }

def divergent_deadline_predecessor_valid : Bool := decide <| runtimeStateWellFormed program instanceId divergentDeadline = true

def divergent_deadline_projection_unchanged : Bool := decide <|
    projectOpenFlowNodeOccurrences? program divergentDeadline = projectOpenFlowNodeOccurrences? program armedState ∧
      (projectOpenFlowNodeOccurrences? program armedState).isSome = true

def privateErrorTimerPublication : Option (Nat × Nat × Bool) := do
  let prepared ← prepareInternalRegional? errorProgram errorReady errorOperation
  let after ← applyPreparedInternalRegional? errorProgram errorReady prepared
  let delta ← flowNodeOccurrenceDeltaForOperation? errorProgram errorReady after errorOperation ⟨"private-timer"⟩ 0
  pure (errorReady.timerWaits.length, after.timerWaits.length,
    delta.ended.any fun ending => match ending.anchor with
      | .wait id => errorReady.timerWaits.any (timerIdNamesWait id)
      | _ => false)

def private_error_timer_is_withdrawn_without_a_public_ending : Bool := decide <|
    privateErrorTimerPublication = some (1, 0, false)

/-- Every executable check of this module, named for the driver's failure report. -/
def internalRegionalCancellationProjectionConformanceChecks : List (String × Bool) := [
  ("missing_activity_predecessor_valid", missing_activity_predecessor_valid),
  ("missing_activity_predecessor_projection_refused", missing_activity_predecessor_projection_refused),
  ("missing_attachment_predecessor_valid", missing_attachment_predecessor_valid),
  ("missing_attachment_predecessor_projection_refused", missing_attachment_predecessor_projection_refused),
  ("missing_activity_cancellation_leaves_deadline", missing_activity_cancellation_leaves_deadline),
  ("missing_attachment_cancellation_leaves_deadline", missing_attachment_cancellation_leaves_deadline),
  ("missing_activity_cancellation_projection_refused", missing_activity_cancellation_projection_refused),
  ("missing_attachment_cancellation_projection_refused", missing_attachment_cancellation_projection_refused),
  ("error_missing_activity_predecessor_valid", error_missing_activity_predecessor_valid),
  ("error_missing_attachment_predecessor_valid", error_missing_attachment_predecessor_valid),
  ("error_missing_activity_preparation_refused", error_missing_activity_preparation_refused),
  ("error_missing_attachment_preparation_refused", error_missing_attachment_preparation_refused),
  ("prepared_error_missing_activity_execution_refused", prepared_error_missing_activity_execution_refused),
  ("prepared_error_missing_attachment_execution_refused", prepared_error_missing_attachment_execution_refused),
  ("intact_error_predecessor_valid", intact_error_predecessor_valid),
  ("intact_prepared_error_successor_projectable", intact_prepared_error_successor_projectable),
  ("divergent_deadline_predecessor_valid", divergent_deadline_predecessor_valid),
  ("divergent_deadline_projection_unchanged", divergent_deadline_projection_unchanged),
  ("private_error_timer_is_withdrawn_without_a_public_ending", private_error_timer_is_withdrawn_without_a_public_ending)
]

end BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness
