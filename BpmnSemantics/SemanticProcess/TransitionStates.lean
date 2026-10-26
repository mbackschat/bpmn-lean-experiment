module

public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.WaitActivation
public import BpmnSemantics.SemanticProcess.EventBasedGateway
public import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
public import BpmnSemantics.SemanticProcess.ScopeCancellation
public import BpmnSemantics.SemanticProcess.NestedScopeData

/-! # Single-operation state evaluators

Each evaluator rewrites a state for one operation shape from its unique input owner; the step relation
and dispatcher in `Transition` select among them and bridge them to `OperationStep`.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def runningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

def awaitUserTaskState? (state : RuntimeState) (input output : ControlPlaceId)
    (task : UserTaskDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateUserTask state owner.processInstanceId owner input output task)

def awaitTimerState? (state : RuntimeState) (input output : ControlPlaceId)
    (timer : TimerDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateTimer state owner.processInstanceId owner input output timer)

def awaitMessageState? (state : RuntimeState) (input output : ControlPlaceId)
    (message : MessageDefinition) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (activateMessage state owner.processInstanceId owner input output message)

def awaitPayloadMessageState? (state : RuntimeState) (input output : ControlPlaceId)
    (message : MessageDefinition) : Option RuntimeState :=
  awaitMessageState? state input output message

def awaitCorrelatedPayloadMessageState? (state : RuntimeState)
    (input output : ControlPlaceId) (message : MessageDefinition) : Option RuntimeState :=
  awaitMessageState? state input output message

def awaitEventRaceState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : EventRaceMessageArm)
    (timer : EventRaceTimerArm) : Option RuntimeState :=
  armEventRaceState? state origin input message timer

def awaitEffectState? (program : Program) (state : RuntimeState) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  let arguments ← evaluateEffectInputs? program state owner effect.inputMappings
  let effectOwner : EffectOccurrenceId :=
    ⟨owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount state effect.elementId + 1⟩
  if state.variables.activities.any (activityScopeMatches effectOwner) then none
  else pure (activateEffect state owner.processInstanceId owner input output effect route arguments)

def duplicateState? (state : RuntimeState) (input : ControlPlaceId)
    (outputs : List ControlPlaceId) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  pure (duplicateToken state owner input outputs)

def synchronizeState? (state : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId) : Option RuntimeState := do
  let owner ← commonTokenOwner? state inputs
  pure (synchronizeTokens state owner inputs output)

def chooseState? (state : RuntimeState) (input : ControlPlaceId)
    (candidates : List ConditionalCandidate) (defaultOutput : ControlPlaceId) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let output ← selectConditionalOutput candidates defaultOutput
    state.variables.process.bindings
  pure (chooseToken state owner input output)

def reachNoneEndState? (state : RuntimeState) (input : ControlPlaceId) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  pure (reachNoneEndToken state owner input)

def throwErrorState? (state : RuntimeState) (input : ControlPlaceId)
    (error : ErrorReference) (handler : InterruptingErrorHandler) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let _ ← runningInstance? state
  if owner.definitionScopeId ≠ handler.attachedScopeId ||
      error.code ≠ handler.code ||
      error.errorElementId ≠ handler.origin.errorElementId then none
  else
    let occurrence ← match state.scopeOccurrences.filter fun candidate =>
        decide (candidate.id = owner) with
      | [candidate] => some candidate
      | _ => none
    let parent ← occurrence.parent
    if state.scopeOccurrences.any fun candidate => candidate.id == parent then
      some (interruptScope state owner parent handler.output)
    else none

end BpmnSemantics.SemanticProcess
