/**
 * Population: Conditional start evaluations, transcribed from `Kernel/Population/Conditions.lean`: an
 * `evaluateConditions` command evaluates every Conditional root start in scope over the submitted variables and starts
 * an instance at each start that holds, each start its own unit of commitment (PC-CONDITION-02, CIB-EXT-0044,
 * [specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { assertNever, elementStart, programChildren, programPublicId, triggerCondition, type Header, type Program } from "../il/types.js";
import type { Hooks } from "../hooks.js";
import { StartTriggerTag, type Result, type StartInput } from "../state.js";
import { context } from "../step.js";
import {
  FanOutEntryTag,
  PendingTag,
  ReceiverTag,
  ResolutionTag,
  cascadeBound,
  currentDeployments,
  fanOut,
  fanOutBegin,
  fanningEntries,
  inOrder,
  rootStart,
  selected,
  startInstance,
  startedInstanceId,
  type ConditionEvaluation,
  type Deployment,
  type Instance,
  type Pending,
  type Reached,
  type Receiver,
  type Refusable,
  type Resolution,
} from "./signals.js";

type ConditionalStart = readonly [Deployment, Header, string];

/**
 * The Conditional root starts of the deployments in scope, each with its public identifier: those of the selected
 * deployment, or of each key's current deployment (CIB-INT-0031); deployments in deploy order, starts in document order
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#conditional-start-evaluations).
 */
export function conditionalStarts(registry: readonly Deployment[], scope: Deployment | null): readonly ConditionalStart[] {
  const deployments = scope === null ? currentDeployments(registry) : [scope];
  return deployments.flatMap((deployment) => programChildren(deployment.program, null).flatMap((element) => {
    const started = elementStart(element);
    const trigger = started?.[1].subscription?.trigger;
    if (started === null || trigger === undefined || triggerCondition(trigger) === null) return [];
    return [[deployment, started[0], programPublicId(deployment.program, started[0].id)] as const];
  }));
}

/** Whether a Conditional root start holds, or the failure of its predicate. */
export type ConditionalStartVerdict = Result<boolean>;

/**
 * Whether the Conditional root start `input` names in `program` holds, or the failure of its predicate: the start step's
 * own predicate (`Hooks.startsFired`) over the start's own input, so a caller passes the exact input it then starts the
 * instance with, its identity, business key, logical time and submitted variables alone included (CIB-EXT-0044).
 */
export function conditionalStartVerdict(hooks: Hooks, program: Program, input: StartInput): ConditionalStartVerdict {
  const fired = hooks.startsFired(context(hooks, program), input);
  return fired.ok ? { ok: true, value: fired.value.length > 0 } : fired;
}

/**
 * Reach the Conditional root start `receiver` names for `evaluation` at `atMs`: a start whose predicate does not hold
 * records nothing, one whose predicate fails its `failed` entry, and one that holds starts its instance with the
 * business key and every submitted variable and records the start's entry. The predicate is asked first
 * (`conditionalStartVerdict`), so a false start is never read off a refused start step.
 */
export function evaluateStart(
  hooks: Hooks,
  registry: readonly Deployment[],
  evaluation: ConditionEvaluation,
  atMs: number,
  instances: readonly Instance[],
  receiver: Receiver,
): Refusable<Reached> {
  switch (receiver.tag) {
    case ReceiverTag.Occurrence:
      // An evaluation's fan-out names only Conditional starts itself, so an occurrence here is a harness defect.
      return { ok: false, error: "conditional-receiver-without-start" };
    case ReceiverTag.Start: {
      const found = rootStart(registry, receiver.deploymentId, receiver.startEvent);
      if (!found.ok) return found;
      const [deployment, header] = found.value;
      const input: StartInput = {
        instanceId: startedInstanceId(evaluation.commandId, receiver.deploymentId, receiver.startEvent), startEvent: header.id,
        variables: evaluation.variables, trigger: { tag: StartTriggerTag.Condition }, businessKey: evaluation.businessKey, atMs,
        conditionChoices: [],
      };
      const verdict = conditionalStartVerdict(hooks, deployment.program, input);
      if (!verdict.ok) return { ok: true, value: [instances, { tag: FanOutEntryTag.Failed, target: receiver, failure: verdict.failure }, null] };
      if (!verdict.value) return { ok: true, value: [instances, null, null] };
      const started = startInstance(hooks, deployment, receiver.startEvent, input);
      if (!started.ok) return started;
      const [instance, entry] = started.value;
      if (instance === null) return { ok: true, value: [instances, entry, null] };
      return { ok: true, value: [[...instances, instance], entry, [instance.state, deployment.program]] };
    }
  }
  return assertNever(receiver);
}

/**
 * Evaluate the Conditional root starts in scope at `atMs` (PC-CONDITION-02): each that holds starts one instance, each
 * start its own unit of commitment, so a failing start leaves every other start's instance in place (CIB starts all or
 * none, CIB-INT-0033). Every start takes one of the fan-out's receivers, held or not, and the intents a started
 * instance's step left cascade before the next start. The answer is the fan-out of the starts that held or failed and of their cascades, in order, and
 * `fanOut []` when none held. A selector naming no registered deployment is `rejected definition-not-deployed`, a scope
 * without a Conditional start `rejected no-conditional-start` and an `order` naming other starts
 * `rejected discovery-order-mismatch`.
 */
export function evaluateConditions(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  atMs: number,
  evaluation: ConditionEvaluation,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const rejected = (code: string): Refusable<readonly [readonly Instance[], Resolution]> =>
    ({ ok: true, value: [instances, { tag: ResolutionTag.Rejected, code }] });
  const scope = selected(registry, evaluation.definition);
  if (scope === undefined) return rejected("definition-not-deployed");
  const starts = conditionalStarts(registry, scope);
  if (starts.length === 0) return rejected("no-conditional-start");
  const ordered = inOrder(([deployment, , start]) => ({ tag: ReceiverTag.Start, deploymentId: deployment.deploymentId, startEvent: start }),
    starts, evaluation.order);
  if (ordered === null) return rejected("discovery-order-mismatch");
  const root = ordered.map(([deployment, , start]): Pending =>
    ({ tag: PendingTag.Receiver, emission: null, receiver: { tag: ReceiverTag.Start, deploymentId: deployment.deploymentId, startEvent: start } }));
  const own = (reached: readonly Instance[], receiver: Receiver): Refusable<Reached> =>
    evaluateStart(hooks, registry, evaluation, atMs, reached, receiver);
  const fanned = fanOut(hooks, registry, atMs, own, { instances, machine: fanOutBegin(evaluation.commandId, root, cascadeBound) });
  if (!fanned.ok) return fanned;
  return { ok: true, value: [fanned.value.instances, { tag: ResolutionTag.FanOut, entries: fanningEntries(fanned.value) }] };
}
