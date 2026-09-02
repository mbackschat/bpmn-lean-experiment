import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCancellation
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

/-- The unique submitted wait, active trigger, and compensating handler selected by an effect id. -/
structure SelectedCompensationHandler where
  wait : CompensationHandlerEffectWait
  trigger : CompensationTriggerExecution
  handler : CompensationHandlerExecution

private def findUnique? (candidates : List α) : Option α :=
  match candidates with
  | [candidate] => some candidate
  | _ => none

/-- Selects the unique active compensation handler owning the submitted effect occurrence. -/
def selectCompensationHandler? (state : RuntimeState)
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

/-- Preserves handler identity while assigning a terminal lifecycle. -/
def terminalHandler (handler : CompensationHandlerExecution)
    (lifecycle : CompensationHandlerLifecycle) : CompensationHandlerExecution :=
  { identity := handler.identity, lifecycle }

/-- Replaces exactly the selected handler identity. -/
def replaceHandler (selected replacement : CompensationHandlerExecution) :
    List CompensationHandlerExecution → List CompensationHandlerExecution :=
  List.map fun candidate =>
    if candidate.identity.id == selected.identity.id then replacement else candidate

/-- Replaces exactly the selected trigger identity. -/
def replaceTrigger (selected replacement : CompensationTriggerExecution) :
    List CompensationTriggerExecution → List CompensationTriggerExecution :=
  List.map fun candidate =>
    if candidate.id == selected.id then replacement else candidate

/-- Decides whether every handler has completed compensation. -/
def allHandlersCompensated (handlers : List CompensationHandlerExecution) : Bool :=
  handlers.all fun handler => handler.lifecycle == .compensated

/-- Maps the shared compensation capacity check into the completion refusal contract. -/
def completionCapacityRefusal? (declaration : CompensationExecutionDeclaration)
    (triggers : List CompensationTriggerExecution)
    (waits : List CompensationHandlerEffectWait) :
    Option CompensationHandlerCompletionRefusal :=
  match compensationExecutionCapacityRefusal? declaration triggers waits with
  | some (.capacity measure bound prospective) => some (.capacity measure bound prospective)
  | some _ => some .invalidState
  | none => none

/-- Evaluates the prospective success path for one selected compensation handler. -/
def completeSuccess (program : Program)
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

/-- Builds the fail-fast Process successor for one compensation handler error. -/
def compensationFailureSuccessor (state : RuntimeState)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String) :
    RuntimeState :=
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
  successor

private theorem failOtherHandler_sound (failed candidate : CompensationHandlerExecution) :
    CompensationHandlerFailureDisposition failed.identity.id candidate
      (failOtherHandler failed candidate) := by
  cases candidate with
  | mk identity lifecycle =>
      cases selectedEq : identity.id == failed.identity.id with
      | true =>
          simpa [failOtherHandler, terminalHandler, selectedEq] using
            (CompensationHandlerFailureDisposition.failed identity lifecycle selectedEq)
      | false =>
          cases lifecycle with
          | pending restoredContext =>
              simpa [failOtherHandler, terminalHandler, selectedEq] using
                (CompensationHandlerFailureDisposition.terminatedPending identity restoredContext
                  selectedEq)
          | compensating restoredContext effectId =>
              simpa [failOtherHandler, terminalHandler, selectedEq] using
                (CompensationHandlerFailureDisposition.terminatedCompensating identity
                  restoredContext effectId selectedEq)
          | compensated =>
              simpa [failOtherHandler, selectedEq] using
                (CompensationHandlerFailureDisposition.preserveCompensated identity selectedEq)
          | failed =>
              simpa [failOtherHandler, selectedEq] using
                (CompensationHandlerFailureDisposition.preserveFailed identity selectedEq)
          | terminated =>
              simpa [failOtherHandler, selectedEq] using
                (CompensationHandlerFailureDisposition.preserveTerminated identity selectedEq)

private theorem failOtherHandlers_sound (failed : CompensationHandlerExecution)
    (handlers : List CompensationHandlerExecution) :
    CompensationHandlerFailureDispositions failed.identity.id handlers
      (handlers.map (failOtherHandler failed)) := by
  induction handlers with
  | nil => exact .nil
  | cons candidate tail ih =>
      exact .cons candidate (failOtherHandler failed candidate) tail
        (tail.map (failOtherHandler failed)) (failOtherHandler_sound failed candidate) ih

