import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletion
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # Compensation trigger and handler flow-node occurrences

This module projects the private pairing anchors for the bounded compensation trigger and its
single-effect handlers. Compensation effect waits stay outside ordinary `awaitEffect` projection,
so a handler whose body has a distinct element contributes both its handler anchor and one wait
anchor without inventing a second semantic operation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def compensationTriggerStart (program : Program) (origin : BpmnElementOrigin)
    (trigger : CompensationTriggerExecution) : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := .compensationTrigger trigger.id
    processId := program.processId
    elementId := origin.elementId
    owner := trigger.owner }

private def compensationHandlerStart (program : Program) (owner : ScopeOccurrenceId)
    (handler : CompensationHandlerExecution) : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := .compensationHandler handler.identity.id
    processId := program.processId
    elementId := handler.identity.handlerElementId
    owner }

private def compensationEffectStart (program : Program) (owner : ScopeOccurrenceId)
    (effectId : EffectOccurrenceId) : UnnumberedFlowNodeOccurrenceStart :=
  { anchor := .wait effectId
    processId := program.processId
    elementId := ⟨effectId.elementId.value⟩
    owner }

private def activeCompensationHandlerStarts (program : Program) (owner : ScopeOccurrenceId) :
    List CompensationHandlerExecution → List UnnumberedFlowNodeOccurrenceStart
  | [] => []
  | handler :: rest =>
      let tail := activeCompensationHandlerStarts program owner rest
      match handler.lifecycle with
      | .compensating _ effectId =>
          compensationHandlerStart program owner handler ::
            if effectId.elementId.value = handler.identity.handlerElementId.value then tail
            else compensationEffectStart program owner effectId :: tail
      | .pending _ | .compensated | .failed | .terminated => tail

private def activeCompensationTriggerStarts (program : Program)
    (operation : SemanticOperation) :
    List CompensationTriggerExecution → List UnnumberedFlowNodeOccurrenceStart
  | [] => []
  | trigger :: rest =>
      let tail := activeCompensationTriggerStarts program operation rest
      match operation, trigger.lifecycle with
      | .triggerCompensation _ origin _ _ _, .active =>
          compensationTriggerStart program origin trigger ::
            activeCompensationHandlerStarts program trigger.owner trigger.handlers ++ tail
      | _, _ => tail

private def declaredCompensationTriggerOperation? (program : Program) :
    Option SemanticOperation := do
  let declaration ← program.compensationExecution
  match program.operations.filter fun operation =>
      decide (operation.id = declaration.triggerOperationId) with
  | [operation@(.triggerCompensation ..)] => some operation
  | _ => none

/-- Exact open trigger, handler, and distinct handler-body occurrences in committed state. -/
def projectOpenCompensationFlowNodeOccurrences? (program : Program) (state : RuntimeState) :
    Option (List OpenSemanticFlowNodeOccurrence) := do
  if !compensationExecutionStateValid program state then none
  else match state.control with
    | .notStarted | .completed _ | .cancelled _ | .failed .. => some []
    | .running _ =>
        match program.compensationExecution with
        | none => some []
        | some _ =>
            let operation ← declaredCompensationTriggerOperation? program
            let starts := sortFlowNodeOccurrenceStarts
              (activeCompensationTriggerStarts program operation state.compensationTriggers)
            if starts.map (·.anchor) |>.Nodup then some starts else none

/-- Ordinary runtime-local projection for the proposal's manual pre-profile Program.

