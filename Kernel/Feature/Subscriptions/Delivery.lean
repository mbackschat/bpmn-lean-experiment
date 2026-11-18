module

public import Kernel.Hooks

/-! # Subscriptions: deliveries

Which open item a `deliver` input fires (`Hooks.delivered`): the Message subscription or Signal catch its occurrence
names, once the delivery's own rules admit it. `Kernel.Step` fires the item; this module only finds it, and owns what a
delivered payload and a Signal's variables write once `Kernel.Feature.Subscriptions.admitFiring` admits the firing.
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
  ctx.requireMappings { variables := outputsRead, nowMs, bounds := ctx.program.options.bounds } outputs

/-- The address a delivery names, when it delivers a Signal. -/
def signalDelivered : DeliveryTrigger → Option SignalAddress
  | .signal address _ => some address
  | .message _ => none

/-- What a Signal's variables install in the receiving scope: under `SignalPayload.variables` all of them, as CIB's
`setVariables` on the receiving execution does (CIB-EXT-0043, `EventHandlerImpl.java:56-58`); under `none` a Signal
carries no data (BPMN 2.0.2 §10.5.1), so a delivery that brings variables is rejected rather than dropped. -/
def signalVariables (ctx : Ctx) (variables : List (String × Value)) : Except Failure (List (String × Value)) :=
  match ctx.program.options.signalPayload with
  | .variables => do admitValues ctx.program.options.bounds (variables.map (·.2)); pure variables
  | .none => if variables.isEmpty then .ok [] else .error (.rejected "signal-variables-not-admitted")

end Kernel.Feature.Subscriptions