/-- The executable failure successor realizes the independent `COMPH-CANCEL-01` relation. -/
theorem compensationFailureSuccessor_cancellation_sound (state : RuntimeState)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String) :
    CompensationHandlerFailureCancellationStep state selected.wait selected.trigger
      selected.handler code message (compensationFailureSuccessor state selected code message) := by
  let handlers := selected.trigger.handlers.map (failOtherHandler selected.handler)
  let failedTrigger : CompensationTriggerExecution :=
    { selected.trigger with lifecycle := .failed, handlers }
  let failure : CompensationHandlerFailure :=
    { kind := .compensationHandlerFailure
      triggerId := selected.trigger.id
      handlerId := selected.handler.identity.id
      effectId := selected.wait.id
      code
      message }
  exact .cancel handlers failedTrigger failure
    (compensationFailureSuccessor state selected code message)
    (failOtherHandlers_sound selected.handler selected.trigger.handlers) rfl rfl rfl

/-- Evaluates the fail-fast Process successor for one selected handler error. -/
def completeFailure (program : Program) (state : RuntimeState)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String) :
    CompensationHandlerCompletionAttempt :=
  let successor := compensationFailureSuccessor state selected code message
  if compensationTriggerHandlerStateValid program successor then .applied successor
  else .refused .invalidState

private theorem compensationFailureSuccessor_activity_identity_discipline
    (state : RuntimeState) (selected : SelectedCompensationHandler)
    (code : String) (message : Option String) :
    activityIdentityIssuingDiscipline state
      (compensationFailureSuccessor state selected code message) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  simp [compensationFailureSuccessor] at present

/-- Compensation handlers admit only empty effect-result patches. -/
def resultHasEmptyPatch : EffectExecutionResult → Bool
  | .success patch | .bpmnError _ _ patch => patch.isEmpty

/-- Decides whether the current Process state can accept a compensation completion. -/
def compensationHandlerCompletionStateRejected (program : Program)
    (state : RuntimeState) : Bool :=
  !compensationTriggerHandlerStateValid program state ||
    (match state.control with | .running _ => false | _ => true)

/-- Decides whether a completion attempts a forbidden variable mutation. -/
def compensationHandlerCompletionPatchRejected (result : EffectExecutionResult) : Bool :=
  !resultHasEmptyPatch result

/-- Completes one exact compensation effect, with prospective frontier checks before mutation. -/
def attemptCompensationHandlerEffectCompletion (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : CompensationHandlerCompletionAttempt :=
  match program.compensationExecution with
  | none => .refused .invalidProgram
  | some declaration =>
      if !compensationExecutionDeclarationValid program then .refused .invalidProgram
      else if compensationHandlerCompletionStateRejected program state then
        .refused .invalidState
      else if compensationHandlerCompletionPatchRejected result then .refused .nonemptyPatch
      else match selectCompensationHandler? state effectId with
        | none => .refused .staleEffect
        | some selected =>
            match result with
            | .success _ => completeSuccess program declaration state selected
            | .bpmnError code message _ => completeFailure program state selected code message

/-- The Process declares a valid compensation execution contract. -/
inductive CompensationHandlerCompletionProgramReady (program : Program) :
    CompensationExecutionDeclaration → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (selected : program.compensationExecution = some declaration)
      (accepted : (!compensationExecutionDeclarationValid program) = false) :
      CompensationHandlerCompletionProgramReady program declaration

/-- The submitted state is a valid running compensation state. -/
inductive CompensationHandlerCompletionStateReady (program : Program)
    (before : RuntimeState) : CompensationExecutionDeclaration → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (programReady : CompensationHandlerCompletionProgramReady program declaration)
      (accepted : compensationHandlerCompletionStateRejected program before = false) :
      CompensationHandlerCompletionStateReady program before declaration

/-- The submitted completion carries the empty patch required by compensation handlers. -/
inductive CompensationHandlerCompletionInputReady (program : Program)
    (before : RuntimeState) (result : EffectExecutionResult) :
    CompensationExecutionDeclaration → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (stateReady : CompensationHandlerCompletionStateReady program before declaration)
      (accepted : compensationHandlerCompletionPatchRejected result = false) :
      CompensationHandlerCompletionInputReady program before result declaration

/-- The submitted effect identifies one unique active compensating handler. -/
inductive CompensationHandlerCompletionReady (program : Program) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) :
    CompensationExecutionDeclaration → SelectedCompensationHandler → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler)
      (inputReady : CompensationHandlerCompletionInputReady program before result declaration)
      (handlerSelected : selectCompensationHandler? before effectId = some selected) :
      CompensationHandlerCompletionReady program before effectId result declaration selected

