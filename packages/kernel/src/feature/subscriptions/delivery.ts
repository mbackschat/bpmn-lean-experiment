/**
 * Subscriptions: deliveries, transcribed from `Kernel/Feature/Subscriptions/Delivery.lean`: which open item a `deliver`
 * input fires (`Hooks.delivered`), the Message subscription or Signal catch its occurrence names, once the delivery's
 * own rules admit it. `step.ts` fires the item; this module only finds it.
 */
import { DeliveryVariables, SignalDelivery, assertNever } from "../../il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  FiredTag,
  SignalReach,
  committed,
  failed,
  type DeliveryInput,
  type Fired,
  type OpenItem,
  type Result,
  type State,
} from "../../state.js";
import { itemOf, type Ctx } from "../../hooks.js";

/**
 * The open item `data` fires and its firing, or why the delivery is refused. A Message carries variables only under
 * `DeliveryVariables.Installs` (CIB-EXT-0025) and a Signal only to a receiver of a broadcast; a targeted Signal needs
 * `occurrenceTargeted`.
 */
export function delivered(ctx: Ctx, data: DeliveryInput, state: State): Result<readonly [OpenItem, Fired]> {
  const carries = data.trigger.tag === DeliveryTriggerTag.Message
    ? ctx.program.options.deliveryVariables === DeliveryVariables.Installs
    : data.trigger.reach === SignalReach.Broadcast;
  if (data.variables.length > 0 && !carries) {
    return failed(FailureTag.Rejected, "delivery-variables-not-admitted");
  }
  switch (data.trigger.tag) {
    case DeliveryTriggerTag.Message: {
      const item = itemOf(ctx, state, data.occurrence, (view) => view.channel);
      return item === null
        ? failed(FailureTag.Rejected, "unknown-message-subscription")
        : committed([item, { tag: FiredTag.Message, delivery: data }] as const);
    }
    // Table 10.88 only broadcasts a Signal: one its caller targets needs `occurrenceTargeted` (CIB-EXT-0042).
    case DeliveryTriggerTag.Signal: {
      const targeted = data.trigger.reach === SignalReach.Targeted;
      if (targeted && ctx.program.options.signalDelivery === SignalDelivery.BroadcastOnly) {
        return failed(FailureTag.Rejected, "signal-delivery-targeted");
      }
      const item = itemOf(ctx, state, data.occurrence, (view) => view.signal);
      return item === null
        ? failed(FailureTag.Rejected, "unknown-signal-subscription")
        : committed([item, { tag: FiredTag.Signal, delivery: data }] as const);
    }
  }
  return assertNever(data.trigger);
}
