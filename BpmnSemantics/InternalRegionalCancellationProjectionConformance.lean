import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.SubProcessErrorPropagationConformance
import BpmnSemantics.TerminateEndEventFixtures
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

/-! RHP-HANDLER-01 constructs a live, projectable parent-owned handler with a child body.
These are validation/publication witnesses, not admitted execution-reachability claims. -/
namespace HandlerPublicationWitness

def handlerElement (terminate : Bool) : String :=
  if terminate then "E_OuterTask" else "UserTask_Recover"

def hosting (terminate : Bool) : SemanticId :=
  if terminate then TerminateEndEventFixtures.semanticInstanceId else SubProcessErrorPropagationConformance.instanceId

def handlerProgram (timer terminate : Bool) : Program :=
  let source := if terminate then TerminateEndEventFixtures.checkedProcess else SubProcessErrorPropagationConformance.checkedProcess
  lowerCheckedProcess { source with nodes := source.nodes.map fun node =>
    match node with
    | .userTask id _ => if id.value = handlerElement terminate then
        if timer then .intermediateCatchTimerEvent id "PT1S"
        else .intermediateCatchMessageEvent id (.directMessage ⟨"Message_Recovery"⟩)
      else node
    | _ => node }

def selected (timer terminate : Bool) : SemanticOperation :=
  ((handlerProgram timer terminate).operations.find? fun operation => match operation with
    | .throwError .. | .terminateScope .. => true
    | _ => false).getD (.reachNoneEnd ⟨"missing"⟩ ⟨⟨"missing"⟩⟩ ⟨"missing"⟩)

def outside (terminate : Bool) : ScopeOccurrenceId :=
  { processInstanceId := hosting terminate
    definitionScopeId := if terminate then TerminateEndEventFixtures.rootScopeId else SubProcessErrorPropagationConformance.rootScopeId
    activation := 1 }
def body (terminate : Bool) : ScopeOccurrenceId :=
  { processInstanceId := hosting terminate
    definitionScopeId := if terminate then TerminateEndEventFixtures.childScopeId else SubProcessErrorPropagationConformance.childScopeId
    activation := 1 }
def handler (terminate : Bool) : OccurrenceId :=
  { processInstanceId := hosting terminate, elementId := ⟨handlerElement terminate⟩, activation := 1 }

def triggerReady (terminate : Bool) : RuntimeState :=
  if terminate then
    let started := applyStimulus scenarioClosureLimit TerminateEndEventFixtures.program initialState
      TerminateEndEventFixtures.startStimulus
    (completeUserTask started.state (hosting terminate) ⟨"J_Trigger"⟩ 1).getD initialState
  else SubProcessErrorPropagationConformance.triggerCommittedBeforeClosure

def handlerState (timer terminate : Bool) : RuntimeState := Id.run do
  let program := handlerProgram timer terminate
  let operation := (program.operations.find? fun operation => match operation with
    | .awaitTimer .. | .awaitMessage .. => true
    | _ => false).getD (.reachNoneEnd ⟨"missing"⟩ ⟨⟨"missing"⟩⟩ ⟨"missing"⟩)
  let input := match operation with
    | .awaitTimer _ _ input .. | .awaitMessage _ _ input .. => input
    | _ => ⟨"missing"⟩
  let ready := { triggerReady terminate with
    tokens := addToken (triggerReady terminate).tokens input (outside terminate) }
  let armed := (fire? program operation ready).getD initialState
  return { armed with
    activityOccurrences :=
      [{ processInstanceId := hosting terminate
         activityElementId := ⟨"CrossRegionBody"⟩
         activation := 1
         owner := outside terminate
         body := .childScope (body terminate)
         attachedHandlers := [if timer then .timer (handler terminate) else .message (handler terminate)] }]
    activityActivations := [{ taskId := ⟨"CrossRegionBody"⟩, count := 1 }] }

def exactHandlerPublication (timer terminate : Bool) : Bool :=
  let program := handlerProgram timer terminate
  let before := handlerState timer terminate
  match prepareInternalRegional? program before (selected timer terminate) with
  | none => false
  | some prepared =>
    match applyPreparedInternalRegional? program before prepared with
    | none => false
    | some after =>
      programWellFormed program &&
      runtimeStateWellFormed program (hosting terminate) before &&
      runtimeStateWellFormed program (hosting terminate) after &&
      (if terminate then
        decide (after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
          after.activityOccurrences = before.activityOccurrences)
      else after.messageWaits.isEmpty && after.timerWaits.isEmpty && after.activityOccurrences.isEmpty) &&
      (after.scopeOccurrences.any (fun scope => decide (scope.id = body terminate)) == terminate) &&
      (projectOpenFlowNodeOccurrences? program before).isSome &&
      (projectOpenFlowNodeOccurrences? program after).isSome &&
      (prepared.publicationTemplate.retainedEnds.contains
        { anchor := .wait (handler terminate), terminal := .cancelled } == !terminate) &&
      decide (flowNodeOccurrenceDeltaForOperation? program before after (selected timer terminate)
        ⟨"cancel-body"⟩ 0 = some (prepared.publicationTemplate.lifecycle ⟨"cancel-body"⟩ 0))

theorem error_message_handler_publication_exact : exactHandlerPublication false false = true := by
  decide +kernel

theorem error_timer_handler_publication_exact : exactHandlerPublication true false = true := by
  decide +kernel

theorem terminate_message_handler_publication_exact : exactHandlerPublication false true = true := by
  decide +kernel

theorem terminate_timer_handler_publication_exact : exactHandlerPublication true true = true := by
  decide +kernel

end HandlerPublicationWitness

def privateErrorTimerPublication : Option (Nat × Nat × Bool) := do
  let prepared ← prepareInternalRegional? errorProgram errorReady errorOperation
  let after ← applyPreparedInternalRegional? errorProgram errorReady prepared
  let delta ← flowNodeOccurrenceDeltaForOperation? errorProgram errorReady after errorOperation ⟨"private-timer"⟩ 0
  pure (errorReady.timerWaits.length, after.timerWaits.length,
    delta.ended.any fun ending => match ending.anchor with
      | .wait id => errorReady.timerWaits.any (timerIdNamesWait id)
      | _ => false)

theorem private_error_timer_is_withdrawn_without_a_public_ending :
    privateErrorTimerPublication = some (1, 0, false) := by
  decide +kernel

end BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness
