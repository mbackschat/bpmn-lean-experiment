module

public import Kernel.Hooks
public import Kernel.IL.Timer

/-! # Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms

Owns matching on `Trigger` and `TimerSchedule`. A Timer or Message trigger opens one item; the triggers that
`Kernel.Feature.Propagation` delivers (Error, Escalation, Compensation, Cancel) open nothing and are found through
`catches`.

Firing rules, as the frozen evaluator applies them (`packages/semantic-core/src/semantic-command-admission.ts`):
a Timer fires only at exactly its deadline, which becomes the logical time; a Message fires only on its own channel,
with a payload exactly when the subscription writes one. Anything else is `rejected` and changes nothing.

Item grouping: a boundary item is attached to its host (`State.openAttached`); the arms of one Event-Based Gateway
activation are attached to one freshly issued group number, so firing an arm disarms its siblings without reading
the gateway.
-/

public section

namespace Kernel.Feature.Subscriptions

def literal? : ValueSource → Option String
  | .literal value => some value
  | .expression _ => none

def channel (trigger : MessageTrigger) : Except Failure MessageChannel :=
  let address (messageId : Option String) : MessageChannel :=
    { messageId, interfaceRef := trigger.interfaceRef, operationRef := trigger.operationRef }
  match trigger.name with
  | none => .ok (address none)
  | some (.literal name) => .ok (address (some name))
  | some (.expression _) => .error (.unsupported "message-name-expression")

/-- A Timer armed at `now`. A cycle's first deadline is one period after arming (`Kernel.IL.Timer`). -/
def timerDetail (now : Nat) (trigger : TimerTrigger) : Except Failure TimerDetail :=
  match trigger.schedule with
  | .duration value =>
    match (literal? value).bind Timer.durationMs? with
    | some ms => .ok { deadlineMs := now + ms }
    | none => .error (.unsupported "timer-duration")
  | .date _ => .error (.unsupported "timer-date")
  | .cycle value dialect =>
    match dialect, (literal? value).bind Timer.cyclePeriodMs? with
    | .iso8601, some ms => .ok { deadlineMs := now + ms, period := some ms }
    | .iso8601, none => .error (.unsupported "timer-cycle")
    | .cron, _ => .error (.unsupported "timer-cron")

/-- The item a subscription opens, or `none` for a trigger that propagation delivers. -/
def waitKind (now : Nat) (subscription : Subscription) : Except Failure (Option OpenKind) :=
  match subscription.trigger with
  | .timer trigger => (some ∘ OpenKind.timer) <$> timerDetail now trigger
  | .message trigger => do
    let channel ← channel trigger
    pure (some (.message { channel, payload := !subscription.outputs.isEmpty }))
  | .signal _ => .error (.unsupported "signal-subscription")
  | .condition _ => .error (.unsupported "conditional-subscription")
  | .error _ => .ok none
  | .escalation _ => .ok none
  | .compensation => .ok none
  | .cancel => .ok none

def markPassive (state : State) (id : Nat) : State :=
  { state with openItems := state.openItems.map fun item => if item.id == id then { item with passive := true } else item }

def subscribe (state : State) (subscription : Subscription) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) : Except Failure State := do
  match ← waitKind state.logicalTimeMs subscription with
  | none => pure state
  | some kind =>
    let (state, id) := state.openAttached kind element scope host
    pure (if passive then markPassive state id else state)

