/**
 * Population: Timer starts, transcribed from `Kernel/Population/Timers.lean`: a Timer-start occurrence named by its due
 * instant and fired at a command's logical time (PC-TIMER-04): the schedule's origin and due instants are population
 * semantics, so a host asks this check rather than reimplementing it
 * ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { programPublicId, utf8ByteSize, type ElementId, type Program } from "../il/types.js";
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
  type DeploymentSummary,
  type Resolved,
  currentSummary,
  deploymentSummaryOf,
  occurs,
  startInstance,
  timerStarts,
} from "./messages.js";

/**
 * The identity of the instance a Timer-start occurrence starts (population contract §4): bound to the occurrence, not to a
 * command, so one occurrence can never start two instances under any firing time or command identity.
 */
export function timerInstanceId(deploymentId: number, startEvent: string, dueMs: number): string {
  const deployment = String(deploymentId);
  return `timer:${utf8ByteSize(deployment)}:${deployment}:${utf8ByteSize(startEvent)}:${startEvent}:${dueMs}`;
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
 * Whether the occurrence `dueMs` of the root Timer start `startEvent` of `deploymentId` may fire at `atMs`, over the
 * registered deployments' summaries; `consumed` is whether it already started an instance. The deployment must be
 * registered (`definition-not-deployed`), `startEvent` one of its root Timer starts (`no-start-event`), the occurrence
 * due (`timerFiring`), the deployment still current for its key, as CIB deletes every Timer-start job of a key it
 * redeploys (`timer-start-superseded`, `BpmnDeployer.java:251-258`), and the occurrence unconsumed
 * (`timer-start-occurrence-consumed`).
 */
export function timerStartCheck(
  registry: readonly DeploymentSummary[],
  deploymentId: number,
  startEvent: string,
  dueMs: number,
  atMs: number,
  consumed: boolean,
): string | null {
  const deployment = registry.find((candidate) => candidate.deploymentId === deploymentId);
  if (deployment === undefined) return "definition-not-deployed";
  const reached = deployment.timerStarts.find(([publicStart]) => publicStart === startEvent);
  if (reached === undefined) return "no-start-event";
  const superseded = currentSummary(registry, deployment.key)?.deploymentId !== deploymentId;
  return timerFiring(deployment.deployedAtMs, dueMs, atMs, reached[1]) ??
    (superseded ? "timer-start-superseded" : null) ?? (consumed ? "timer-start-occurrence-consumed" : null);
}

/**
 * Fire a Timer-start occurrence at `atMs` (PC-TIMER-04, M8-INT-A, CIB-INT-0031) unless `timerStartCheck` refuses it.
 * The instance takes the firing time; a committed start consumes the occurrence.
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
  const spent = consumed.some((occurrence) => occurrence.deploymentId === fired.deploymentId &&
    occurrence.startEvent === fired.startEvent && occurrence.dueMs === fired.dueMs);
  const refusal = timerStartCheck(registry.map(deploymentSummaryOf), fired.deploymentId, fired.startEvent, fired.dueMs, atMs, spent);
  if (refusal !== null) return refuse(refusal);
  const deployment = registry.find((candidate) => candidate.deploymentId === fired.deploymentId);
  if (deployment === undefined) return { ok: false, error: "timer-start-without-deployment" };
  const program = deployment.program;
  const header = timerStarts(program).find(([started]) => programPublicId(program, started.id) === fired.startEvent)?.[0];
  if (header === undefined) return { ok: false, error: "timer-start-without-start" };
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
