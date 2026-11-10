module

public import Kernel.Hooks
public import Kernel.IL.Timer
public import Kernel.Feature.Subscriptions.Conditions

/-! # Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms

Owns matching on `Trigger`; `Kernel.Timer.resolve` owns resolving a `TimerSchedule`. A Timer or Message trigger
opens one item; the triggers that `Kernel.Feature.Propagation` delivers (Error, Escalation, Compensation, Cancel) open
nothing and are found through `catches`.

Firing rules: a Timer fires only at exactly its deadline, which becomes the logical time; a Message fires only on its
own channel, with a payload exactly when the subscription writes one. Anything else is `rejected` and changes nothing.

A subscription's item holds a reservation (`State.openSubscription`) that its firing begins. A boundary item is
attached to its host occurrence; the arms of one Event-Based Gateway are attached to the gateway's occurrence. A
firing that ends other items (a gateway arm its siblings, an interrupting boundary its host's items, an interrupting
Event Sub-Process start its parent scope's) withdraws them in its own micro-step, though the completion or cancellation
that ends them is queued: several Conditional items can be true in one step, and a firing queued after this one must
find them closed (BPMN 2.0.2 §10.5.6: a gateway takes only its first event).
-/

public section

namespace Kernel.Feature.Subscriptions

/-- Where a subscription is armed: what a Timer value given by an expression reads (`values`), what a Message name
given by an expression reads (`names`), and whether the subscription may fire again (`repeats`: a non-interrupting
boundary or Event Sub-Process start). CIB resolves a Message name when the subscription's scope execution is initialized
(`ExecutionEntity.java:409-413`), before the host's input mappings and a root's start variables, and a Timer value after
them (`PvmExecutionImpl.java:278-292`, `:1304-1318`). -/
structure Arming where
  values : EvalContext
  names : EvalContext := values
  repeats : Bool := false

/-- A Message name given by an expression, resolved once when the subscription opens; it is not kept, since the channel
addresses the subscription (PC-MESSAGE-01). CIB casts the value to a String (`EventSubscriptionDeclaration.java:172-184`):
a failure or another type rolls the arming back, and `null` or `""` opens a subscription no name reaches, which the
kernel does not claim. -/
def resolveName (ctx : Ctx) (context : EvalContext) : Option ValueSource → Except Failure Unit
  | none | some (.literal _) => .ok ()
  | some (.expression body) =>
    match ctx.evaluate context body with
    -- dynamic-only: the resolved name is the run's data.
    | .value (.string "") | .value .null => .error (.unsupported "message-name-empty")
    | .value (.string _) => .ok ()
    | .value _ => .error (.rolledBack "message-name-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)

/-- The text a Timer value holds when it is armed: a literal's, or an expression's String value, evaluated once
(`TimerDeclarationImpl.java:109-153`, PC-TIMER-03). A failure or a value that is no String is CIB's
`ProcessEngineException` at arming, which rolls back the input that reached it; `true` marks an evaluated value. -/
def timerText (ctx : Ctx) (context : EvalContext) : ValueSource → Except Failure (String × Bool)
  | .literal text => .ok (text, false)
  | .expression body =>
    match ctx.evaluate context body with
    | .value (.string text) => .ok (text, true)
    -- dynamic-only: a value's type is the run's data.
    | .value _ => .error (.rolledBack "timer-value-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)

/-- A Timer armed at `context.nowMs`, classified by the one Timer lexeme rule (`Kernel.Timer.classify`), the dialect
of a cycle read from its text as CIB reads it (`CycleBusinessCalendar.java:55`). A lexeme outside the subset is
`unsupported`, statically refused when it is a literal; a malformed one rolls back an evaluated value always and a
literal under `MalformedTimer.rollsBackArming`. A site that fires once keeps only the first occurrence. -/
def timerDetail (ctx : Ctx) (arming : Arming) (trigger : TimerTrigger) : Except Failure TimerDetail := do
  let (kind, value) : Timer.Kind × ValueSource := match trigger.schedule with
    | .duration value => (.duration, value)
    | .date value => (.date, value)
    | .cycle value _ => (.cycle, value)
  let (text, evaluated) ← timerText ctx arming.values value
  match Timer.classify kind text with
  | .admitted parsed =>
    match Timer.armAt arming.values.nowMs parsed with
    | some armed =>
      .ok { deadlineMs := armed.deadlineMs, recurrence := if arming.repeats then armed.recurrence.map fun recurrence =>
        { periodMs := recurrence.periodMs, cron := recurrence.cron, remaining := recurrence.remaining } else none }
    -- dynamic-only: the deadline depends on the arming instant.
    | none => .error (.unsupported "timer-deadline")
  | .outside code => .error (.unsupported code.dynamic)
  | .malformed code =>
    if evaluated || ctx.program.options.malformedTimer == .rollsBackArming then .error (.rolledBack code.dynamic)
    else .error (.unsupported code.dynamic)

/-- The item a subscription opens, or `none` for a trigger that propagation delivers. -/
def waitKind (ctx : Ctx) (arming : Arming) (subscription : Subscription) : Except Failure (Option OpenKind) :=
  match subscription.trigger with
  | .timer trigger => (some ∘ OpenKind.timer) <$> timerDetail ctx arming trigger
  | .message trigger => do
    resolveName ctx arming.names trigger.name
    let channel := trigger.channel
    -- Admission refuses it (`message.correlation.keys`).
    if trigger.correlation.length > 1 then throw (.unsupported "message-correlation-keys")
    pure (some (.message { channel, payload := !subscription.outputs.isEmpty, criteria := trigger.correlation.map (·.key) }))
  -- Admission refuses both (`event.catch.signal`, `boundary.signal`, `start.signal` and their conditional counterparts).
  | .signal _ => .error (.unsupported "event-catch-signal")
  | .condition trigger =>
    .ok (some (.conditional { variableName := trigger.variableName, variableEvents := trigger.variableEvents }))
  | .error _ => .ok none
  | .escalation _ => .ok none
  | .compensation => .ok none
  | .cancel => .ok none

def subscribe (ctx : Ctx) (arming : Arming) (state : State) (subscription : Subscription) (element : ElementId)
    (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool) : Outcome := do
  match ← waitKind ctx arming subscription with
  | none => pure state
  | some kind =>
    let (state, item) := state.openSubscription kind element scope host passive
    armed ctx subscription item state

/-- `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. -/
def arm (ctx : Ctx) (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  match (ctx.program.element? element).bind (·.envelope?) with
  | none => .error (.semanticFailure "arm-without-envelope")
  | some envelope =>
    envelope.boundaries.foldlM (fun state boundary =>
      let arming : Arming :=
        { values := state.evalContext (state.ownScope host scope), names := state.evalContext scope
          repeats := !boundary.interrupting }
      subscribe ctx arming state boundary.subscription boundary.id scope (some host) false) state

/-- `Signal.armGateway`: open one subscription per arm, the catch Events the gateway's outgoing flows reach, attached
to the gateway's occurrence. A Receive Task arm would need the work feature's wait and is refused
(`gateway.eventBased.receiveArm` at admission). -/
def armGateway (ctx : Ctx) (occurrence : Nat) (gateway : ElementId) (scope : ScopeOccurrenceId) (state : State) :
    Outcome :=
  match (ctx.program.element? gateway).bind (·.gateway?) with
  | none => .error (.semanticFailure "arm-gateway-without-gateway")
  | some (_, payload) =>
    payload.outgoing.foldlM (fun state flow =>
      let arm := (ctx.program.target? flow).bind ctx.program.element? |>.bind fun target =>
        target.event?.bind fun (header, event) => event.catch?.map (header.id, ·)
      match arm with
      | some (element, subscription) =>
        subscribe ctx { values := state.evalContext scope } state subscription element scope (some occurrence) false
      | none => .error (.unsupported "gateway-event-based-receive-arm")) state

/-- What the variables visible from `scope`'s parent read, without `scope`'s own: none at a root or a called root,
whose start or call variables CIB sets after it subscribes (`PvmExecutionImpl.java:278-286`). -/
def enclosingContext (state : State) (scope : ScopeOccurrenceId) : EvalContext :=
  let parent := if state.calledRoot scope then none else (state.scopes.find? (·.id == scope)).bind (·.parent)
  { variables := (parent.map state.visible).getD [], nowMs := state.logicalTimeMs }

/-- The start Event of an Event Sub-Process. -/
def startEvent? (ctx : Ctx) (eventSubProcess : ElementId) : Option ElementId :=
  (ctx.program.children (some eventSubProcess)).findSome? fun child => child.start?.map (·.1.id)

/-- `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence
(`State.childrenOf`: a called root's are its called process's) as passive items on their start Events. A start that opens no item needs no start Event: a Compensation Event
Sub-Process's trigger is carried by its `ScopeKind`. -/
def armScope (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  (state.childrenOf ctx.program scope).foldlM (fun state child =>
    match child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map (header.id, ·) with
    | none => .ok state
    | some (eventSubProcess, subscription, interrupting) => do
      let arming := { values := state.evalContext scope, names := enclosingContext state scope, repeats := !interrupting }
      match startEvent? ctx eventSubProcess, ← waitKind ctx arming subscription with
      | some start, _ => subscribe ctx arming state subscription start scope none true
      | none, none => .ok state
      | none, some _ => .error (.semanticFailure "event-subprocess-without-start")) state

/-! ## Firing -/

/-- Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. -/
def payloadBindings (ctx : Ctx) (nowMs : Nat) (outputs : List Mapping) (payload : Value) :
    Except Failure (List (String × Value)) :=
  let outputsRead := outputs.filterMap fun mapping =>
    match mapping.source with
    | .variable name => some (name, payload)
    | .literal _ => none
    | .simpleBoolean _ => none
    | .juel _ => none
    | .foreign _ _ => none
  ctx.requireMappings { variables := outputsRead, nowMs } outputs

/-! ## Correlation

Message key correlation as the [specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) bounds it: a
criterion names one correlation key and the expression its single property's value is bound to in the subscription's
scope; the delivered value is the Message payload's. Both must be non-empty Strings, compared by exact equality
([exact subset](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)), and the
criterion is evaluated when a delivery is matched, never when the subscription opens, so the current Property value
decides. -/

def criteria (trigger : Trigger) : List CorrelationCriterion :=
  (trigger.message?.map (·.correlation)).getD []

/-- The key a criterion binds, evaluated in `variables`. -/
def keyValue (ctx : Ctx) (context : EvalContext) (criterion : CorrelationCriterion) :
    Except Failure String :=
  match ctx.evaluate context criterion.value with
  -- dynamic-only: a key's value is the run's data.
  | .value (.string key) => if key.isEmpty then .error (.unsupported "correlation-key-empty") else .ok key
  -- dynamic-only: a key's value type is the run's data.
  | .value _ => .error (.unsupported "correlation-key-type")
  | .failure code => .error (.semanticFailure code)
  | .unsupported code => .error (.unsupported code)

/-- Whether the delivered `correlation` names exactly the criteria's keys, in order, each with the String its criterion
binds. A modeled key matches as `.processVariable`; the other targets are `O.messageCorrelation = apiCriteria`, which
admission refuses, so no delivery with such a target reaches a correlated wait of an admitted program. -/
def correlationMatches (ctx : Ctx) (context : EvalContext) (bound : List CorrelationCriterion)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  if bound.length != correlation.length then .ok false
  else (bound.zip correlation).allM fun (criterion, delivered) => do
    let expected ← keyValue ctx context criterion
    match delivered.target with
    | .processVariable key =>
      pure (criterion.key == key && match delivered.expected with
        | .string value => value == expected
        | _ => false)
    | .localVariable _ => .error (.unsupported "profile-message-correlation-api-criteria")
    | .businessKey => .error (.unsupported "profile-message-correlation-api-criteria")
    | .processInstance => .error (.unsupported "profile-message-correlation-api-criteria")

/-- `Hooks.correlates`. -/
def correlates (ctx : Ctx) (item : OpenItem) (channel : MessageChannel) (correlation : List CorrelationMatch)
    (state : State) : Except Failure Bool :=
  match item.kind.view.channel, (subscription? ctx item).map (criteria ·.trigger) with
  | some channel', some bound@(_ :: _) =>
    if channel' != channel then .ok false
    else correlationMatches ctx (state.evalContext item.scope) bound correlation
  | some _, some [] => .ok false
  | some _, none => .ok false
  | none, _ => .ok false

/-- Check that `fired` may fire `item` and return the state at the firing's logical time with the values the
subscription writes. A Message delivery must carry exactly the subscription's correlation, none for an uncorrelated
one; the target rechecks it rather than trusting the population's selection (specification, global command). -/
def admitFiring (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (fired : Fired) (state : State) :
    Except Failure (State × List (String × Value)) :=
  let view := item.kind.view
  match fired with
  | .timer at_ =>
    match view.deadlineMs with
    | some deadlineMs =>
      if at_ == deadlineMs && deadlineMs ≤ state.logicalTimeMs then .ok (state, [])
      else .error (.rejected "timer-not-due")
    | none => .error (.rejected "not-a-timer")
  | .message delivery => do
    admitValues delivery.payload.toList
    match view.channel with
    | none => .error (.rejected "not-a-message-subscription")
    | some channel =>
      if delivery.trigger.channel? != some channel then .error (.rejected "message-channel-mismatch")
      else do
        let correlated ← correlationMatches ctx (state.evalContext item.scope) (criteria subscription.trigger)
          delivery.correlation
        if !correlated then .error (.rejected "message-correlation-mismatch")
        else
          match view.payload, delivery.payload with
          | true, some payload => do .ok (state, ← payloadBindings ctx state.logicalTimeMs subscription.outputs payload)
          | true, none => .error (.rejected "message-payload-required")
          | false, some _ => .error (.rejected "message-payload-not-accepted")
          | false, none => .ok (state, [])
  -- Dynamic-only: admission refuses every Signal subscription (`event.catch.signal`, `boundary.signal`,
  -- `start.signal`), so none is open to fire.
  | .signal _ => .error (.unsupported "event-catch-signal")
  -- Only `evaluateItem` fires a Conditional item, after its predicate held.
  | .condition _ => if view.conditional.isSome then .ok (state, []) else .error (.rejected "not-a-conditional-subscription")

/-- What remains of a fired subscription that does not interrupt: a Message subscription stays open with the same
identity, a cycle Timer opens its next occurrence (`Timer.successor`: one period, or the next Cron match, after the
deadline it fired at, never after the firing's own time) keeping its attachment, until its count is spent, and any
other Timer closes. The result is the reservation the firing may begin, `none` when the item stays open, whose
identity then remains the subscription's. -/
def afterFiring (state : State) (item : OpenItem) : State × Option Nat :=
  let view := item.kind.view
  match view.deadlineMs, view.recurrence with
  | some deadlineMs, some recurrence =>
    let closed := state.closeItem item.id
    match Timer.successor deadlineMs
        { periodMs := recurrence.periodMs, cron := recurrence.cron, remaining := recurrence.remaining } with
    | none => (closed, some item.occurrence)
    | some (next, followed) =>
      let (state, _) := closed.openSubscription
        (.timer { deadlineMs := next, recurrence := some { recurrence with remaining := followed.remaining } })
        item.element item.scope item.attachedTo item.passive
      (state, some item.occurrence)
  | some _, none => (state.closeItem item.id, some item.occurrence)
  | none, _ => (state, none)

/-- A boundary fired: an interrupting one cancels its host, a non-interrupting one leaves it running; either way the
boundary's occurrence begins and leaves on its flows in the host's scope (BPMN 2.0.2 §13.5.3, §10.5.6). -/
def fireBoundary (ctx : Ctx) (boundary : Boundary) (item : OpenItem) (fired : Fired) (state : State) : Outcome := do
  let (state, values) ← admitFiring ctx boundary.subscription item fired state
  if boundary.interrupting then
    match item.attachedTo with
    | none => .error (.semanticFailure "boundary-without-host")
    | some host =>
      if (state.occurrence? host).isNone then .error (.semanticFailure "boundary-host-gone")
      else
        .ok (boundary.fire (some host) (some item.occurrence) item.scope values
          ((state.closeItem item.id).withdrawOccurrence host))
  else
    let (state, reserved) := afterFiring state item
    .ok (boundary.fire none reserved item.scope values state)

/-- A catch Event fired; an Event-Based Gateway arm also completes its gateway, which disarms the other arms. -/
def fireCatch (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (fired : Fired) (state : State) : Outcome := do
  let (state, values) ← admitFiring ctx subscription item fired state
  let state := state.closeItem item.id
  let state := match item.attachedTo with
    | some gateway => (state.disarm gateway).signal (.complete gateway (.flows []) [] .outward)
    | none => state
  .ok (state.signal (.complete item.occurrence .outgoing values .outward))

/-- An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as `afterFiring`
says. The scopes feature starts the occurrence, which begins the start Event with the reservation, if any. -/
def fireEventStart (ctx : Ctx) (eventSubProcess : ElementId) (item : OpenItem) (fired : Fired) (state : State) :
    Outcome := do
  let start := (ctx.program.element? eventSubProcess).bind (·.scope?) |>.bind fun (_, payload) => ctx.eventStart payload
  match start with
  | none => .error (.semanticFailure "event-start-without-event-subprocess")
  | some (subscription, interrupting) =>
    let (state, values) ← admitFiring ctx subscription item fired state
    let (state, inner) :=
      if interrupting then ((state.closeItem item.id).withdrawInside item.scope, some item.occurrence)
      else afterFiring state item
    .ok (state.signal (.begin { element := eventSubProcess, scope := item.scope, locals := values, inner }))

/-- `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. -/
def trigger (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match ctx.program.boundary? item.element with
  | some (_, boundary) => fireBoundary ctx boundary item fired state
  | none =>
    let element := ctx.program.element? item.element
    let catchEvent := element.bind (·.event?) |>.bind fun (_, event) => event.catch?
    let eventStart := element.bind (·.start?) |>.bind fun (header, _) => header.parent
    match catchEvent, eventStart with
    | some subscription, _ => fireCatch ctx subscription item fired state
    | none, some eventSubProcess => fireEventStart ctx eventSubProcess item fired state
    | none, none => .error (.semanticFailure "trigger-without-subscription")

/-! ## Starts -/

/-- Whether `trigger` fires a start with `subscription`. A none trigger names its start by identifier and consumes its
trigger itself. -/
def fires (trigger : StartTrigger) (subscription : Option Subscription) : Bool :=
  match trigger, (subscription.map (·.trigger) : Option Trigger) with
  | .none, _ => true
  | _, none => false
  | .timer _, some (.timer _) => true
  | .message channel _, some (.message subscribed) => subscribed.channel == channel
  | .signal name _, some (.signal subscribed) => ValueSource.literal? subscribed.name == some name
  | .condition, some (.condition _) => true
  | _, some (.timer _) | _, some (.message _) | _, some (.signal _) | _, some (.condition _) | _, some (.error _)
  | _, some (.escalation _) | _, some .compensation | _, some .cancel => false

/-- `Hooks.selectStart`: the named start if the trigger fires it, else the one start the trigger fires, and the sole none
start for a none trigger. -/
def selectStart (ctx : Ctx) (named : Option ElementId) (trigger : StartTrigger) : Option ElementId :=
  let starts : List (Header × StartPayload) := (ctx.program.children none).filterMap Element.start?
  let accepted := starts.filter fun (_, start) => fires trigger start.subscription
  match named, trigger with
  | some id, _ => (accepted.find? (·.1.id == id)).map (·.1.id)
  | none, .none =>
    match starts.filter (·.2.subscription.isNone) with
    | [only] => some only.1.id
    | _ => none
  | none, _ =>
    match accepted with
    | [only] => some only.1.id
    | _ => none

/-- `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
start was consumed by the input that names it. -/
def arriveStart (ctx : Ctx) (_ : Header) (payload : StartPayload) (trigger : StartTrigger) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let (state, values) ← match trigger, payload.subscription with
    | .timer at_, _ => .ok ({ state with logicalTimeMs := at_ }, [])
    | .message _ (some delivered), some subscription => do
      admitValues [delivered]
      .ok (state, ← payloadBindings ctx state.logicalTimeMs subscription.outputs delivered)
    | .signal _ variables, _ => do
      admitValues (variables.map (·.2))
      .ok (state, variables)
    | .none, _ | .condition, _ | .message _ none, _ | .message _ (some _), none => .ok (state, [])
  .ok (state.signal (.complete occurrence.id .outgoing values .outward))

/-- `Hooks.arriveCatch`: the catch Event's occurrence waits on its subscription. -/
def arriveCatch (ctx : Ctx) (_ : Header) (_ : EventPayload) (subscription : Subscription) (occurrence : Occurrence)
    (state : State) : Outcome := do
  match ← waitKind ctx { values := state.evalContext occurrence.scope } subscription with
  | some kind =>
    let state := state.openItem kind occurrence
    match state.openItems.getLast? with
    | some item => armed ctx subscription item state
    | none => .ok state
  -- Admission refuses every trigger reaching here (`event.catch.error`, `.escalation`, `.compensation`, `.cancel`); the
  -- code names the first.
  | none => .error (.unsupported "event-catch-error")

/-- `Hooks.leave`: a completing occurrence's attached items go. -/
def leave (_ : Ctx) (occurrence : Occurrence) (state : State) : Outcome :=
  .ok (state.disarm occurrence.id)

/-! ## Catching raised events -/

def errorFacts? : Raised → Option (String × Option String)
  | .error code message => some (code, message)
  | .escalation _ => none
  | .cancel => none

def escalationCode? : Raised → Option String
  | .escalation code => some code
  | .error _ _ => none
  | .cancel => none

/-- An exact code catches at precedence 0, a catch-all (no code) at 1: at one catching level an exact code precedes a
catch-all (CIB `ErrorEventDefinition#getPrecedence`, CIB-INT-0010; Table 10.88 lets both catch). -/
def codePrecedence (catcher : Option String) (code : String) : Option Nat :=
  match catcher with
  | some expected => if expected == code then some 0 else none
  | none => some 1

/-- A catch variable's write, when the catcher names one. -/
def caughtVariable (name : Option String) (value : Value) : List (String × Value) :=
  name.toList.map (·, value)

/-- `Ctx.catches`: how `trigger` catches `raised`, lower rank first, and what the catch writes (`camunda:errorCodeVariable`
and its siblings). -/
def catches (raised : Raised) (trigger : Trigger) : Option Catch :=
  match trigger with
  | .error catcher => do
    let (code, message) ← errorFacts? raised
    let rank ← codePrecedence catcher.code code
    pure { rank, writes := caughtVariable catcher.codeVariable (.string code) ++
      caughtVariable catcher.messageVariable (match message with | some text => .string text | none => .null) }
  | .escalation catcher => do
    let code ← escalationCode? raised
    let rank ← codePrecedence catcher.code code
    pure { rank, writes := caughtVariable catcher.codeVariable (.string code) }
  | .cancel => if raised.isCancel then some { rank := 0 } else none
  | .signal _ => none
  | .compensation => none
  | .timer _ => none
  | .message _ => none
  | .condition _ => none

end Kernel.Feature.Subscriptions
