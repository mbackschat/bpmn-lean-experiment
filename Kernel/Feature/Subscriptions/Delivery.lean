module

public import Kernel.Hooks

/-! # Subscriptions: deliveries

Which open item a `deliver` input fires (`Hooks.delivered`): the Message subscription or Signal catch its occurrence
names, once the delivery's own rules admit it. `Kernel.Step` fires the item; this module only finds it.
-/

public section

namespace Kernel.Feature.Subscriptions

/-- The open item `data` fires and its firing, or why the delivery is refused. A Message carries variables only under
`DeliveryVariables.installs` (CIB-EXT-0025) and a Signal only to a receiver of a broadcast; a targeted Signal needs
`occurrenceTargeted`. -/
def delivered (ctx : Ctx) (data : DeliveryInput) (state : State) : Except Failure (OpenItem × Fired) :=
  let carries := match data.trigger with
    | .message _ => ctx.program.options.deliveryVariables == .installs
    | .signal _ reach => reach == .broadcast
  if !data.variables.isEmpty && !carries then .error (.rejected "delivery-variables-not-admitted") else
  match data.trigger with
  | .message _ =>
    match item? ctx state data.occurrence (·.channel) with
    | none => .error (.rejected "unknown-message-subscription")
    | some item => .ok (item, .message data)
  -- Table 10.88 only broadcasts a Signal: one its caller targets needs `occurrenceTargeted` (CIB-EXT-0042).
  | .signal _ reach =>
    if reach == .targeted && ctx.program.options.signalDelivery == .broadcastOnly then
      .error (.rejected "signal-delivery-targeted") else
    match item? ctx state data.occurrence (·.signal) with
    | none => .error (.rejected "unknown-signal-subscription")
    | some item => .ok (item, .signal data)

end Kernel.Feature.Subscriptions
