/**
 * Population: Conditional start evaluations, transcribed from `Kernel/Population/Conditions.lean`: an
 * `evaluateConditions` command evaluates every Conditional root start in scope over the submitted variables and starts
 * an instance at each start that holds, each start its own unit of commitment (PC-CONDITION-02, CIB-EXT-0044,
 * [specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { elementStart, programChildren, programPublicId, triggerCondition, type Header, type Program } from "../il/types.js";
import type { Hooks } from "../hooks.js";
import { StartTriggerTag, type Result, type StartInput } from "../state.js";
import { context } from "../step.js";
import {
  FanOutEntryTag,
  ReceiverTag,
  ResolutionTag,
  cascade,
  currentDeployments,
  fanningAdd,
  fanningEntries,
  fanningOf,
  fanningSpend,
  inOrder,
  selected,
  startInstance,
  startedInstanceId,
  type ConditionEvaluation,
  type Deployment,
  type Fanning,
  type Instance,
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
 * Evaluate one start for `evaluation` at `atMs`: a start whose predicate does not hold adds nothing, one whose predicate
 * fails adds its `failed` entry, and one that holds starts its instance with the business key and every submitted
 * variable, adding the start's entry, and the intents its step left cascade before the next start. The predicate is
 * asked first (`conditionalStartVerdict`), so a false start is never read off a refused start step.
 */
export function evaluateStart(
  hooks: Hooks,
  registry: readonly Deployment[],
  evaluation: ConditionEvaluation,
  atMs: number,
  before: Fanning,
  [deployment, header, publicStart]: ConditionalStart,
): Refusable<Fanning> {
  const receiver: Receiver = { tag: ReceiverTag.Start, deploymentId: deployment.deploymentId, startEvent: publicStart };
  const [fanning, reachable] = fanningSpend(before, receiver);
  if (!reachable) return { ok: true, value: fanning };
  const input: StartInput = {
    instanceId: startedInstanceId(evaluation.commandId, deployment.deploymentId, publicStart), startEvent: header.id,
    variables: evaluation.variables, trigger: { tag: StartTriggerTag.Condition }, businessKey: evaluation.businessKey, atMs,
  };
  const verdict = conditionalStartVerdict(hooks, deployment.program, input);
  if (!verdict.ok) return { ok: true, value: fanningAdd(fanning, { tag: FanOutEntryTag.Failed, target: receiver, failure: verdict.failure }) };
  if (!verdict.value) return { ok: true, value: fanning };
  const started = startInstance(hooks, deployment, publicStart, input);
  if (!started.ok) return started;
  const [instance, entry] = started.value;
  const added = fanningAdd(fanning, entry);
  if (instance === null) return { ok: true, value: added };
  return cascade(hooks, registry, atMs, { ...added, instances: [...added.instances, instance] }, instance.state, deployment.program);
}

/**
 * Evaluate the Conditional root starts in scope at `atMs` (PC-CONDITION-02): each that holds starts one instance, each
 * start its own unit of commitment, so a failing start leaves every other start's instance in place (CIB starts all or
 * none, CIB-INT-0033). The answer is the fan-out of the starts that held or failed and of their cascades, in order, and
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
  let fanning = fanningOf(evaluation.commandId, instances);
  for (const start of ordered) {
    const next = evaluateStart(hooks, registry, evaluation, atMs, fanning, start);
    if (!next.ok) return next;
    fanning = next.value;
  }
  return { ok: true, value: [fanning.instances, { tag: ResolutionTag.FanOut, entries: fanningEntries(fanning) }] };
}