/-- Declarative prospective state shared by successful final and advancing completions. -/
inductive CompensationHandlerSuccessCandidate (program : Program) (before : RuntimeState)
    (selected : SelectedCompensationHandler) : Bool → CompensationFrontierActivation →
      List CompensationTriggerExecution → List CompensationHandlerEffectWait → Prop where
  | final (completed : CompensationHandlerExecution)
      (handlers : List CompensationHandlerExecution)
      (progressed : CompensationTriggerExecution)
      (remainingWaits : List CompensationHandlerEffectWait)
      (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait)
      (completedShape : completed = terminalHandler selected.handler .compensated)
      (handlersShape : handlers =
        replaceHandler selected.handler completed selected.trigger.handlers)
      (allCompensated : allHandlersCompensated handlers = true)
      (progressedShape : progressed =
        { selected.trigger with lifecycle := .succeeded, handlers })
      (remainingShape : remainingWaits =
        before.compensationHandlerEffectWaits.filter fun wait => wait.id != selected.wait.id)
      (activatedShape : activated =
        { trigger := progressed, waits := [], effectActivations := before.effectActivations })
      (triggersShape : triggers =
        replaceTrigger selected.trigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = remainingWaits) :
      CompensationHandlerSuccessCandidate program before selected true activated triggers waits
  | advance (completed : CompensationHandlerExecution)
      (handlers : List CompensationHandlerExecution)
      (progressed : CompensationTriggerExecution)
      (remainingWaits : List CompensationHandlerEffectWait)
      (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait)
      (completedShape : completed = terminalHandler selected.handler .compensated)
      (handlersShape : handlers =
        replaceHandler selected.handler completed selected.trigger.handlers)
      (unfinished : allHandlersCompensated handlers = false)
      (progressedShape : progressed =
        { selected.trigger with lifecycle := .active, handlers })
      (remainingShape : remainingWaits =
        before.compensationHandlerEffectWaits.filter fun wait => wait.id != selected.wait.id)
      (frontier : CompensationFrontierStep program
        { before with compensationHandlerEffectWaits := remainingWaits }
        progressed activated)
      (triggersShape : triggers =
        replaceTrigger selected.trigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current) remainingWaits) :
      CompensationHandlerSuccessCandidate program before selected false activated triggers waits

