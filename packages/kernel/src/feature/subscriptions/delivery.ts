/**
 * Subscriptions: deliveries, transcribed from `Kernel/Feature/Subscriptions/Delivery.lean`: which open item a `deliver`
 * input fires (`Hooks.delivered`), the Message subscription or Signal catch its occurrence names, once the delivery's
 * own rules admit it. `step.ts` fires the item; this module only finds it, and owns what a delivered payload and a
 * Signal's variables write once `feature/subscriptions.ts#admitFiring` admits the firing.
 */
import {
  DeliveryVariables, ExpressionTag, SignalDelivery, SignalPayload, assertNever, type Mapping, type Value,
} from "../../il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  FiredTag,
  SignalReach,
  committed,
  failed,
  failedWith,
  type Binding,
  type DeliveryInput,
  type DeliveryTrigger,
  type Fired,
  type OpenItem,
  type Result,
  type SignalAddress,
  type State,
} from "../../state.js";
import { admitValues, ctxRequireMappings, itemOf, type Ctx } from "../../hooks.js";

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

/** Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. */
export function payloadBindings(ctx: Ctx, nowMs: number, outputs: readonly Mapping[], payload: Value): Result<readonly Binding[]> {
  const outputsRead = outputs.flatMap((mapping): Binding[] => {
    const source = mapping.source;
    switch (source.tag) {
      case ExpressionTag.Variable:
        return [[source.name, payload]];
      case ExpressionTag.Literal:
      case ExpressionTag.SimpleBoolean:
      case ExpressionTag.Juel:
      case ExpressionTag.Foreign:
        return [];
    }
    return assertNever(source);
  });
  return ctxRequireMappings(ctx, { variables: outputsRead, nowMs, bounds: ctx.program.options.bounds }, outputs);
}

/** The address a delivery names, when it delivers a Signal. */
export function signalDelivered(trigger: DeliveryTrigger): SignalAddress | null {
  switch (trigger.tag) {
    case DeliveryTriggerTag.Signal:
      return trigger.address;
    case DeliveryTriggerTag.Message:
      return null;
  }
  return assertNever(trigger);
}

/**
 * What a Signal's variables install in the receiving scope: under `SignalPayload.Variables` all of them, as CIB's
 * `setVariables` on the receiving execution does (CIB-EXT-0043, `EventHandlerImpl.java:56-58`); under `None` a Signal
 * carries no data (BPMN 2.0.2 §10.5.1), so a delivery that brings variables is rejected rather than dropped.
 */
export function signalVariables(ctx: Ctx, variables: readonly Binding[]): Result<readonly Binding[]> {
  switch (ctx.program.options.signalPayload) {
    case SignalPayload.Variables: {
      const admitted = admitValues(ctx.program.options.bounds, variables.map(([, value]) => value));
      return admitted.ok ? committed(variables) : failedWith(admitted.failure);
    }
    case SignalPayload.None:
      return variables.length === 0 ? committed([]) : failed(FailureTag.Rejected, "signal-variables-not-admitted");
  }
  return assertNever(ctx.program.options.signalPayload);
}
