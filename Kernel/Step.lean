module

public import Kernel.Hooks

/-! # Step

The single step function. It owns dispatch on element kind, event role, input kind, open-item kind and signal, and
the order in which hooks run: an input's own transition first, then the closure. The closure repeats, oldest
first: hand the next signal to its hook; else route the next token to the element at the end of its flow; else
complete one idle scope occurrence; until none is left. A closure that does not settle within `closureBound`
steps is `unsupported`, never silently truncated.

A scope occurrence is idle when it holds no token, no blocking open item, no parked token and no child
occurrence. An idle Scope element is completed by its hook; an idle process root completes the instance, removing
the passive items left in it.
-/

public section

namespace Kernel.Step

/-- Route one token to the element its flow targets. -/
def arrive (hooks : Hooks) (ctx : Ctx) (token : Token) (state : State) : Outcome :=
  let arrival : Arrival := { flow := token.flow, scope := token.scope }
  match (ctx.program.target? token.flow).bind ctx.program.element? with
  | none => .error (.semanticFailure "flow-without-target")
  | some (.activity header payload) => hooks.arriveActivity ctx header payload arrival state
  | some (.scope header payload) => hooks.arriveScope ctx header payload arrival state
  | some (.gateway header payload) => hooks.arriveGateway ctx header payload arrival state
  | some (.start _ _) => .error (.semanticFailure "flow-into-start-event")
  | some (.event header payload) =>
    match payload.role with
    | .catch subscription => hooks.arriveCatch ctx header payload subscription arrival state
    | .throw thrown => hooks.arriveThrow ctx header payload thrown arrival state
    | .linkCatch _ => hooks.arriveLink ctx header payload arrival state
    | .linkThrow _ => hooks.arriveLink ctx header payload arrival state

def signal (hooks : Hooks) (ctx : Ctx) : Signal → State → Outcome
  | .arm host element scope => hooks.arm ctx host element scope
  | .armScope scope => hooks.armScope ctx scope
  | .armGateway gateway scope => hooks.armGateway ctx gateway scope
  | .raise event origin => hooks.raise ctx event origin
  | .startEventSubProcess element parent variables => hooks.startEventSubProcess ctx element parent variables

def idle (state : State) (scope : ScopeOccurrenceId) : Bool :=
  !state.tokens.any (·.scope == scope) &&
    !state.openItems.any (fun item => item.scope == scope && !item.passive) &&
    !state.slots.parked.any (·.scope == scope) &&
    !state.slots.held.any (·.scope == scope) &&
    !state.scopes.any (·.parent == some scope)

def completeScope (hooks : Hooks) (ctx : Ctx) (occurrence : ScopeOccurrence) (state : State) : Outcome :=
  let notScope : Outcome := .error (.semanticFailure "scope-occurrence-without-scope")
  match occurrence.element.bind ctx.program.element? with
  | some (.scope header payload) => hooks.completeScope ctx header payload occurrence state
  | some (.activity _ _) => notScope
  | some (.event _ _) => notScope
  | some (.gateway _ _) => notScope
  | some (.start _ _) => notScope
  | none => notScope

def closureBound : Nat := 100000

def settle (hooks : Hooks) (ctx : Ctx) : Nat → State → Outcome
  | 0, _ => .error (.unsupported "closure-bound")
  | fuel + 1, state =>
    if state.status != .running then .ok state
    else
      match state.signals, state.tokens with
      | next :: rest, _ => do settle hooks ctx fuel (← signal hooks ctx next { state with signals := rest })
      | [], token :: rest => do settle hooks ctx fuel (← arrive hooks ctx token { state with tokens := rest })
      | [], [] =>
        match state.scopes.find? (fun occurrence => occurrence.id != State.root && idle state occurrence.id) with
        | some occurrence => do settle hooks ctx fuel (← completeScope hooks ctx occurrence state)
        | none =>
          if idle state State.root then .ok { state.clearInside State.root with status := .completed }
          else .ok state

def startElement? (program : Program) (requested : Option ElementId) : Option (Header × StartPayload) :=
  let starts := program.elements.filterMap fun
    | .start header payload => if header.parent.isNone then some (header, payload) else none
    | .activity _ _ => none
    | .scope _ _ => none
    | .event _ _ => none
    | .gateway _ _ => none
  match requested with
  | some id => starts.find? (·.1.id == id)
  | none =>
    match starts.filter (·.2.subscription.isNone) with
    | [only] => some only
    | _ => none

def isUserTask : OpenKind → Bool
  | .userTask _ => true
  | .message _ => false
  | .timer _ => false
  | .effect _ => false
  | .incident _ => false
  | .evaluation _ => false

def isEffect : OpenKind → Bool
  | .userTask _ => false
  | .message _ => false
  | .timer _ => false
  | .effect _ => true
  | .incident _ => false
  | .evaluation _ => false