/-- Declarative successful compensation-handler completion. -/
inductive CompensationHandlerCompletionStep (program : Program) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : RuntimeState → Prop where
  | successFinal (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (patch : List VariableBinding)
      (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (after : RuntimeState)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .success patch)
      (candidate : CompensationHandlerSuccessCandidate program before selected true
        activated triggers waits)
      (withinCapacity : completionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { before with
          tokens := addToken before.tokens selected.trigger.output selected.trigger.owner
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (afterValid : compensationTriggerHandlerStateValid program after = true) :
      CompensationHandlerCompletionStep program before effectId result after
  | successAdvance (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (patch : List VariableBinding)
      (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (after : RuntimeState)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .success patch)
      (candidate : CompensationHandlerSuccessCandidate program before selected false
        activated triggers waits)
      (withinCapacity : completionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { before with
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (afterValid : compensationTriggerHandlerStateValid program after = true) :
      CompensationHandlerCompletionStep program before effectId result after
  | failure (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (code : String) (message : Option String)
      (patch : List VariableBinding) (after : RuntimeState)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .bpmnError code message patch)
      (cancelled : CompensationHandlerFailureCancellationStep before selected.wait
        selected.trigger selected.handler code message after)
      (afterValid : compensationTriggerHandlerStateValid program after = true) :
      CompensationHandlerCompletionStep program before effectId result after

/-- Declarative refusal of a compensation-handler completion before any mutation is committed. -/
inductive CompensationHandlerCompletionRefusalStep (program : Program)
    (before : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : CompensationHandlerCompletionRefusal → Prop where
  | invalidProgram
      (rejected : match program.compensationExecution with
        | none => true
        | some _ => !compensationExecutionDeclarationValid program) :
      CompensationHandlerCompletionRefusalStep program before effectId result .invalidProgram
  | invalidState (declaration : CompensationExecutionDeclaration)
      (programReady : CompensationHandlerCompletionProgramReady program declaration)
      (rejected : compensationHandlerCompletionStateRejected program before = true) :
      CompensationHandlerCompletionRefusalStep program before effectId result .invalidState
  | nonemptyPatch (declaration : CompensationExecutionDeclaration)
      (stateReady : CompensationHandlerCompletionStateReady program before declaration)
      (rejected : compensationHandlerCompletionPatchRejected result = true) :
      CompensationHandlerCompletionRefusalStep program before effectId result .nonemptyPatch
  | staleEffect (declaration : CompensationExecutionDeclaration)
      (inputReady : CompensationHandlerCompletionInputReady program before result declaration)
      (absent : selectCompensationHandler? before effectId = none) :
      CompensationHandlerCompletionRefusalStep program before effectId result .staleEffect
  | invalidFrontier (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (patch : List VariableBinding)
      (completed : CompensationHandlerExecution)
      (handlers : List CompensationHandlerExecution)
      (progressed : CompensationTriggerExecution)
      (remainingWaits : List CompensationHandlerEffectWait)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .success patch)
      (completedShape : completed = terminalHandler selected.handler .compensated)
      (handlersShape : handlers =
        replaceHandler selected.handler completed selected.trigger.handlers)
      (unfinished : allHandlersCompensated handlers = false)
      (progressedShape : progressed =
        { selected.trigger with lifecycle := .active, handlers })
      (remainingShape : remainingWaits =
        before.compensationHandlerEffectWaits.filter fun wait => wait.id != selected.wait.id)
      (frontier : CompensationFrontierRefusalStep program
        { before with compensationHandlerEffectWaits := remainingWaits } progressed) :
      CompensationHandlerCompletionRefusalStep program before effectId result .invalidState
  | capacity (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (patch : List VariableBinding)
      (allCompensated : Bool) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait)
      (reason : CompensationHandlerCompletionRefusal)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .success patch)
      (candidate : CompensationHandlerSuccessCandidate program before selected
        allCompensated activated triggers waits)
      (exceeded : completionCapacityRefusal? declaration triggers waits = some reason) :
      CompensationHandlerCompletionRefusalStep program before effectId result reason
  | invalidSuccessor (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (patch : List VariableBinding)
      (allCompensated : Bool) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (after : RuntimeState)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .success patch)
      (candidate : CompensationHandlerSuccessCandidate program before selected
        allCompensated activated triggers waits)
      (withinCapacity : completionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { before with
          tokens := if allCompensated then
              addToken before.tokens selected.trigger.output selected.trigger.owner
            else before.tokens
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (rejected : compensationTriggerHandlerStateValid program after = false) :
      CompensationHandlerCompletionRefusalStep program before effectId result .invalidState
  | invalidFailureSuccessor (declaration : CompensationExecutionDeclaration)
      (selected : SelectedCompensationHandler) (code : String) (message : Option String)
      (patch : List VariableBinding) (after : RuntimeState)
      (ready : CompensationHandlerCompletionReady program before effectId result
        declaration selected)
      (resultShape : result = .bpmnError code message patch)
      (cancelled : CompensationHandlerFailureCancellationStep before selected.wait
        selected.trigger selected.handler code message after)
      (rejected : compensationTriggerHandlerStateValid program after = false) :
      CompensationHandlerCompletionRefusalStep program before effectId result .invalidState

end BpmnSemantics.SemanticProcess
