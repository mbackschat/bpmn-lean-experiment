/**
 * The host's pure decisions, computed from the kernel's host view alone.
 *
 * Planning reads each wait's details, never its kind: a wait with a deadline gets one durable timer, a wait with an
 * effect gets one Activity (a Script Task's effect evaluates its Script instead), and every other wait is closed by a
 * client's update. Work is keyed by public occurrence identity, so a live timer or Activity whose wait left the view
 * is withdrawn, and a retried effect, which reopens with the same activation and one more recorded failure, is new
 * work. Nothing here touches Temporal, so replay recomputes the same plan from the same committed state.
 */
import {
  type Binding,
  type EffectResult,
  type HostView,
  type JsonValue,
  type KernelPort,
  type OccurrenceId,
  type Requirements,
  type ScriptSource,
  type WaitView,
} from "./port.js";

/** One effect Activity's request; `key` is the idempotency key a handler with external writes must honour. */
export interface EffectRequest {
  readonly key: string;
  readonly occurrence: OccurrenceId;
  readonly protocol: string;
  readonly operation: string;
  readonly arguments: readonly Binding[];
  readonly failures: number;
}

/** One Script evaluation: the Script Task's source over the effect's arguments, read-only. */
export interface ScriptRequest {
  readonly key: string;
  readonly occurrence: OccurrenceId;
  readonly script: ScriptSource;
  readonly context: readonly Binding[];
}

export interface TimerArm {
  readonly key: string;
  readonly timer: OccurrenceId;
  readonly deadlineMs: number;
}

export interface HostPlan {
  readonly armTimers: readonly TimerArm[];
  readonly cancelTimers: readonly string[];
  readonly startEffects: readonly EffectRequest[];
  readonly evaluateScripts: readonly ScriptRequest[];
  readonly cancelEffects: readonly string[];
}

/** The timers and Activities the host owns now, by key; an Activity whose result is queued is still live. */
export interface LiveWork {
  readonly timers: ReadonlySet<string>;
  readonly effects: ReadonlySet<string>;
}

function identity(id: OccurrenceId): readonly [string, string, number] {
  return [id.processInstanceId, id.elementId, id.activation];
}

/** A cycle re-arms its occurrence with a later deadline, which is new work. */
export function timerKey(id: OccurrenceId, deadlineMs: number): string {
  return `timer:${JSON.stringify([...identity(id), deadlineMs])}`;
}

export function effectKey(id: OccurrenceId, failures: number): string {
  return `effect:${JSON.stringify([...identity(id), failures])}`;
}

/**
 * The work `view` needs beyond `live`, and the live work it no longer has. `startEffects = false` while the host
 * drains towards Continue-As-New: no Activity starts, so the Run quiesces, and the next Run starts the work afresh.
 */
export function planHost(
  view: HostView,
  live: LiveWork,
  scriptOf: (wait: WaitView) => ScriptSource | null,
  startEffects: boolean,
): HostPlan {
  const timers = view.openWaits.flatMap((wait): TimerArm[] =>
    wait.deadlineMs === undefined ? [] : [{ key: timerKey(wait.id, wait.deadlineMs), timer: wait.id, deadlineMs: wait.deadlineMs }]);
  const effects: EffectRequest[] = [];
  const scripts: ScriptRequest[] = [];
  for (const wait of view.openWaits) {
    if (wait.effect === undefined) continue;
    const key = effectKey(wait.id, wait.effect.failures);
    const script = scriptOf(wait);
    if (script === null) {
      effects.push({
        key,
        occurrence: wait.id,
        protocol: wait.effect.protocol,
        operation: wait.effect.operation,
        arguments: wait.effect.arguments,
        failures: wait.effect.failures,
      });
    } else {
      scripts.push({ key, occurrence: wait.id, script, context: wait.effect.arguments });
    }
  }
  const timerKeys = new Set(timers.map((timer) => timer.key));
  const effectKeys = new Set([...effects, ...scripts].map((effect) => effect.key));
  const fresh = <T extends { readonly key: string }>(work: readonly T[]): T[] =>
    startEffects ? work.filter((entry) => !live.effects.has(entry.key)) : [];
  return {
    armTimers: timers.filter((timer) => !live.timers.has(timer.key)),
    cancelTimers: [...live.timers].filter((key) => !timerKeys.has(key)),
    startEffects: fresh(effects),
    evaluateScripts: fresh(scripts),
    cancelEffects: [...live.effects].filter((key) => !effectKeys.has(key)),
  };
}

/** Logical time is Workflow time in epoch milliseconds; a deadline already passed fires at once. */
export function timerDelayMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

