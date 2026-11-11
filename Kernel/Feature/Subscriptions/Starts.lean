module

public import Kernel.Feature.Subscriptions

/-! # Subscriptions: root start Events

Which root start Events a start input's trigger fires (`Hooks.startsFired`) and how a fired start leaves
(`Hooks.arriveStart`). `Kernel.Step` picks the one start an input starts (`chooseStart`); `Kernel.Population` starts
every fired one, each its own unit of commitment.
-/

public section

namespace Kernel.Feature.Subscriptions

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

/-- Whether `input`'s trigger fires a start with `subscription`. A none trigger names its start by identifier and
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

/-- `Hooks.startsFired`: the root starts `input`'s trigger fires, in document order. A named input considers only the
start it names, so no other start's predicate is evaluated for it: each start is its own unit of commitment
(population contract, per-receiver commitment). An unnamed none trigger fires the sole none start, and nothing when
there is none or several. -/
def startsFired (ctx : Ctx) (input : StartInput) : Except Failure (List ElementId) :=
  let starts : List (Header × StartPayload) := (ctx.program.children none).filterMap Element.start?
  match input.startEvent, input.trigger with
  | some named, _ =>
    (starts.filter (·.1.id == named)).filterMapM fun (header, start) => do
      pure (if ← fires ctx input start.subscription then some header.id else none)
  | none, .none =>
    match starts.filter (·.2.subscription.isNone) with
    | [only] => .ok [only.1.id]
    | _ => .ok []
  | none, _ =>
    starts.filterMapM fun (header, start) => do
      pure (if ← fires ctx input start.subscription then some header.id else none)

/-- What a Message start writes: the catch rule of a payload (account P1), so a start with outputs requires a payload
and one without accepts none (`SUBSCRIPTIONS-SEMANTICS-SPEC.md` Messages, Payload). -/
def startPayload (ctx : Ctx) (nowMs : Nat) (subscription : Subscription) (delivered : Option Value) :
    Except Failure (List (String × Value)) := do
  admitValues delivered.toList
  match subscription.outputs.isEmpty, delivered with
  | false, some payload => payloadBindings ctx nowMs subscription.outputs payload
  | false, none => .error (.rejected "message-payload-required")
  | true, some _ => .error (.rejected "message-payload-not-accepted")
  | true, none => .ok []

/-- `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
start was consumed by the input that names it. A Signal start's variables are its start values only under
`SignalPayload.variables`; under `none` a Signal carries no data (BPMN 2.0.2 §10.5.1), so variables are rejected. -/
def arriveStart (ctx : Ctx) (_ : Header) (payload : StartPayload) (trigger : StartTrigger) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let (state, values) ← match trigger, payload.subscription with
    | .timer at_, _ => .ok ({ state with logicalTimeMs := at_ }, [])
    | .message _ delivered, some subscription => do
      .ok (state, ← startPayload ctx state.logicalTimeMs subscription delivered)
    | .signal _ variables, _ => do
      if ctx.program.options.signalPayload == .none && !variables.isEmpty then
        throw (.rejected "signal-variables-not-admitted")
      admitValues (variables.map (·.2))
      .ok (state, variables)
    | .none, _ | .condition, _ | .message _ _, none => .ok (state, [])
  .ok (state.signal (.complete occurrence.id .outgoing values .outward))

end Kernel.Feature.Subscriptions