/-- `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. -/
def arm (ctx : Ctx) (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  match (ctx.program.element? element).bind (·.envelope?) with
  | none => .error (.semanticFailure "arm-without-envelope")
  | some envelope =>
    envelope.boundaries.foldlM (fun state boundary =>
      subscribe state boundary.subscription boundary.id scope (some host) false) state

/-- `Signal.armGateway`: open one subscription per arm, the catch Events the gateway's outgoing flows reach. A
Receive Task arm would need the work feature's wait and is refused. -/
def armGateway (ctx : Ctx) (gateway : ElementId) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  match (ctx.program.element? gateway).bind (·.gateway?) with
  | none => .error (.semanticFailure "arm-gateway-without-gateway")
  | some (_, payload) =>
    let (state, group) := state.issue
    payload.outgoing.foldlM (fun state flow =>
      let arm := (ctx.program.target? flow).bind ctx.program.element? |>.bind fun target =>
        target.event?.bind fun (header, event) => event.catch?.map (header.id, ·)
      match arm with
      | some (element, subscription) => subscribe state subscription element scope (some group) false
      | none => .error (.unsupported "event-based-gateway-arm")) state

/-- The start Event of an Event Sub-Process. -/
def startEvent? (ctx : Ctx) (eventSubProcess : ElementId) : Option ElementId :=
  (ctx.program.children (some eventSubProcess)).findSome? fun child => child.start?.map (·.1.id)

/-- `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence's
element as passive items on their start Events. -/
def armScope (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  let element := (state.scopes.find? (·.id == scope)).bind (·.element)
  (ctx.program.children element).foldlM (fun state child =>
    match child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map (header.id, ·) with
    | none => .ok state
    | some (eventSubProcess, subscription, _) =>
      match startEvent? ctx eventSubProcess with
      | some start => subscribe state subscription start scope none true
      | none => .error (.semanticFailure "event-subprocess-without-start")) state

/-! ## Firing -/

/-- Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. -/
def payloadBindings (ctx : Ctx) (outputs : List Mapping) (payload : Value) :
    Except Failure (List (String × Value)) :=
  let outputsRead := outputs.filterMap fun mapping =>
    match mapping.source with
    | .variable name => some (name, payload)
    | .literal _ => none
    | .simpleBoolean _ => none
    | .foreign _ _ => none
  ctx.evaluateMappings outputsRead outputs

/-- Check that `fired` may fire `item` and return the state at the firing's logical time with the values the
subscription writes. -/
def admitFiring (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (fired : Fired) (state : State) :
    Except Failure (State × List (String × Value)) :=
  match fired with
  | .timer at_ =>
    match item.kind.timer? with
    | some detail =>
      if at_ == detail.deadlineMs then .ok ({ state with logicalTimeMs := at_ }, [])
      else .error (.rejected "timer-not-due")
    | none => .error (.rejected "not-a-timer")
  | .message delivery =>
    match item.kind.message? with
    | none => .error (.rejected "not-a-message-subscription")
    | some wait =>
      if delivery.channel != wait.channel then .error (.rejected "message-channel-mismatch")
      else
        match wait.payload, delivery.payload with
        | true, some payload => do .ok (state, ← payloadBindings ctx subscription.outputs payload)
        | true, none => .error (.rejected "message-payload-required")
        | false, some _ => .error (.rejected "message-payload-not-accepted")
        | false, none => .ok (state, [])

/-- What remains of a fired subscription that does not interrupt: a Message subscription stays open with the
same identity, a cycle Timer opens its next occurrence one period after the deadline it fired at, keeping its
attachment, and any other Timer closes (`semantic-process-recurring-boundary-timer-runtime.ts`; the
subscription-boundary-message-repeat baseline keeps the Message subscription at activation 1). -/
def afterFiring (state : State) (item : OpenItem) : State :=
  match item.kind.timer? with
  | some { deadlineMs, period := some period } =>
    let (state, id) := (state.closeItem item.id).openAttached
      (.timer { deadlineMs := deadlineMs + period, period := some period }) item.element item.scope item.attachedTo
    if item.passive then markPassive state id else state
  | some { period := none, .. } => state.closeItem item.id
  | none => state

def writeAll (state : State) (scope : ScopeOccurrenceId) (values : List (String × Value)) : State :=
  values.foldl (fun state (name, value) => state.write scope name value) state

/-- Cancel the host of an interrupting boundary: the host's own item, or the host scope occurrence. -/
def cancelHost (state : State) (host : Nat) : Except Failure State :=
  if state.openItems.any (·.id == host) then .ok ((state.closeItem host).disarm host)
  else if state.scopes.any (·.id.value == host) then .ok ((state.leaveScope ⟨host⟩).disarm host)
  else .error (.semanticFailure "boundary-host-gone")

/-- A boundary fired: an interrupting one cancels its host, a non-interrupting one leaves it running; either way
the token leaves on the boundary's flows in the host's scope (BPMN 2.0.2 §10.5.4). -/
def fireBoundary (ctx : Ctx) (boundary : Boundary) (item : OpenItem) (fired : Fired) (state : State) : Outcome := do
  let (state, values) ← admitFiring ctx boundary.subscription item fired state
  let state := writeAll state item.scope values
  if boundary.interrupting then
    match item.attachedTo with
    | none => .error (.semanticFailure "boundary-without-host")
    | some host => .ok ((← cancelHost state host).emit boundary.outgoing item.scope)
  else .ok ((afterFiring state item).emit boundary.outgoing item.scope)

/-- A catch Event fired; an Event-Based Gateway arm also disarms its siblings. -/
def fireCatch (ctx : Ctx) (event : EventPayload) (subscription : Subscription) (item : OpenItem) (fired : Fired)
    (state : State) : Outcome := do
  let (state, values) ← admitFiring ctx subscription item fired state
  let closed := state.closeItem item.id
  let closed := match item.attachedTo with
    | some group => closed.disarm group
    | none => closed
  .ok ((writeAll closed item.scope values).emit event.outgoing item.scope)

/-- An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as
`afterFiring` says. The scopes feature starts the occurrence. -/
def fireEventStart (ctx : Ctx) (eventSubProcess : ElementId) (item : OpenItem) (fired : Fired) (state : State) :
    Outcome := do
  let start := (ctx.program.element? eventSubProcess).bind (·.scope?) |>.bind fun (_, payload) => ctx.eventStart payload
  match start with
  | none => .error (.semanticFailure "event-start-without-event-subprocess")
  | some (subscription, interrupting) =>
    let (state, values) ← admitFiring ctx subscription item fired state
    let state :=
      if interrupting then state.closeItem item.id else afterFiring state item
    .ok (state.signal (.startEventSubProcess eventSubProcess item.scope values))

/-- `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. -/
def trigger (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match ctx.program.boundary? item.element with
  | some (_, boundary) => fireBoundary ctx boundary item fired state
  | none =>
    let element := ctx.program.element? item.element
    let catchEvent := element.bind (·.event?) |>.bind fun (_, event) => event.catch?.map (event, ·)
    let eventStart := element.bind (·.start?) |>.bind fun (header, _) => header.parent
    match catchEvent, eventStart with
    | some (event, subscription), _ => fireCatch ctx event subscription item fired state
    | none, some eventSubProcess => fireEventStart ctx eventSubProcess item fired state
    | none, none => .error (.semanticFailure "trigger-without-subscription")

/-- `Hooks.arriveCatch`: open the catch Event's subscription in the token's scope. -/
def arriveCatch (_ : Ctx) (header : Header) (_ : EventPayload) (subscription : Subscription) (arrival : Arrival)
    (state : State) : Outcome := do
  match ← waitKind state.logicalTimeMs subscription with
  | some kind => .ok (state.openItem kind header.id arrival.scope)
  | none => .error (.unsupported "catch-event-trigger")

/-! ## Catching raised events -/

def errorCode? : Raised → Option String
  | .error code _ => some code
  | .escalation _ => none
  | .signal _ => none
  | .compensation _ _ => none
  | .cancel => none

def escalationCode? : Raised → Option String
  | .escalation code => some code
  | .error _ _ => none
  | .signal _ => none
  | .compensation _ _ => none
  | .cancel => none

def signalName? : Raised → Option String
  | .signal name => some name
  | .error _ _ => none
  | .escalation _ => none
  | .compensation _ _ => none
  | .cancel => none

def isCompensation : Raised → Bool
  | .compensation _ _ => true
  | .error _ _ => false
  | .escalation _ => false
  | .signal _ => false
  | .cancel => false

def isCancel : Raised → Bool
  | .cancel => true
  | .error _ _ => false
  | .escalation _ => false
  | .signal _ => false
  | .compensation _ _ => false

/-- An exact code catches at precedence 0, a catch-all (no code) at 1 (BPMN 2.0.2 §10.5.4: a catch with a code is
preferred over one without). -/
def codePrecedence (catcher : Option String) (code : String) : Option Nat :=
  match catcher with
  | some expected => if expected == code then some 0 else none
  | none => some 1

/-- `Ctx.catches`: the precedence with which `trigger` catches `raised`, lower first. -/
def catches (raised : Raised) (trigger : Trigger) : Option Nat :=
  match trigger with
  | .error catcher => (errorCode? raised).bind (codePrecedence catcher.code)
  | .escalation catcher => (escalationCode? raised).bind (codePrecedence catcher.code)
  | .signal catcher =>
    (signalName? raised).bind fun name => if literal? catcher.name == some name then some 0 else none
  | .compensation => if isCompensation raised then some 0 else none
  | .cancel => if isCancel raised then some 0 else none
  | .timer _ => none
  | .message _ => none
  | .condition _ => none

end Kernel.Feature.Subscriptions