/** The code a host-clocked stimulus that states its own logical time is refused with. */
export const hostOwnsLogicalTime = "host-owns-logical-time";

/**
 * `stimulus` with the host's logical time as its `at`, or `null` when it states a time of its own: the host never
 * silently chooses between two clocks. A stimulus that is no JSON object passes unchanged, for decoding to refuse.
 */
export function clockStimulus(stimulus: JsonValue, atMs: number): JsonValue | null {
  if (stimulus === null || typeof stimulus !== "object" || Array.isArray(stimulus)) return stimulus;
  if ("at" in stimulus) return null;
  return { ...stimulus, at: atMs };
}

export enum ArrivalKind {
  Timer = "timer",
  Effect = "effect",
}

/** A host event waiting to reach the kernel: a due timer, or an Activity's business result. */
export type Arrival =
  | { readonly kind: ArrivalKind.Timer; readonly key: string; readonly timer: OccurrenceId; readonly deadlineMs: number }
  | { readonly kind: ArrivalKind.Effect; readonly key: string; readonly effect: OccurrenceId; readonly result: EffectResult };

/**
 * The index of the queued arrival to apply next. Arrival order is the recorded schedule, except that timers due
 * together fire by deadline: the kernel refuses a firing earlier than its logical clock, so a later deadline applied
 * first would make the host, not the model, drop the earlier one.
 */
export function nextArrival(queue: readonly Arrival[]): number {
  const head = queue[0];
  if (head === undefined || head.kind !== ArrivalKind.Timer) return 0;
  let chosen = 0;
  queue.forEach((arrival, index) => {
    const best = queue[chosen];
    if (arrival.kind === ArrivalKind.Timer && best?.kind === ArrivalKind.Timer && arrival.deadlineMs < best.deadlineMs) {
      chosen = index;
    }
  });
  return chosen;
}

/** The kernel input of `arrival`, applied at logical time `atMs`. */
export function arrivalInput<P, S, I>(port: KernelPort<P, S, I>, arrival: Arrival, atMs: number): I {
  switch (arrival.kind) {
    case ArrivalKind.Timer: return port.timerInput(arrival.timer, arrival.deadlineMs, atMs);
    case ArrivalKind.Effect: return port.effectInput(arrival.effect, arrival.result, atMs);
  }
  return assertNever(arrival);
}

/** The command identifier of a host-generated input, stable under replay. */
export function arrivalCommandId(arrival: Arrival): string {
  return `host:${arrival.key}`;
}

/** Temporal's Event History warning threshold, the point at which the SDK starts suggesting Continue-As-New. */
const historyWarningEvents = 10_240;
/** One Workflow Task (scheduled, started, completed) per activation. */
const workflowTaskEvents = 3;
/** An Update's accepted and completed events. */
const updateEvents = 2;
/** A timer's started and fired or cancelled events. */
const timerEvents = 2;
/** An Activity's scheduled, started and completed events, and its cancel request and cancellation when withdrawn. */
const activityEvents = 5;
/** The waits reserved for when the program's shape bounds nothing (`maxConcurrentWaits = null`). */
const unboundedWaitAllowance = 256;

/**
 * The history length at which a Run continues as new. The reserve keeps room for every open wait to settle once
 * after the threshold is crossed, since the Run drains its live Activities before it rolls over; each wait costs the
 * events of the mechanisms the program's requirements name.
 */
export function historyBudget(requirements: Requirements, override: number | null): number {
  if (override !== null) return override;
  const perWait = workflowTaskEvents +
    (requirements.messages || requirements.userTasks ? updateEvents : 0) +
    (requirements.timers ? timerEvents : 0) +
    (requirements.effects ? activityEvents : 0);
  const waits = requirements.maxConcurrentWaits ?? unboundedWaitAllowance;
  return Math.max(historyWarningEvents / 2, historyWarningEvents - perWait * waits);
}

export type Applied<S> =
  | { readonly committed: true; readonly state: S; readonly view: HostView }
  | { readonly committed: false; readonly rejected: boolean; readonly outcome: string; readonly code: string };

/** One input through the kernel. A refusal leaves `before` untouched; the caller keeps it. */
export function applyInput<P, S, I>(port: KernelPort<P, S, I>, program: P, before: S | null, input: I): Applied<S> {
  const result = port.step(program, before, input);
  if (!result.committed) return result;
  return { committed: true, state: result.state, view: port.hostView(program, result.state) };
}

export function assertNever(value: never): never {
  throw new TypeError(`unexpected variant ${JSON.stringify(value)}`);
}
