import BpmnSemantics.InternalRegionalCancellationProjectionConformance

/-! RHP-HANDLER-01 keeps the handler-publication reductions in a separate kernel process
from the cancellation projection witnesses to respect the fixed 3 GiB validation bound. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness

open BpmnSemantics

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

end BpmnSemantics.SemanticProcess.InternalCommutation.CancellationProjectionWitness
