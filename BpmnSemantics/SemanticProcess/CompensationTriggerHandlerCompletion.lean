import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation handler completion and fail-fast Process failure -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive CompensationHandlerCompletionRefusal where
  | invalidProgram
  | invalidState
  | nonemptyPatch
  | staleEffect
  | invalidTrigger
  | invalidHandler
  | capacity (measure : CompensationTriggerCapacityMeasure) (bound prospective : Nat)
  deriving Repr, DecidableEq

inductive CompensationHandlerCompletionAttempt where
  | applied (state : RuntimeState)
  | refused (reason : CompensationHandlerCompletionRefusal)
  deriving Repr, DecidableEq

private structure SelectedCompensationHandler where
  wait : CompensationHandlerEffectWait
  trigger : CompensationTriggerExecution
  handler : CompensationHandlerExecution

private def findUnique? (candidates : List α) : Option α :=
  match candidates with
  | [candidate] => some candidate
  | _ => none

private def selectCompensationHandler? (state : RuntimeState)
    (effectId : EffectOccurrenceId) : Option SelectedCompensationHandler := do
  let wait ← findUnique? (state.compensationHandlerEffectWaits.filter fun candidate =>
    candidate.id == effectId)
  let trigger ← findUnique? (state.compensationTriggers.filter fun candidate =>
    candidate.id == wait.triggerId)
  if trigger.lifecycle != .active then none
  else
    let handler ← findUnique? (trigger.handlers.filter fun candidate =>
      candidate.identity.id == wait.handlerId)
    match handler.lifecycle with
    | .compensating _ activeEffectId =>
        if activeEffectId == effectId then some { wait, trigger, handler } else none
    | _ => none

private def terminalHandler (handler : CompensationHandlerExecution)
    (lifecycle : CompensationHandlerLifecycle) : CompensationHandlerExecution :=
  { identity := handler.identity, lifecycle }

private def replaceHandler (selected replacement : CompensationHandlerExecution) :
    List CompensationHandlerExecution → List CompensationHandlerExecution :=
  List.map fun candidate =>
    if candidate.identity.id == selected.identity.id then replacement else candidate

private def replaceTrigger (selected replacement : CompensationTriggerExecution) :
    List CompensationTriggerExecution → List CompensationTriggerExecution :=
  List.map fun candidate =>
    if candidate.id == selected.id then replacement else candidate

private def allHandlersCompensated (handlers : List CompensationHandlerExecution) : Bool :=
  handlers.all fun handler => handler.lifecycle == .compensated

private def completionCapacityRefusal? (declaration : CompensationExecutionDeclaration)
    (triggers : List CompensationTriggerExecution)
    (waits : List CompensationHandlerEffectWait) :
    Option CompensationHandlerCompletionRefusal :=
  match compensationExecutionCapacityRefusal? declaration triggers waits with
  | some (.capacity measure bound prospective) => some (.capacity measure bound prospective)
  | some _ => some .invalidState
  | none => none

private def completeSuccess (program : Program)
    (declaration : CompensationExecutionDeclaration) (state : RuntimeState)
    (selected : SelectedCompensationHandler) : CompensationHandlerCompletionAttempt :=
  let completed := terminalHandler selected.handler .compensated
  let handlers := replaceHandler selected.handler completed selected.trigger.handlers
  let allCompensated := allHandlersCompensated handlers
  let progressed : CompensationTriggerExecution :=
    { selected.trigger with
      lifecycle := if allCompensated then .succeeded else .active
      handlers }
  let remainingWaits := state.compensationHandlerEffectWaits.filter fun wait =>
    wait.id != selected.wait.id
  let activated? : Option CompensationFrontierActivation :=
    if allCompensated then
      some { trigger := progressed, waits := [], effectActivations := state.effectActivations }
    else
      activateCompensationFrontier program
        { state with compensationHandlerEffectWaits := remainingWaits } progressed
  match activated? with
  | none => .refused .invalidState
  | some activated =>
      let triggers := replaceTrigger selected.trigger activated.trigger state.compensationTriggers
      let waits := activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current) remainingWaits
      match completionCapacityRefusal? declaration triggers waits with
      | some reason => .refused reason
      | none =>
          let successor :=
            { state with
              tokens := if allCompensated then
                  addToken state.tokens selected.trigger.output selected.trigger.owner
                else state.tokens
              compensationTriggers := triggers
              compensationHandlerEffectWaits := waits
              effectActivations := activated.effectActivations }
          if compensationTriggerHandlerStateValid program successor then .applied successor
          else .refused .invalidState

