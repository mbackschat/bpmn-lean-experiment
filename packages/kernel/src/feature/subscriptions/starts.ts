/**
 * Subscriptions: root start Events, transcribed from `Kernel/Feature/Subscriptions/Starts.lean`: which root start Events
 * a start input's trigger fires (`Hooks.startsFired`) and how a fired start leaves (`Hooks.arriveStart`). `step.ts` picks
 * the one start an input starts (`chooseStart`); `population.ts` starts every fired one, each its own unit of commitment.
 */
import {
  SignalNames,
  SignalPayload,
  TriggerTag,
  assertNever,
  elementStart,
  programChildren,
  valueSourceLiteral,
  type ConditionTrigger,
  type ElementId,
  type Header,
  type ProfileOptions,
  type SignalTrigger,
  type StartPayload,
  type Subscription,
  type Value,
} from "../../il/types.js";
import {
  FailureTag,
  SignalAddressTag,
  StartTriggerTag,
  WriteRule,
  committed,
  completeSignal,
  failed,
  failedWith,
  initial,
  leaveOutgoing,
  messageChannelEquals,
  root,
  signal,
  signalAddressMatches,
  type Binding,
  type Occurrence,
  type Outcome,
  type Result,
  type SignalAddress,
  type StartInput,
  type StartTrigger,
  type State,
} from "../../state.js";
import { admitValues, messageTriggerChannel, type Ctx } from "../../hooks.js";
import { payloadBindings } from "../subscriptions.js";
import { predicateHolds } from "./conditions.js";

/**
 * The address a root Signal start subscribes to: its Signal's QName under `SignalNames.identifier` (BPMN 2.0.2
 * Table 10.100), its name under `addresses`, which admission holds literal at a root start (`start.signalNameExpression`).
 */
function startAddress(options: ProfileOptions, trigger: SignalTrigger): SignalAddress | null {
  switch (options.signalNames) {
    case SignalNames.Identifier:
      return trigger.signalRef === null ? null : { tag: SignalAddressTag.Qualified, ref: trigger.signalRef };
    case SignalNames.Addresses: {
      const name = trigger.name === null ? null : valueSourceLiteral(trigger.name);
      return name === null ? null : { tag: SignalAddressTag.Named, name };
    }
  }
  return assertNever(options.signalNames);
}

/**
 * Whether a Conditional root start holds for `input`: evaluated over the submitted variables alone, in a fresh
 * instance's root scope, as CIB evaluates it in a temporary execution (`DefaultConditionHandler.java:121-134`); a
 * `variableName` the input does not submit makes it false, and the predicate reads as every Conditional one does.
 */
function conditionHolds(ctx: Ctx, input: StartInput, trigger: ConditionTrigger): Result<boolean> {
  const variableName = trigger.variableName;
  if (variableName !== null && !input.variables.some(([name]) => name === variableName)) return committed(false);
  const submitted: State = { ...initial(input.instanceId, input.variables, input.businessKey), logicalTimeMs: input.atMs ?? 0 };
  return predicateHolds(ctx, submitted, root, trigger.condition);
}

/** Whether `input`'s trigger fires a start with `subscription`. A none trigger names its start by identifier and consumes its trigger itself. */
function fires(ctx: Ctx, input: StartInput, subscription: Subscription | null): Result<boolean> {
  const trigger = input.trigger;
  if (trigger.tag === StartTriggerTag.None) return committed(true);
  if (subscription === null) return committed(false);
  const subscribed = subscription.trigger;
  switch (subscribed.tag) {
    case TriggerTag.Timer:
      return committed(trigger.tag === StartTriggerTag.Timer);
    case TriggerTag.Message:
      return committed(trigger.tag === StartTriggerTag.Message &&
        trigger.channel !== null && messageChannelEquals(messageTriggerChannel(subscribed.payload), trigger.channel));
    case TriggerTag.Signal: {
      const address = startAddress(ctx.program.options, subscribed.payload);
      return committed(trigger.tag === StartTriggerTag.Signal && address !== null && signalAddressMatches(trigger.address, address));
    }
    case TriggerTag.Condition:
      return trigger.tag === StartTriggerTag.Condition ? conditionHolds(ctx, input, subscribed.payload) : committed(false);
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return committed(false);
  }
  return assertNever(subscribed);
}

/** The starts among `starts` that `input`'s trigger fires, in order; the first failing predicate fails them all. */
function firedAmong(ctx: Ctx, input: StartInput, starts: readonly (readonly [Header, StartPayload])[]): Result<readonly ElementId[]> {
  const fired: ElementId[] = [];
  for (const [header, start] of starts) {
    const fire = fires(ctx, input, start.subscription);
    if (!fire.ok) return failedWith(fire.failure);
    if (fire.value) fired.push(header.id);
  }
  return committed(fired);
}

/**
 * `Hooks.startsFired`: the root starts `input`'s trigger fires, in document order. A named input considers only the
 * start it names, so no other start's predicate is evaluated for it: each start is its own unit of commitment
 * (population contract, per-receiver commitment). An unnamed none trigger fires the sole none start, and nothing when
 * there is none or several.
 */
export function startsFired(ctx: Ctx, input: StartInput): Result<readonly ElementId[]> {
  const starts = programChildren(ctx.program, null).flatMap((element) => {
    const start = elementStart(element);
    return start === null ? [] : [start];
  });
  const named = input.startEvent;
  if (named !== null) return firedAmong(ctx, input, starts.filter(([header]) => header.id === named));
  if (input.trigger.tag !== StartTriggerTag.None) return firedAmong(ctx, input, starts);
  const [only, ...others] = starts.filter(([, start]) => start.subscription === null);
  return committed(only !== undefined && others.length === 0 ? [only[0].id] : []);
}

/**
 * What a Message start writes: the catch rule of a payload (account P1), so a start with outputs requires a payload and
 * one without accepts none (`SUBSCRIPTIONS-SEMANTICS-SPEC.md` Messages, Payload).
 */
function startPayload(ctx: Ctx, nowMs: number, subscription: Subscription, delivered: Value | null): Result<readonly Binding[]> {
  const admitted = admitValues(delivered === null ? [] : [delivered]);
  if (!admitted.ok) return failedWith(admitted.failure);
  if (subscription.outputs.length === 0) {
    return delivered === null ? committed([]) : failed(FailureTag.Rejected, "message-payload-not-accepted");
  }
  return delivered === null ? failed(FailureTag.Rejected, "message-payload-required") : payloadBindings(ctx, nowMs, subscription.outputs, delivered);
}

/**
 * `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
 * start was consumed by the input that names it. A Signal start's variables are its start values only under
 * `SignalPayload.variables`; under `none` a Signal carries no data (BPMN 2.0.2 §10.5.1), so variables are rejected.
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
      if (payload.subscription === null) return committed([state, []]);
      const bound = startPayload(ctx, state.logicalTimeMs, payload.subscription, trigger.payload);
      return bound.ok ? committed([state, bound.value]) : failedWith(bound.failure);
    }
    case StartTriggerTag.Signal: {
      if (ctx.program.options.signalPayload === SignalPayload.None && trigger.variables.length > 0) {
        return failed(FailureTag.Rejected, "signal-variables-not-admitted");
      }
      const admitted = admitValues(trigger.variables.map(([, value]) => value));
      return admitted.ok ? committed([state, trigger.variables]) : failedWith(admitted.failure);
    }
    case StartTriggerTag.None:
    case StartTriggerTag.Condition:
      return committed([state, []]);
  }
  return assertNever(trigger);
}
