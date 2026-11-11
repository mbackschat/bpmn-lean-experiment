/**
 * Starts: root start Events, transcribed from `Kernel/Feature/Starts.lean`. A sub-feature of its own: which root start
 * Events a start input's trigger fires (`Hooks.startsFired`) and how a fired start leaves (`Hooks.arriveStart`).
 * Whether a trigger fires one start, which matches on `Trigger`, and a Message payload's bindings are
 * `feature/subscriptions.ts`' rules, reached through `StartsHooks`. `step.ts` picks the one start an input starts
 * (`chooseStart`); `population.ts` starts every fired one, each its own unit of commitment.
 */
import {
  SignalPayload,
  assertNever,
  elementStart,
  programChildren,
  type ElementId,
  type Header,
  type Mapping,
  type StartPayload,
  type Subscription,
  type Value,
} from "../il/types.js";
import {
  FailureTag,
  StartTriggerTag,
  WriteRule,
  committed,
  completeSignal,
  failed,
  failedWith,
  leaveOutgoing,
  signal,
  type Binding,
  type Occurrence,
  type Outcome,
  type Result,
  type StartInput,
  type StartTrigger,
  type State,
} from "../state.js";
import { admitValues, type Ctx } from "../hooks.js";

/**
 * The Subscriptions rules a start shares, which `registry.ts` fills, since features never import each other: `fires` is
 * `feature/subscriptions.ts#fires`, `payloadBindings` `feature/subscriptions.ts#payloadBindings`.
 */
export interface StartsHooks {
  readonly fires: (ctx: Ctx, input: StartInput, subscription: Subscription | null) => Result<boolean>;
  readonly payloadBindings: (ctx: Ctx, nowMs: number, outputs: readonly Mapping[], payload: Value) => Result<readonly Binding[]>;
}

export const defaultStartsHooks: StartsHooks = {
  fires: () => failed(FailureTag.Unsupported, "starts-fires"), // dynamic-only: a registry without the hook
  payloadBindings: () => failed(FailureTag.Unsupported, "starts-payload"), // dynamic-only: a registry without the hook
};

/** The starts among `starts` that `input`'s trigger fires, in order; the first failing predicate fails them all. */
function firedAmong(hooks: StartsHooks, ctx: Ctx, input: StartInput, starts: readonly (readonly [Header, StartPayload])[]): Result<readonly ElementId[]> {
  const fired: ElementId[] = [];
  for (const [header, start] of starts) {
    const fire = hooks.fires(ctx, input, start.subscription);
    if (!fire.ok) return failedWith(fire.failure);
    if (fire.value) fired.push(header.id);
  }
  return committed(fired);
}

/**
 * `Hooks.startsFired`: the root starts `input`'s trigger fires, in document order. A named input considers only the
 * start it names, so no other start's predicate is evaluated for it: each start is its own unit of commitment
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations). An unnamed none trigger fires
 * every none start, so `chooseStart` answers `start-ambiguous` for several, which only an unadmitted program has
 * (`start.rootCombination`, CIB-LIM-0007).
 */
export function startsFired(hooks: StartsHooks, ctx: Ctx, input: StartInput): Result<readonly ElementId[]> {
  const starts = programChildren(ctx.program, null).flatMap((element) => {
    const start = elementStart(element);
    return start === null ? [] : [start];
  });
  const named = input.startEvent;
  if (named !== null) return firedAmong(hooks, ctx, input, starts.filter(([header]) => header.id === named));
  if (input.trigger.tag !== StartTriggerTag.None) return firedAmong(hooks, ctx, input, starts);
  return committed(starts.filter(([, start]) => start.subscription === null).map(([header]) => header.id));
}

/**
 * What a Message start writes: the catch rule of a payload (account P1), so a start with outputs requires a payload and
 * one without accepts none (`SUBSCRIPTIONS-SEMANTICS-SPEC.md` Messages, Payload).
 */
function startPayload(hooks: StartsHooks, ctx: Ctx, nowMs: number, subscription: Subscription, delivered: Value | null): Result<readonly Binding[]> {
  const admitted = admitValues(delivered === null ? [] : [delivered]);
  if (!admitted.ok) return failedWith(admitted.failure);
  if (subscription.outputs.length === 0) {
    return delivered === null ? committed([]) : failed(FailureTag.Rejected, "message-payload-not-accepted");
  }
  return delivered === null ? failed(FailureTag.Rejected, "message-payload-required") : hooks.payloadBindings(ctx, nowMs, subscription.outputs, delivered);
}

/**
 * `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
 * start was consumed by the input that names it. A Signal start's variables are its start values only under
 * `SignalPayload.variables`; under `none` a Signal carries no data (BPMN 2.0.2 §10.5.1), so variables are rejected.
 */
export function arriveStart(hooks: StartsHooks, ctx: Ctx, _header: Header, payload: StartPayload, trigger: StartTrigger, occurrence: Occurrence, state: State): Outcome {
  const started = startValues(hooks, ctx, payload, trigger, state);
  if (!started.ok) return failedWith(started.failure);
  const [current, values] = started.value;
  return committed(signal(current, completeSignal(occurrence.id, leaveOutgoing, values, WriteRule.Outward)));
}

function startValues(hooks: StartsHooks, ctx: Ctx, payload: StartPayload, trigger: StartTrigger, state: State): Result<readonly [State, readonly Binding[]]> {
  switch (trigger.tag) {
    case StartTriggerTag.Timer:
      return committed([{ ...state, logicalTimeMs: trigger.logicalTimeMs }, []]);
    case StartTriggerTag.Message: {
      if (payload.subscription === null) return committed([state, []]);
      const bound = startPayload(hooks, ctx, state.logicalTimeMs, payload.subscription, trigger.payload);
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
