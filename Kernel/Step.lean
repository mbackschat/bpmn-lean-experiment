module

public import Kernel.Hooks

/-! # Step

The single step function. It owns dispatch on element kind, event role, input kind and open-item kind, and the
order in which hooks run: an input's own transition first, then the closure that routes every token, oldest
first, to the element at the end of its flow, until no token is left. A closure that does not settle within
`closureBound` steps is `unsupported`, never silently truncated.
-/

public section

namespace Kernel.Step

def Element.header : Element → Header
  | .activity header _ => header
  | .scope header _ => header
  | .event header _ => header
  | .gateway header _ => header
  | .start header _ => header

def element? (program : Program) (id : ElementId) : Option Element :=
  program.elements.find? (fun element => (Element.header element).id == id)

def target? (program : Program) (flow : FlowId) : Option ElementId :=
  (program.flows.find? (·.id == flow)).map (·.target)

/-- Route one token to the element its flow targets. -/
def arrive (hooks : Hooks) (ctx : Ctx) (token : Token) (state : State) : Outcome :=
  let arrival : Arrival := { flow := token.flow, scope := token.scope }
  match (target? ctx.program token.flow).bind (element? ctx.program) with
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

/-- The instance completes when its root scope holds neither a token nor an open item. -/
def finish (state : State) : State :=
  if state.tokens.isEmpty && state.openItems.isEmpty then { state with status := .completed } else state

def closureBound : Nat := 100000

def settle (hooks : Hooks) (ctx : Ctx) : Nat → State → Outcome
  | 0, _ => .error (.unsupported "closure-bound")
  | fuel + 1, state =>
    match state.tokens with
    | [] => .ok (finish state)
    | token :: rest => do
      let next ← arrive hooks ctx token { state with tokens := rest }
      settle hooks ctx fuel next

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

def userTask? (state : State) (occurrence : OccurrenceRef) : Option OpenItem :=
  state.openItems.find? fun item =>
    item.element == occurrence.element && item.activation == occurrence.activation &&
      match item.kind with
      | .userTask _ => true
      | .receive => false
      | .timer => false
      | .subscription => false
      | .effect => false
      | .incident => false
      | .evaluation => false

def command (hooks : Hooks) (ctx : Ctx) (input : CommandInput) (state : State) : Outcome :=
  match input.action with
  | .completeUserTask values =>
    match userTask? state input.occurrence with
    | none => .error (.rejected "unknown-user-task")
    | some item =>
      let notActivity : Outcome := .error (.semanticFailure "user-task-without-activity")
      match element? ctx.program item.element with
      | some (.activity header payload) => hooks.completeUserTask ctx header payload item values state
      | some (.scope _ _) => notActivity
      | some (.event _ _) => notActivity
      | some (.gateway _ _) => notActivity
      | some (.start _ _) => notActivity
      | none => notActivity

/-- Run an input's transition on a running instance, then settle. -/
def onRunning (hooks : Hooks) (ctx : Ctx) (before : Option State) (transition : State → Outcome) : Outcome :=
  match before with
  | none => .error (.rejected "instance-not-started")
  | some state =>
    if state.status != .running then .error (.rejected "instance-not-running")
    else do
      let next ← transition state
      settle hooks ctx closureBound next

/-- One input. `none` is the state before the instance starts; only a start applies to it. -/
def step (hooks : Hooks) (program : Program) (before : Option State) (input : Input) : Outcome :=
  let ctx : Ctx := { program, evaluate := hooks.evaluate }
  match input with
  | .start payload =>
    match before, startElement? program payload.startEvent with
    | some _, _ => .error (.rejected "instance-already-started")
    | none, none => .error (.rejected "no-start-event")
    | none, some (header, start) => do
      let started ← hooks.startProcess ctx header start (State.initial payload.instanceId payload.variables)
      settle hooks ctx closureBound started
  | .command payload => onRunning hooks ctx before (command hooks ctx payload)
  | .deliver _ => onRunning hooks ctx before fun _ => .error (.unsupported "delivery")
  | .timerFire _ => onRunning hooks ctx before fun _ => .error (.unsupported "timer-firing")
  | .effectResult _ => onRunning hooks ctx before fun _ => .error (.unsupported "effect-result")
  | .evaluationResult _ => onRunning hooks ctx before fun _ => .error (.unsupported "evaluation-result")

end Kernel.Step
