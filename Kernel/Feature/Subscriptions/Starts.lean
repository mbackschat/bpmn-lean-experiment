module

public import Kernel.Feature.Subscriptions

/-! # Subscriptions: root start Events

Which root start Events a start input's trigger fires (`Hooks.startsFired`) and how a fired start leaves
(`Hooks.arriveStart`). `Kernel.Step` picks the one start an input starts (`chooseStart`); `Kernel.Population` starts
every fired one.
-/

public section

namespace Kernel.Feature.Subscriptions

/-- Whether `trigger` fires a start with `subscription`. A none trigger names its start by identifier and consumes its
trigger itself. -/
def fires (trigger : StartTrigger) (subscription : Option Subscription) : Bool :=
  match trigger, (subscription.map (·.trigger) : Option Trigger) with
  | .none, _ => true
  | _, none => false
  | .timer _, some (.timer _) => true
  | .message channel _, some (.message subscribed) => subscribed.channel == channel
  | .signal address _, some (.signal subscribed) =>
    (subscribed.name.bind ValueSource.literal?).any fun name => address.matches (.named name)
  | .condition, some (.condition _) => true
  | _, some (.timer _) | _, some (.message _) | _, some (.signal _) | _, some (.condition _) | _, some (.error _)
  | _, some (.escalation _) | _, some .compensation | _, some .cancel => false

/-- `Hooks.startsFired`: a named input's trigger fires every root start it matches, and its name must be among them; an
unnamed none trigger fires the sole none start, and nothing when there is none or several. -/
def startsFired (ctx : Ctx) (input : StartInput) : Except Failure (List ElementId) :=
  let starts : List (Header × StartPayload) := (ctx.program.children none).filterMap Element.start?
  let accepted := (starts.filter fun (_, start) => fires input.trigger start.subscription).map (·.1.id)
  match input.startEvent, input.trigger with
  | some _, _ => .ok accepted
  | none, .none =>
    match starts.filter (·.2.subscription.isNone) with
    | [only] => .ok [only.1.id]
    | _ => .ok []
  | none, _ => .ok accepted

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

end Kernel.Feature.Subscriptions
