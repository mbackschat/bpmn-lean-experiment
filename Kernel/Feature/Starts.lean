module

public import Kernel.Hooks

/-! # Starts: root start Events

A sub-feature of its own: which root start Events a start input's trigger fires (`Hooks.startsFired`) and how a fired
start leaves (`Hooks.arriveStart`). Whether a trigger fires one start, which matches on `Trigger`, and a Message
payload's bindings are `Kernel.Feature.Subscriptions`' rules, reached through `StartsHooks`. `Kernel.Step` picks the one
start an input starts (`chooseStart`); `Kernel.Population` starts every fired one, each its own unit of commitment.
-/

public section

namespace Kernel.Feature.Starts

/-- The Subscriptions rules a start shares, which `Kernel.Registry` fills, since features never import each other:
`fires` is `Kernel.Feature.Subscriptions.fires`, `payloadBindings` `Kernel.Feature.Subscriptions.payloadBindings`. -/
structure StartsHooks where
  fires : Ctx → StartInput → Option Subscription → Except Failure Bool :=
    fun _ _ _ => .error (.unsupported "starts-fires") -- dynamic-only: a registry without the hook
  payloadBindings : Ctx → Nat → List Mapping → Value → Except Failure (List (String × Value)) :=
    fun _ _ _ _ => .error (.unsupported "starts-payload") -- dynamic-only: a registry without the hook

/-- `Hooks.startsFired`: the root starts `input`'s trigger fires, in document order. A named input considers only the
start it names, so no other start's predicate is evaluated for it: each start is its own unit of commitment
(docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations). An unnamed none trigger fires the
sole none start, and nothing when there is none or several. -/
def startsFired (hooks : StartsHooks) (ctx : Ctx) (input : StartInput) : Except Failure (List ElementId) :=
  let starts : List (Header × StartPayload) := (ctx.program.children none).filterMap Element.start?
  match input.startEvent, input.trigger with
  | some named, _ =>
    (starts.filter (·.1.id == named)).filterMapM fun (header, start) => do
      pure (if ← hooks.fires ctx input start.subscription then some header.id else none)
  | none, .none =>
    match starts.filter (·.2.subscription.isNone) with
    | [only] => .ok [only.1.id]
    | _ => .ok []
  | none, _ =>
    starts.filterMapM fun (header, start) => do
      pure (if ← hooks.fires ctx input start.subscription then some header.id else none)

/-- What a Message start writes: the catch rule of a payload (account P1), so a start with outputs requires a payload
and one without accepts none (`SUBSCRIPTIONS-SEMANTICS-SPEC.md` Messages, Payload). -/
def startPayload (hooks : StartsHooks) (ctx : Ctx) (nowMs : Nat) (subscription : Subscription) (delivered : Option Value) :
    Except Failure (List (String × Value)) := do
  admitValues delivered.toList
  match subscription.outputs.isEmpty, delivered with
  | false, some payload => hooks.payloadBindings ctx nowMs subscription.outputs payload
  | false, none => .error (.rejected "message-payload-required")
  | true, some _ => .error (.rejected "message-payload-not-accepted")
  | true, none => .ok []

/-- `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
start was consumed by the input that names it. A Signal start's variables are its start values only under
`SignalPayload.variables`; under `none` a Signal carries no data (BPMN 2.0.2 §10.5.1), so variables are rejected. -/
def arriveStart (hooks : StartsHooks) (ctx : Ctx) (_ : Header) (payload : StartPayload) (trigger : StartTrigger) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let (state, values) ← match trigger, payload.subscription with
    | .timer at_, _ => .ok ({ state with logicalTimeMs := at_ }, [])
    | .message _ delivered, some subscription => do
      .ok (state, ← startPayload hooks ctx state.logicalTimeMs subscription delivered)
    | .signal _ variables, _ => do
      if ctx.program.options.signalPayload == .none && !variables.isEmpty then
        throw (.rejected "signal-variables-not-admitted")
      admitValues (variables.map (·.2))
      .ok (state, variables)
    | .none, _ | .condition, _ | .message _ _, none => .ok (state, [])
  .ok (state.signal (.complete occurrence.id .outgoing values .outward))

end Kernel.Feature.Starts
