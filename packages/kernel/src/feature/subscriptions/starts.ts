/**
 * Subscriptions: root start Events, transcribed from `Kernel/Feature/Subscriptions/Starts.lean`: which root start Events
 * a start input's trigger fires (`Hooks.startsFired`) and how a fired start leaves (`Hooks.arriveStart`). `step.ts` picks
 * the one start an input starts (`chooseStart`); `population.ts` starts every fired one.
 */
import {
  TriggerTag,
  assertNever,
  elementStart,
  programChildren,
  valueSourceLiteral,
  type ElementId,
  type Header,
  type StartPayload,
  type Subscription,
} from "../../il/types.js";
import {
  SignalAddressTag,
  StartTriggerTag,
  WriteRule,
  committed,
  completeSignal,
  failedWith,
  leaveOutgoing,
  messageChannelEquals,
  signal,
  signalAddressMatches,
  type Binding,
  type Occurrence,
  type Outcome,
  type Result,
  type StartInput,
  type StartTrigger,
  type State,
} from "../../state.js";
import { admitValues, messageTriggerChannel, type Ctx } from "../../hooks.js";
import { payloadBindings } from "../subscriptions.js";

/** Whether `trigger` fires a start with `subscription`. A none trigger names its start by identifier and consumes its trigger itself. */
function fires(trigger: StartTrigger, subscription: Subscription | null): boolean {
  if (trigger.tag === StartTriggerTag.None) return true;
  if (subscription === null) return false;
  const subscribed = subscription.trigger;
  switch (subscribed.tag) {
    case TriggerTag.Timer:
      return trigger.tag === StartTriggerTag.Timer;
    case TriggerTag.Message:
      return trigger.tag === StartTriggerTag.Message &&
        trigger.channel !== null && messageChannelEquals(messageTriggerChannel(subscribed.payload), trigger.channel);
    case TriggerTag.Signal: {
      const name = subscribed.payload.name === null ? null : valueSourceLiteral(subscribed.payload.name);
      return trigger.tag === StartTriggerTag.Signal && name !== null &&
        signalAddressMatches(trigger.address, { tag: SignalAddressTag.Named, name });
    }
    case TriggerTag.Condition:
      return trigger.tag === StartTriggerTag.Condition;
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return false;
  }
  return assertNever(subscribed);
}

/**
 * `Hooks.startsFired`: a named input's trigger fires every root start it matches, and its name must be among them; an
 * unnamed none trigger fires the sole none start, and nothing when there is none or several.
 */
export function startsFired(ctx: Ctx, input: StartInput): Result<readonly ElementId[]> {
  const starts = programChildren(ctx.program, null).flatMap((element) => {
    const start = elementStart(element);
    return start === null ? [] : [start];
  });
  const accepted = starts.filter(([, start]) => fires(input.trigger, start.subscription)).map(([header]) => header.id);
  if (input.startEvent !== null || input.trigger.tag !== StartTriggerTag.None) return committed(accepted);
  const [only, ...others] = starts.filter(([, start]) => start.subscription === null);
  return committed(only !== undefined && others.length === 0 ? [only[0].id] : []);
}

/**
 * `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
 * start was consumed by the input that names it.
 */
export function arriveStart(ctx: Ctx, _header: Header, payload: StartPayload, trigger: StartTrigger, occurrence: Occurrence, state: State): Outcome {
  const started = startValues(ctx, payload, trigger, state);
  if (!started.ok) return failedWith(started.failure);
  const [current, values] = started.value;
  return committed(signal(current, completeSignal(occurrence.id, leaveOutgoing, values, WriteRule.Outward)));
}

function startValues(ctx: Ctx, payload: StartPayload, trigger: StartTrigger, state: State): Result<readonly [State, readonly Binding[]]> {
  switch (trigger.tag) {
    case StartTriggerTag.Timer:
      return committed([{ ...state, logicalTimeMs: trigger.logicalTimeMs }, []]);
    case StartTriggerTag.Message: {
      if (trigger.payload === null || payload.subscription === null) return committed([state, []]);
      const admitted = admitValues([trigger.payload]);
      if (!admitted.ok) return failedWith(admitted.failure);
      const bound = payloadBindings(ctx, state.logicalTimeMs, payload.subscription.outputs, trigger.payload);
      return bound.ok ? committed([state, bound.value]) : failedWith(bound.failure);
    }
    case StartTriggerTag.Signal: {
      const admitted = admitValues(trigger.variables.map(([, value]) => value));
      return admitted.ok ? committed([state, trigger.variables]) : failedWith(admitted.failure);
    }
    case StartTriggerTag.None:
    case StartTriggerTag.Condition:
      return committed([state, []]);
  }
  return assertNever(trigger);
}