The approved checkpoint forbids profile admission, while lifecycle fold checking still requires the
same runtime correspondence checks as the independently written TypeScript open-set projector. -/
private def projectOpenOrdinaryFlowNodeOccurrencesForCompensation? (program : Program)
    (state : RuntimeState) : Option (List OpenSemanticFlowNodeOccurrence) :=
  match state.control with
  | .running _ => do
      if !flowNodeOccurrenceProgramValidity program state ||
          !eventRaceAssociationsValid state || !calledProcessAssociationsValid state ||
          !effectIncidentAssociationsValid state || !messageBoundedProjectionValid program state then none
      let waits ← projectWaits? program state
      let scopes ← (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
        (scopeStart? program state)
      let calls ← state.calledProcessOccurrences.mapM (callStart? program state)
      let projected := sortFlowNodeOccurrenceStarts (waits ++ scopes ++ calls)
      if projected.map (·.anchor) |>.Nodup then some projected else none
  | _ => projectOpenFlowNodeOccurrences? program state

/-- Existing open projection plus the compensation anchors owned only by this focused lane. -/
def projectOpenFlowNodeOccurrencesWithCompensation? (program : Program)
    (state : RuntimeState) : Option (List OpenSemanticFlowNodeOccurrence) := do
  let ordinary ← projectOpenOrdinaryFlowNodeOccurrencesForCompensation? program state
  let compensation ← projectOpenCompensationFlowNodeOccurrences? program state
  let projected := sortFlowNodeOccurrenceStarts (ordinary ++ compensation)
  if projected.map (·.anchor) |>.Nodup then some projected else none

private def compensationHandlerTerminalEnds (handler : CompensationHandlerExecution)
    (terminal : FlowNodeOccurrenceTerminalKind) : List UnnumberedFlowNodeOccurrenceEnd :=
  match handler.lifecycle with
  | .compensating _ effectId =>
      { anchor := .compensationHandler handler.identity.id, terminal } ::
        if effectId.elementId.value = handler.identity.handlerElementId.value then []
        else [{ anchor := .wait effectId, terminal }]
  | .pending _ | .compensated | .failed | .terminated => []

private def pendingBefore (handlers : List CompensationHandlerExecution)
    (id : OccurrenceId) : Bool :=
  match handlers.filter fun handler => decide (handler.identity.id = id) with
  | [{ lifecycle := .pending _, .. }] => true
  | _ => false

private def newlyActiveCompensationHandlerStarts (program : Program)
    (owner : ScopeOccurrenceId) (before : List CompensationHandlerExecution) :
    List CompensationHandlerExecution → List UnnumberedFlowNodeOccurrenceStart
  | [] => []
  | handler :: rest =>
      let tail := newlyActiveCompensationHandlerStarts program owner before rest
      match handler.lifecycle with
      | .compensating _ effectId =>
          if pendingBefore before handler.identity.id then
            compensationHandlerStart program owner handler ::
              if effectId.elementId.value = handler.identity.handlerElementId.value then tail
              else compensationEffectStart program owner effectId :: tail
          else tail
      | .pending _ | .compensated | .failed | .terminated => tail

private def compensationTriggerLifecycle? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  match operation with
  | .triggerCompensation _ origin _ _ _ =>
      let created := after.compensationTriggers.filter fun trigger =>
        trigger.id.elementId.value == operation.id.value && trigger.owner == owner &&
          !(before.compensationTriggers.any fun candidate => candidate.id == trigger.id)
      match created with
      | [] => some (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex
          [{ processId := program.processId, elementId := origin.elementId, owner }])
      | [trigger] =>
          if trigger.lifecycle != .active then none
          else some (canonicalFlowNodeOccurrenceDelta
            (compensationTriggerStart program origin trigger ::
              activeCompensationHandlerStarts program owner trigger.handlers) [])
      | _ => none
  | _ => none

private def compensationCompletionLifecycle? (program : Program) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let wait ← match before.compensationHandlerEffectWaits.filter fun candidate =>
      candidate.id == effectId with
    | [wait] => some wait
    | _ => none
  let trigger ← match before.compensationTriggers.filter fun candidate =>
      candidate.id == wait.triggerId with
    | [trigger] => some trigger
    | _ => none
  if trigger.lifecycle != .active then none
  let handler ← match trigger.handlers.filter fun candidate =>
      candidate.identity.id == wait.handlerId with
    | [handler@{ lifecycle := .compensating _ activeEffectId, .. }] =>
        if activeEffectId == effectId then some handler else none
    | _ => none
  let afterTrigger ← match after.compensationTriggers.filter fun candidate =>
      candidate.id == trigger.id with
    | [afterTrigger] => some afterTrigger
    | _ => none
  match result with
  | .success _ =>
      let ended := compensationHandlerTerminalEnds handler .completed ++
        if afterTrigger.lifecycle = .succeeded then
          [{ anchor := .compensationTrigger trigger.id, terminal := .completed }]
        else []
      let started := if afterTrigger.lifecycle = .active then
          newlyActiveCompensationHandlerStarts program trigger.owner trigger.handlers
            afterTrigger.handlers
        else []
      pure (canonicalFlowNodeOccurrenceDelta started ended)
  | .bpmnError _ _ _ =>
      let ended := { anchor := .compensationTrigger trigger.id, terminal := .cancelled } ::
        trigger.handlers.flatMap fun candidate =>
          compensationHandlerTerminalEnds candidate .cancelled
      pure (canonicalFlowNodeOccurrenceDelta [] ended)

private def acceptCompensationFlowNodeOccurrenceCandidate? (program : Program)
    (before after : RuntimeState) (candidate : UnnumberedFlowNodeOccurrenceDelta) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let openBefore ← projectOpenFlowNodeOccurrencesWithCompensation? program before
  let openAfter ← projectOpenFlowNodeOccurrencesWithCompensation? program after
  let folded ← applyFlowNodeOccurrenceDelta? openBefore candidate
  if folded = openAfter then some candidate else none

/-- Compensation-aware external lifecycle, selecting dedicated waits before ordinary effects. -/
def flowNodeOccurrenceDeltaForStimulusWithCompensation? (program : Program)
    (before after : RuntimeState) (stimulus : Stimulus) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  let candidate := match stimulus with
    | .completeEffect _ effectId result =>
        match before.compensationHandlerEffectWaits.filter fun wait => wait.id == effectId with
        | [] => candidateFlowNodeOccurrenceDeltaForStimulus? program before stimulus
            (stimulusCommandId stimulus) transitionIndex
        | [_] => compensationCompletionLifecycle? program before after effectId result
        | _ => none
    | _ => candidateFlowNodeOccurrenceDeltaForStimulus? program before stimulus
        (stimulusCommandId stimulus) transitionIndex
  candidate >>= acceptCompensationFlowNodeOccurrenceCandidate? program before after

/-- Compensation-aware internal lifecycle for the atomic trigger/frontier operation. -/
def flowNodeOccurrenceDeltaForOperationWithCompensation? (program : Program)
    (before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  let candidate := match operation with
    | .triggerCompensation .. => do
        let owner ← flowNodeSelectedOperationOwner? before operation
        compensationTriggerLifecycle? program before after operation owner commandId
          transitionIndex
    | _ => candidateFlowNodeOccurrenceDeltaForOperation? program before after operation
        commandId transitionIndex
  candidate >>= acceptCompensationFlowNodeOccurrenceCandidate? program before after

end BpmnSemantics.SemanticProcess
