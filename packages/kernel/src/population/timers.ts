/**
 * Population: Timer starts, transcribed from `Kernel/Population/Timers.lean`: a Timer-start occurrence named by its due
 * instant and fired at a command's logical time (PC-TIMER-04): the schedule's origin and due instants are population
 * semantics, so a host asks this check rather than reimplementing it
 * ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import {
  elementStart,
  programChildren,
  programPublicId,
  triggerTimer,
  utf8ByteSize,
  type ElementId,
  type Header,
  type Program,
} from "../il/types.js";
import { occurs, resolve, type Resolved } from "../il/timer.js";
import type { Hooks } from "../hooks.js";
import { StartTriggerTag } from "../state.js";
import {
  ResolutionTag,
  type Deployment,
  type Instance,
  type Refusable,
  type Resolution,
  type TimerOccurrence,
  type TimerStart,
  current,
  startInstance,
} from "./messages.js";

/**
 * The identity of the instance a Timer-start occurrence starts (population contract §4): bound to the occurrence, not to a
 * command, so one occurrence can never start two instances under any firing time or command identity.
 */
export function timerInstanceId(deploymentId: number, startEvent: string, dueMs: number): string {
  const deployment = String(deploymentId);
  return `timer:${utf8ByteSize(deployment)}:${deployment}:${utf8ByteSize(startEvent)}:${startEvent}:${dueMs}`;
}

/** A program's root Timer starts whose schedule resolves to what a host arms, in document order. */
export function timerStarts(program: Program): readonly (readonly [Header, Resolved])[] {
  return programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    const trigger = started?.[1].subscription?.trigger;
    const timer = trigger === undefined ? null : triggerTimer(trigger);
    const resolved = timer === null ? null : resolve(timer.schedule);
    return started === null || resolved === null || !resolved.ok ? [] : [[started[0], resolved.value] as const];
  });
}

/**
 * Whether an occurrence of a start resolved as `resolved`, deployed at `originMs`, may fire at `atMs`: `dueMs` must be one
 * of its due instants (`timer-occurrence-unknown`) and the firing not before it (`timer-not-due`).
 */
export function timerFiring(originMs: number, dueMs: number, atMs: number, resolved: Resolved): string | null {
  if (!occurs(originMs, dueMs, resolved)) return "timer-occurrence-unknown";
  if (atMs < dueMs) return "timer-not-due";
  return null;
}

/**
 * A single-instance Timer start is the degenerate population: one deployment at 0, its occurrence named by the trigger's
 * time and fired on time (population contract §2.2, PC-TIMER-04). The start `named`, else the sole Timer start, is
 * checked; any other start is left to the step.
 */
export function onTimeRefusal(program: Program, named: ElementId | null, dueMs: number): string | null {
  const reached = timerStarts(program).filter(([header]) => named === null || header.id === named);
  const only = reached[0];
  return reached.length === 1 && only !== undefined ? timerFiring(0, dueMs, dueMs, only[1]) : null;
}

/**
 * Fire a Timer-start occurrence at `atMs` (PC-TIMER-04, M8-INT-A, CIB-INT-0031). It is rejected unless the deployment is
 * registered (`definition-not-deployed`), `startEvent` is one of its root Timer starts (`no-start-event`), the occurrence
 * is due (`timerFiring`), the deployment is still current for its key, as CIB deletes every Timer-start job of a key it
 * redeploys (`timer-start-superseded`, `BpmnDeployer.java:251-258`), and the occurrence is unconsumed
 * (`timer-start-occurrence-consumed`). The instance takes the firing time; a committed start consumes the occurrence.
 */
export function timerStart(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  consumed: readonly TimerOccurrence[],
  atMs: number,
  fired: TimerStart,
): Refusable<readonly [readonly Instance[], readonly TimerOccurrence[], Resolution]> {
  const refuse = (code: string): Refusable<readonly [readonly Instance[], readonly TimerOccurrence[], Resolution]> =>
    ({ ok: true, value: [instances, consumed, { tag: ResolutionTag.Rejected, code }] });
  const deployment = registry.find((candidate) => candidate.deploymentId === fired.deploymentId);
  if (deployment === undefined) return refuse("definition-not-deployed");
  const program = deployment.program;
  const reached = timerStarts(program).find(([header]) => programPublicId(program, header.id) === fired.startEvent);
  if (reached === undefined) return refuse("no-start-event");
  const [header, resolved] = reached;
  const superseded = current(registry, deployment.key)?.deploymentId !== deployment.deploymentId;
  const spent = consumed.some((occurrence) => occurrence.deploymentId === fired.deploymentId &&
    occurrence.startEvent === fired.startEvent && occurrence.dueMs === fired.dueMs);
  const refusal = timerFiring(deployment.deployedAtMs, fired.dueMs, atMs, resolved) ??
    (superseded ? "timer-start-superseded" : null) ?? (spent ? "timer-start-occurrence-consumed" : null);
  if (refusal !== null) return refuse(refusal);
  const started = startInstance(hooks, deployment, fired.startEvent, {
    instanceId: timerInstanceId(fired.deploymentId, fired.startEvent, fired.dueMs), startEvent: header.id, variables: [],
    trigger: { tag: StartTriggerTag.Timer, logicalTimeMs: atMs }, businessKey: null, atMs,
  });
  if (!started.ok) return started;
  const [instance, entry] = started.value;
  const resolution: Resolution = { tag: ResolutionTag.FanOut, entries: [entry] };
  if (instance === null) return { ok: true, value: [instances, consumed, resolution] };
  const occurrence: TimerOccurrence = { deploymentId: fired.deploymentId, startEvent: fired.startEvent, dueMs: fired.dueMs };
  return { ok: true, value: [[...instances, instance], [...consumed, occurrence], resolution] };
}