private def failOtherHandler (failed : CompensationHandlerExecution)
    (candidate : CompensationHandlerExecution) : CompensationHandlerExecution :=
  if candidate.identity.id == failed.identity.id then terminalHandler candidate .failed
  else match candidate.lifecycle with
    | .pending _ | .compensating _ _ => terminalHandler candidate .terminated
    | .compensated | .failed | .terminated => candidate

private def completeFailure (program : Program) (state : RuntimeState)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String) :
    CompensationHandlerCompletionAttempt :=
  let failedTrigger : CompensationTriggerExecution :=
    { selected.trigger with
      lifecycle := .failed
      handlers := selected.trigger.handlers.map (failOtherHandler selected.handler) }
  let failure : CompensationHandlerFailure :=
    { kind := .compensationHandlerFailure
      triggerId := selected.trigger.id
      handlerId := selected.handler.identity.id
      effectId := selected.wait.id
      code
      message }
  let successor : RuntimeState :=
    { state with
      control := .failed selected.trigger.owner.processInstanceId failure
      initiationPending := false
      scopeOccurrences := []
      tokens := []
      waits := []
      messageWaits := []
      timerWaits := []
      effectWaits := []
      effectIncidents := []
      selectedBranchSets := []
      eventRaces := []
      calledProcessOccurrences := []
      activityOccurrences := []
      sequentialMultiInstanceControllers := []
      parallelMultiInstanceControllers := []
      compensationActivityRetentions := []
      compensationParentContextRetentions := []
      compensationTriggers :=
        replaceTrigger selected.trigger failedTrigger state.compensationTriggers
      compensationHandlerEffectWaits := []
      variables := { state.variables with activities := [] } }
  if compensationTriggerHandlerStateValid program successor then .applied successor
  else .refused .invalidState

private def resultHasEmptyPatch : EffectExecutionResult → Bool
  | .success patch | .bpmnError _ _ patch => patch.isEmpty

/-- Completes one exact compensation effect, with prospective frontier checks before mutation. -/
def attemptCompensationHandlerEffectCompletion (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : CompensationHandlerCompletionAttempt :=
  match program.compensationExecution with
  | none => .refused .invalidProgram
  | some declaration =>
      if !compensationExecutionDeclarationValid program then .refused .invalidProgram
      else if !compensationTriggerHandlerStateValid program state ||
          (match state.control with | .running _ => false | _ => true) then
        .refused .invalidState
      else if !resultHasEmptyPatch result then .refused .nonemptyPatch
      else match selectCompensationHandler? state effectId with
        | none => .refused .staleEffect
        | some selected =>
            match result with
            | .success _ => completeSuccess program declaration state selected
            | .bpmnError code message _ => completeFailure program state selected code message

inductive CompensationHandlerCompletionStep (program : Program) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : RuntimeState → Prop where
  | applied (after : RuntimeState)
      (selected : attemptCompensationHandlerEffectCompletion program before effectId result =
        .applied after) :
      CompensationHandlerCompletionStep program before effectId result after

theorem attemptCompensationHandlerEffectCompletion_sound (program : Program)
    (before after : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult)
    (selected : attemptCompensationHandlerEffectCompletion program before effectId result =
      .applied after) :
    CompensationHandlerCompletionStep program before effectId result after :=
  .applied after selected

end BpmnSemantics.SemanticProcess