def isIncident : OpenKind → Bool
  | .userTask _ => false
  | .message _ => false
  | .timer _ => false
  | .effect _ => false
  | .incident _ => true
  | .evaluation _ => false

def isMessage : OpenKind → Bool
  | .userTask _ => false
  | .message _ => true
  | .timer _ => false
  | .effect _ => false
  | .incident _ => false
  | .evaluation _ => false

def isTimer : OpenKind → Bool
  | .userTask _ => false
  | .message _ => false
  | .timer _ => true
  | .effect _ => false
  | .incident _ => false
  | .evaluation _ => false

/-- The open item of a kind `accepts` with the public identity `occurrence`. -/
def item? (state : State) (occurrence : OccurrenceRef) (accepts : OpenKind → Bool) : Option OpenItem :=
  state.openItems.find? fun item =>
    item.element == occurrence.element && item.activation == occurrence.activation && accepts item.kind

/-- Run `onActivity` on the Activity an open item belongs to. -/
def atActivity (ctx : Ctx) (item : OpenItem) (onActivity : Header → ActivityPayload → Outcome) : Outcome :=
  let notActivity : Outcome := .error (.semanticFailure "activity-item-without-activity")
  match ctx.program.element? item.element with
  | some (.activity header payload) => onActivity header payload
  | some (.scope _ _) => notActivity
  | some (.event _ _) => notActivity
  | some (.gateway _ _) => notActivity
  | some (.start _ _) => notActivity
  | none => notActivity

def command (hooks : Hooks) (ctx : Ctx) (input : CommandInput) (state : State) : Outcome :=
  let incident (action : CommandAction) : Outcome :=
    match item? state input.occurrence isIncident with
    | none => .error (.rejected "unknown-incident")
    | some item => atActivity ctx item fun header payload =>
      hooks.resolveIncident ctx header payload item action state
  match input.action with
  | .completeUserTask values =>
    match item? state input.occurrence isUserTask with
    | none => .error (.rejected "unknown-user-task")
    | some item => atActivity ctx item fun header payload =>
      hooks.completeUserTask ctx header payload item values state
  | .retryIncident => incident .retryIncident
  | .cancelIncidentProcess => incident .cancelIncidentProcess

/-- A subscription an Activity opened goes back to its Activity; every other one to `Hooks.trigger`. -/
def fire (hooks : Hooks) (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match ctx.program.element? item.element with
  | some (.activity header payload) => hooks.triggerActivity ctx header payload item fired state
  | some (.scope _ _) => hooks.trigger ctx item fired state
  | some (.event _ _) => hooks.trigger ctx item fired state
  | some (.gateway _ _) => hooks.trigger ctx item fired state
  | some (.start _ _) => hooks.trigger ctx item fired state
  | none => hooks.trigger ctx item fired state

def effectResult (hooks : Hooks) (ctx : Ctx) (input : EffectInput) (state : State) : Outcome :=
  match item? state input.occurrence isEffect with
  | none => .error (.rejected "unknown-effect")
  | some item => atActivity ctx item fun header payload =>
    hooks.effectResult ctx header payload item input.outcome state

/-- Run an input's transition on a running instance, then settle. -/
def onRunning (hooks : Hooks) (ctx : Ctx) (before : Option State) (transition : State → Outcome) : Outcome :=
  match before with
  | none => .error (.rejected "instance-not-started")
  | some state =>
    if state.status != .running then .error (.rejected "instance-not-running")
    else do
      let next ← transition state
      settle hooks ctx closureBound next

/-- One input. `none` is the state before the instance starts; only a start applies to it. The root's Event
Sub-Process starts are armed before the start Event's tokens move. -/
def step (hooks : Hooks) (program : Program) (before : Option State) (input : Input) : Outcome :=
  let ctx : Ctx := { program, evaluate := hooks.evaluate, catches := hooks.catches, eventStart := hooks.eventStart }
  match input with
  | .start payload =>
    match before, startElement? program payload.startEvent with
    | some _, _ => .error (.rejected "instance-already-started")
    | none, none => .error (.rejected "no-start-event")
    | none, some (header, start) => do
      let initial := (State.initial payload.instanceId payload.variables).signal (.armScope State.root)
      settle hooks ctx closureBound (← hooks.startProcess ctx header start initial)
  | .command payload => onRunning hooks ctx before (command hooks ctx payload)
  | .deliver payload => onRunning hooks ctx before fun state =>
    match item? state payload.occurrence isMessage with
    | none => .error (.rejected "unknown-message-subscription")
    | some item => fire hooks ctx item (.message payload) state
  | .timerFire payload => onRunning hooks ctx before fun state =>
    match item? state payload.occurrence isTimer with
    | none => .error (.rejected "unknown-timer")
    | some item => fire hooks ctx item (.timer payload.logicalTimeMs) state
  | .effectResult payload => onRunning hooks ctx before (effectResult hooks ctx payload)
  | .evaluationResult _ => onRunning hooks ctx before fun _ => .error (.unsupported "evaluation-result")

end Kernel.Step
