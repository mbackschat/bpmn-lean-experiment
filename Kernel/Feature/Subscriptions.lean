module

public import Kernel.Hooks
public import Kernel.IL.Timer
public import Kernel.Feature.Subscriptions.Conditions

/-! # Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms

Owns matching on `Trigger`; `Kernel.Timer.resolve` owns resolving a `TimerSchedule`. A Timer, Message or Signal trigger
opens one item; the triggers that `Kernel.Feature.Propagation` delivers (Error, Escalation, Compensation, Cancel) open
nothing and are found through `catches`.

Firing rules: a Timer fires only at exactly its deadline, which becomes the logical time; a Message fires only on its
own channel, with a payload exactly when the subscription writes one and its correlation accepted; a Signal fires only
on its own address; either carries variables only where the profile installs them. Anything else is `rejected` and changes nothing.

A subscription's item holds a reservation (`State.openSubscription`) that its firing begins. A boundary item is
attached to its host occurrence; the arms of one Event-Based Gateway are attached to the gateway's occurrence. A
firing that ends other items (a gateway arm its siblings, an interrupting boundary its host's items, an interrupting
Event Sub-Process start its parent scope's) withdraws them in its own micro-step, though the completion or cancellation
that ends them is queued: several Conditional items can be true in one step, and a firing queued after this one must
find them closed (BPMN 2.0.2 §10.5.6: a gateway takes only its first event).
-/

public section

namespace Kernel.Feature.Subscriptions

/-- The Correlation rule a Message firing rechecks, which `Kernel.Registry` fills with
`Kernel.Feature.Correlation.correlationAccepts`, since features never import each other. -/
structure SubscriptionsHooks where
  correlationAccepts : Ctx → State → ScopeOccurrenceId → Trigger → List CorrelationMatch → Except Failure Bool :=
    fun _ _ _ _ _ => .error (.unsupported "subscriptions-correlation") -- dynamic-only: a registry without the hook

/-- Where a subscription is armed: what a Timer value given by an expression reads (`values`), what a Message name
given by an expression reads (`names`), and whether the subscription may fire again (`repeats`: a non-interrupting
boundary or Event Sub-Process start). CIB resolves a Message name when the subscription's scope execution is initialized
(`ExecutionEntity.java:409-413`), before the host's input mappings and a root's start variables, and a Timer value after
them (`PvmExecutionImpl.java:278-292`, `:1304-1318`). -/
structure Arming where
  values : EvalContext
  names : EvalContext := values
  repeats : Bool := false

/-- A Message name, an expression's resolved once when the subscription opens (PC-MESSAGE-01). The channel addresses the
subscription; the name is kept for an engine-wide publication under `MessageNames.addresses` (CIB-LIM-0022). CIB casts
the value to a String (`EventSubscriptionDeclaration.java:172-184`): a failure or another type rolls the arming back,
and `null` or `""` opens a subscription no name reaches, which the kernel does not claim. -/
def resolveName (ctx : Ctx) (context : EvalContext) : Option ValueSource → Except Failure (Option String)
  | none => .ok none
  | some (.literal text) => .ok (some text)
  | some (.expression body) =>
    match ctx.evaluate context body with
    -- dynamic-only: the resolved name is the run's data.
    | .value (.string "") | .value .null => .error (.unsupported "message-name-empty")
    | .value (.string text) => .ok (some text)
    | .value _ => .error (.rolledBack "message-name-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)

/-- The address a Signal subscription opens with (PC-SIGNAL-02): its `signalRef` under `SignalNames.identifier`, else
its name (CIB-INT-0028), an expression's resolved once when the subscription opens (CIB-EXT-0041). CIB casts the value to
a String as it does a Message name (`EventSubscriptionDeclaration.java:172-184`): a failure or another type rolls the
arming back, and `null` or `""` opens a subscription the kernel does not claim. -/
def signalAddress (ctx : Ctx) (context : EvalContext) (trigger : SignalTrigger) : Except Failure SignalAddress :=
  match ctx.program.options.signalNames, trigger.signalRef, trigger.name with
  | .identifier, some ref, _ => .ok (.qualified ref)
  | .addresses, _, some (.literal text) => .ok (.named text)
  | .addresses, _, some (.expression body) =>
    match ctx.evaluate context body with
    -- dynamic-only: the resolved name is the run's data.
    | .value (.string "") | .value .null => .error (.unsupported "signal-name-empty")
    | .value (.string text) => .ok (.named text)
    | .value _ => .error (.rolledBack "signal-name-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)
  -- Admission refuses both (`signal.unspecified`, `signal.unnamed`).
  | .identifier, none, _ => .error (.unsupported "signal-unspecified")
  | .addresses, _, none => .error (.unsupported "signal-unnamed")

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
    let name ← resolveName ctx arming.names trigger.name
    let channel := trigger.channel
    -- Admission refuses it (`message.correlation.keys`).
    if trigger.correlation.length > 1 then throw (.unsupported "message-correlation-keys")
    pure (some (.message { channel, payload := !subscription.outputs.isEmpty, criteria := trigger.correlation.map (·.key),
                           name := if ctx.program.options.messageNames == .addresses then name else none }))
  | .signal trigger => do pure (some (.signal { address := ← signalAddress ctx arming.names trigger }))
  | .condition trigger =>
    .ok (some (.conditional { variableName := trigger.variableName, variableEvents := trigger.variableEvents }))
  | .error _ => .ok none
  | .escalation _ => .ok none
  | .compensation => .ok none
  | .cancel => .ok none

/-- Open a subscription's item and evaluate it once if Conditional; the item comes back when that evaluation fired it. -/
def subscribe (ctx : Ctx) (arming : Arming) (state : State) (subscription : Subscription) (element : ElementId)
    (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool) : Except Failure (State × Option OpenItem) := do
  match ← waitKind ctx arming subscription with
  | none => pure (state, none)
  | some kind =>
    let (state, item) := state.openSubscription kind element scope host passive
    let (state, fired) ← armed ctx subscription item state
    pure (state, if fired then some item else none)

/-- Subscribe each of one arming's subscriptions in order, then fire what its contests resolve to (`resolveContests`). -/
def subscribeAll {α : Type} (ctx : Ctx) (state : State) (entries : List α)
    (each : State → α → Except Failure (State × Option OpenItem)) : Outcome := do
  let (state, fired) ← entries.foldlM (fun (state, fired) entry => do
    let (state, item) ← each state entry
    pure (state, fired ++ item.toList)) (state, [])
  pure (fireAll none (← resolveContests ctx state [] fired) state)

/-- `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. -/
def arm (ctx : Ctx) (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  match (ctx.program.element? element).bind (·.envelope?) with
  | none => .error (.semanticFailure "arm-without-envelope")
  | some envelope =>
    subscribeAll ctx state envelope.boundaries fun state boundary =>
      let arming : Arming :=
        { values := state.evalContext ctx.program (state.ownScope host scope), names := state.evalContext ctx.program scope
          repeats := !boundary.interrupting }
      subscribe ctx arming state boundary.subscription boundary.id scope (some host) false

/-- `Signal.armGateway`: open one subscription per arm, the catch Events the gateway's outgoing flows reach, attached
to the gateway's occurrence. A Receive Task arm would need the work feature's wait and is refused
(`gateway.eventBased.receiveArm` at admission). -/
def armGateway (ctx : Ctx) (occurrence : Nat) (gateway : ElementId) (scope : ScopeOccurrenceId) (state : State) :
    Outcome :=
  match (ctx.program.element? gateway).bind (·.gateway?) with
  | none => .error (.semanticFailure "arm-gateway-without-gateway")
  | some (_, payload) =>
    subscribeAll ctx state payload.outgoing fun state flow =>
      let arm := (ctx.program.target? flow).bind ctx.program.element? |>.bind fun target =>
        target.event?.bind fun (header, event) => event.catch?.map (header.id, ·)
      match arm with
      | some (element, subscription) =>
        subscribe ctx { values := state.evalContext ctx.program scope } state subscription element scope (some occurrence) false
      | none => .error (.unsupported "gateway-event-based-receive-arm")

/-- What the variables visible from `scope`'s parent read, without `scope`'s own: none at a root or a called root,
whose start or call variables CIB sets after it subscribes (`PvmExecutionImpl.java:278-286`). -/
def enclosingContext (program : Program) (state : State) (scope : ScopeOccurrenceId) : EvalContext :=
  let parent := if state.calledRoot scope then none else (state.scopes.find? (·.id == scope)).bind (·.parent)
  { variables := (parent.map (state.visible program)).getD [], nowMs := state.logicalTimeMs }

/-- The start Event of an Event Sub-Process. -/
def startEvent? (ctx : Ctx) (eventSubProcess : ElementId) : Option ElementId :=
  (ctx.program.children (some eventSubProcess)).findSome? fun child => child.start?.map (·.1.id)

/-- `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence
(`State.childrenOf`: a called root's are its called process's) as passive items on their start Events. A start that opens no item needs no start Event: a Compensation Event
Sub-Process's trigger is carried by its `ScopeKind`. -/
def armScope (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  subscribeAll ctx state (state.childrenOf ctx.program scope) fun state child =>
    match child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map (header.id, ·) with
    | none => .ok (state, none)
    | some (eventSubProcess, subscription, interrupting) => do
      let arming := { values := state.evalContext ctx.program scope, names := enclosingContext ctx.program state scope, repeats := !interrupting }
      match startEvent? ctx eventSubProcess, ← waitKind ctx arming subscription with
      | some start, _ => subscribe ctx arming state subscription start scope none true
      | none, none => .ok (state, none)
      | none, some _ => .error (.semanticFailure "event-subprocess-without-start")

/-! ## Root start triggers -/

/-- The address a root Signal start subscribes to: its Signal's QName under `SignalNames.identifier` (BPMN 2.0.2
Table 10.100), its name under `addresses`, which admission holds literal at a root start (`start.signalNameExpression`). -/
def startAddress (options : ProfileOptions) (trigger : SignalTrigger) : Option SignalAddress :=
  match options.signalNames with
  | .identifier => trigger.signalRef.map .qualified
  | .addresses => (trigger.name.bind ValueSource.literal?).map .named

/-- Whether a Conditional root start holds for `input`: evaluated over the submitted variables alone, in a fresh
instance's root scope, as CIB evaluates it in a temporary execution (`DefaultConditionHandler.java:121-134`); a
`variableName` the input does not submit makes it false, and the predicate reads as every Conditional one does. -/
def conditionHolds (ctx : Ctx) (input : StartInput) (trigger : ConditionTrigger) : Except Failure Bool :=
  if trigger.variableName.any fun name => !input.variables.any (·.1 == name) then .ok false
  else
    let submitted := { State.initial input.instanceId input.variables input.businessKey with
      logicalTimeMs := input.atMs.getD 0 }
    predicateHolds ctx submitted State.root trigger.condition

/-- Whether `input`'s trigger fires a start with `subscription` (`Kernel.Feature.Starts`, through `StartsHooks.fires`). A none trigger names its start by identifier and
consumes its trigger itself. -/
def fires (ctx : Ctx) (input : StartInput) (subscription : Option Subscription) : Except Failure Bool :=
  match input.trigger, (subscription.map (·.trigger) : Option Trigger) with
  | .none, _ => .ok true
  | _, none => .ok false
  | .timer _, some (.timer _) => .ok true
  | .message channel _, some (.message subscribed) => .ok (subscribed.channel == channel)
  | .signal address _, some (.signal subscribed) =>
    .ok ((startAddress ctx.program.options subscribed).any address.matches)
  | .condition, some (.condition trigger) => conditionHolds ctx input trigger
  | _, some (.timer _) | _, some (.message _) | _, some (.signal _) | _, some (.condition _) | _, some (.error _)
  | _, some (.escalation _) | _, some .compensation | _, some .cancel => .ok false

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

/-- The address a delivery names, when it delivers a Signal. -/
def signalDelivered : DeliveryTrigger → Option SignalAddress
  | .signal address _ => some address
  | .message _ => none

/-- What a Signal's variables install in the receiving scope: under `SignalPayload.variables` all of them, as CIB's
`setVariables` on the receiving execution does (CIB-EXT-0043, `EventHandlerImpl.java:56-58`); under `none` a Signal
carries no data (BPMN 2.0.2 §10.5.1), so a delivery that brings variables is rejected rather than dropped. -/
def signalVariables (ctx : Ctx) (variables : List (String × Value)) : Except Failure (List (String × Value)) :=
  match ctx.program.options.signalPayload with
  | .variables => do admitValues (variables.map (·.2)); pure variables
  | .none => if variables.isEmpty then .ok [] else .error (.rejected "signal-variables-not-admitted")

/-- Check that `fired` may fire `item` and return the state at the firing's logical time with the values the
subscription writes. A Message delivery's correlation must be accepted (`SubscriptionsHooks.correlationAccepts`); the
target rechecks it rather than trusting the population's selection (specification, global command). Its own variables
follow the mapped outputs, as CIB's `setVariables` follows the payload (CIB-EXT-0025); `delivered` admits them only
under `DeliveryVariables.installs`. -/
def admitFiring (hooks : SubscriptionsHooks) (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (fired : Fired)
    (state : State) : Except Failure (State × List (String × Value)) :=
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
        let correlated ← hooks.correlationAccepts ctx state item.scope subscription.trigger delivery.correlation
        if !correlated then .error (.rejected "message-correlation-mismatch")
        else
          let mapped ← match view.payload, delivery.payload with
            | true, some payload => payloadBindings ctx state.logicalTimeMs subscription.outputs payload
            | true, none => .error (.rejected "message-payload-required")
            | false, some _ => .error (.rejected "message-payload-not-accepted")
            | false, none => .ok []
          admitValues (delivery.variables.map (·.2))
          .ok (state, mapped ++ delivery.variables)
  | .signal delivery =>
    match view.signal, signalDelivered delivery.trigger with
    | some detail, some address =>
      if !address.matches detail.address then .error (.rejected "unknown-signal-subscription")
      else if delivery.payload.isSome then .error (.rejected "signal-payload-not-accepted")
      else (state, ·) <$> signalVariables ctx delivery.variables
    | some _, none | none, _ => .error (.rejected "not-a-signal-subscription")
  -- Only `Conditions.fireAll` fires a Conditional item, once its predicate held and its contest is resolved.
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
def fireBoundary (hooks : SubscriptionsHooks) (ctx : Ctx) (boundary : Boundary) (item : OpenItem) (fired : Fired) (state : State) : Outcome := do
  let (state, values) ← admitFiring hooks ctx boundary.subscription item fired state
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
def fireCatch (hooks : SubscriptionsHooks) (ctx : Ctx) (subscription : Subscription) (item : OpenItem) (fired : Fired) (state : State) : Outcome := do
  let (state, values) ← admitFiring hooks ctx subscription item fired state
  let state := state.closeItem item.id
  let state := match item.attachedTo with
    | some gateway => (state.disarm gateway).signal (.complete gateway (.flows []) [] .outward)
    | none => state
  .ok (state.signal (.complete item.occurrence .outgoing values .outward))

/-- An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as `afterFiring`
says. The scopes feature starts the occurrence, which begins the start Event with the reservation, if any. -/
def fireEventStart (hooks : SubscriptionsHooks) (ctx : Ctx) (eventSubProcess : ElementId) (item : OpenItem) (fired : Fired) (state : State) :
    Outcome := do
  let start := (ctx.program.element? eventSubProcess).bind (·.scope?) |>.bind fun (_, payload) => ctx.eventStart payload
  match start with
  | none => .error (.semanticFailure "event-start-without-event-subprocess")
  | some (subscription, interrupting) =>
    let (state, values) ← admitFiring hooks ctx subscription item fired state
    let (state, inner) :=
      if interrupting then ((state.closeItem item.id).withdrawInside item.scope, some item.occurrence)
      else afterFiring state item
    .ok (state.signal (.begin { element := eventSubProcess, scope := item.scope, locals := values, inner }))

/-- `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. -/
def trigger (hooks : SubscriptionsHooks) (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match ctx.program.boundary? item.element with
  | some (_, boundary) => fireBoundary hooks ctx boundary item fired state
  | none =>
    let element := ctx.program.element? item.element
    let catchEvent := element.bind (·.event?) |>.bind fun (_, event) => event.catch?
    let eventStart := element.bind (·.start?) |>.bind fun (header, _) => header.parent
    match catchEvent, eventStart with
    | some subscription, _ => fireCatch hooks ctx subscription item fired state
    | none, some eventSubProcess => fireEventStart hooks ctx eventSubProcess item fired state
    | none, none => .error (.semanticFailure "trigger-without-subscription")

/-- `Hooks.arriveCatch`: the catch Event's occurrence waits on its subscription. -/
def arriveCatch (ctx : Ctx) (_ : Header) (_ : EventPayload) (subscription : Subscription) (occurrence : Occurrence)
    (state : State) : Outcome := do
  match ← waitKind ctx { values := state.evalContext ctx.program occurrence.scope } subscription with
  | some kind =>
    let state := state.openItem kind occurrence
    match state.openItems.getLast? with
    | some item => do
      let (state, fires) ← armed ctx subscription item state
      pure (if fires then fireAll none [item] state else state)
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
