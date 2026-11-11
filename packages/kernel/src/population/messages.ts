/**
 * Population: Message publications, transcribed from `Kernel/Population/Messages.lean`: routing a Message publication
 * across the population with exact cardinality, to a waiting subscription, else to a root Message start
 * ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { MessageNames, programPublicId, valueSourceLiteral, type ElementId, type Program } from "../il/types.js";
import { messageTriggerChannel, type Hooks } from "../hooks.js";
import {
  DeliveryTriggerTag,
  InputTag,
  StartTriggerTag,
  instanceOf,
  instanceRoot,
  messageChannelEquals,
  occurrenceOf,
  openKindView,
  type CorrelationMatch,
  type CriterionTarget,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type StartInput,
  type State,
} from "../state.js";
import { context, step } from "../step.js";
import {
  DefinitionSelectorTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  current,
  messageStarts,
  startedInstanceId,
  versionOf,
  type DefinitionSelector,
  type Deployment,
  type FanOutEntry,
  type Instance,
  type MessageAddress,
  type Publication,
  type Refusable,
  type Resolution,
} from "./deploy.js";

// `Kernel/Population/Messages.lean` imports `Deploy` publicly, so `Signals` and `Timers` read it through Messages.
export {
  cascadeInstanceId,
  current,
  currentDeployments,
  FanOutEntryTag,
  ReceiverTag,
  ResolutionTag,
  startedInstanceId,
  type Broadcast,
  type ConditionEvaluation,
  type Deployment,
  type FanOutEntry,
  type Instance,
  type Receiver,
  type Refusable,
  type Resolution,
  type TimerOccurrence,
  type TimerStart,
} from "./deploy.js";

export function occurrence(program: Program, state: State, item: OpenItem): OccurrenceRef {
  return {
    processInstanceId: instanceOf(state, item.scope),
    element: programPublicId(program, item.element),
    activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
  };
}

/**
 * The open subscriptions of one instance of `program` that `Hooks.correlates` accepts for a delivery on `channel`
 * carrying `correlation`, by public occurrence identity; a subscription whose key cannot be evaluated is no match. A host
 * that routes a publication across instances asks it of each instance.
 */
export function matching(
  hooks: Hooks,
  program: Program,
  state: State,
  channel: MessageChannel,
  correlation: readonly CorrelationMatch[],
): readonly OccurrenceRef[] {
  const ctx = context(hooks, program);
  const accepted = state.openItems.filter((item) => {
    const accepts = hooks.correlates(ctx, item, channel, correlation, state);
    return accepts.ok && accepts.value;
  });
  return accepted.map((item) => occurrence(program, state, item));
}

/**
 * The open Message subscriptions of one instance of `program` a publication reaches, each with the channel its delivery
 * names: those on the publication's channel, or, for a name, those that resolved that name when they opened (only under
 * `MessageNames.addresses`, CIB-LIM-0022), on their own channel. Each must accept the criteria (`Hooks.correlates`; a key
 * that cannot be evaluated is no match) and, when the publication carries a business key, belong to an instance with
 * that key, a called instance's own (CIB `processInstanceBusinessKey`).
 */
function receivers(
  hooks: Hooks,
  program: Program,
  state: State,
  publication: Publication,
): readonly (readonly [OccurrenceRef, MessageChannel])[] {
  const ctx = context(hooks, program);
  return state.openItems.flatMap((item) => {
    const view = openKindView(item.kind);
    const message = publication.message;
    const channel = message.tag === MessageAddressTag.Channel ? message.channel : view.name === message.name ? view.channel : null;
    const businessKey = publication.businessKey;
    const keyed = businessKey === null ||
      state.slots.instances.find((instance) => instance.root === instanceRoot(state, item.scope))?.businessKey === businessKey;
    if (channel === null) return [];
    const accepts = hooks.correlates(ctx, item, channel, publication.criteria, state);
    return accepts.ok && accepts.value && keyed ? [[occurrence(program, state, item), channel] as const] : [];
  });
}

/**
 * The root Message starts a publication reaches in `scope`, or, without one, in the current deployment of every key
 * (CIB-INT-0031), each with its deployment and channel: those on the publication's channel, or, for a name, those whose
 * literal name it is under the deployment's `MessageNames.addresses` (CIB-LIM-0022).
 */
function startCandidates(
  registry: readonly Deployment[],
  scope: Deployment | null,
  message: MessageAddress,
): readonly (readonly [Deployment, ElementId, MessageChannel])[] {
  const deployments = scope !== null ? [scope] : [...new Set(registry.map((deployment) => deployment.key))].flatMap((key) => {
    const found = current(registry, key);
    return found === null ? [] : [found];
  });
  return deployments.flatMap((deployment) => messageStarts(deployment.program).flatMap(([header, trigger]) => {
    const channel = messageTriggerChannel(trigger);
    const reached = message.tag === MessageAddressTag.Channel
      ? messageChannelEquals(channel, message.channel)
      : deployment.program.options.messageNames === MessageNames.Addresses &&
        (trigger.name === null ? null : valueSourceLiteral(trigger.name)) === message.name;
    return reached ? [[deployment, header.id, channel] as const] : [];
  }));
}

/**
 * The deployment a selector names: the current deployment of a key, or one registered deployment; `null` for no
 * selector, `undefined` for a selector naming no registered deployment.
 */
export function selected(registry: readonly Deployment[], selector: DefinitionSelector | null): Deployment | null | undefined {
  if (selector === null) return null;
  if (selector.tag === DefinitionSelectorTag.ProcessKey) return current(registry, selector.key) ?? undefined;
  return registry.find((deployment) => deployment.deploymentId === selector.deploymentId);
}

/**
 * Start an instance of `deployment` with `input`, which names its start Event `publicStart` by its public identifier and
 * carries the instance's derived identity: the started instance and its `started` entry; or, when the start step
 * refuses it, no instance and the `failed` entry.
 */
export function startInstance(
  hooks: Hooks,
  deployment: Deployment,
  publicStart: string,
  input: StartInput,
): Refusable<readonly [Instance | null, FanOutEntry]> {
  const version = versionOf(deployment, deployment.key);
  if (version === null) return { ok: false, error: "deployment-without-version" };
  const stepped = step(hooks, deployment.program, null, { tag: InputTag.Start, payload: input });
  if (!stepped.ok) {
    const target = { tag: ReceiverTag.Start, deploymentId: deployment.deploymentId, startEvent: publicStart } as const;
    const failed = { tag: FanOutEntryTag.Failed, target, failure: stepped.failure } as const;
    return { ok: true, value: [null, failed] };
  }
  const entry = {
    tag: FanOutEntryTag.Started, instanceId: input.instanceId, deploymentId: deployment.deploymentId, version, startEvent: publicStart,
  } as const;
  return { ok: true, value: [{ deployment, state: stepped.value }, entry] };
}

/**
 * Start `deployment`'s instance at `startEvent` for a publication at `atMs`: the start input names the start, so the start
 * step rechecks its channel, and carries the payload, variables and business key.
 */
function startFor(
  hooks: Hooks,
  instances: readonly Instance[],
  publication: Publication,
  atMs: number,
  deployment: Deployment,
  startEvent: ElementId,
  channel: MessageChannel,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const publicStart = programPublicId(deployment.program, startEvent);
  const started = startInstance(hooks, deployment, publicStart, {
    instanceId: startedInstanceId(publication.commandId, deployment.deploymentId, publicStart), startEvent,
    variables: publication.variables, trigger: { tag: StartTriggerTag.Message, channel, payload: publication.payload },
    businessKey: publication.businessKey, atMs,
  });
  if (!started.ok) return started;
  const [instance, entry] = started.value;
  const resolution: Resolution = { tag: ResolutionTag.FanOut, entries: [entry] };
  return { ok: true, value: [instance === null ? instances : [...instances, instance], resolution] };
}

/** Whether two criteria name one target: equal members, all of them primitive, as Lean compares their `reprStr`. */
function sameTarget(left: CriterionTarget, right: CriterionTarget): boolean {
  const leftMembers = left as Readonly<Record<string, unknown>>;
  const rightMembers = right as Readonly<Record<string, unknown>>;
  const keys = Object.keys(leftMembers);
  return keys.length === Object.keys(rightMembers).length && keys.every((key) => leftMembers[key] === rightMembers[key]);
}

/**
 * Route one publication at `atMs` (PC-MESSAGE-02, PC-MESSAGE-08): unless start-only, deliver to its sole receiver among
 * the instances of its selected deployment, or of every deployment without a selector; when there is none and it is not
 * executions-only, start its sole start candidate. The delivery or start takes the command's logical time, so the step it
 * causes evaluates `now` and arms Timers from it. Zero is `noMatch` and several are `ambiguous`, either leaving every
 * instance unchanged; candidate order never picks a winner. Criteria naming one target twice are
 * `rejected criteria-duplicate`, a selector naming no registered deployment `rejected definition-not-deployed`.
 */
export function publish(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  atMs: number,
  publication: Publication,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const targets = publication.criteria.map((criterion) => criterion.target);
  const duplicate = targets.some((target, index) => targets.slice(0, index).some((earlier) => sameTarget(earlier, target)));
  if (duplicate) return { ok: true, value: [instances, { tag: ResolutionTag.Rejected, code: "criteria-duplicate" }] };
  const scope = selected(registry, publication.definition);
  if (scope === undefined) return { ok: true, value: [instances, { tag: ResolutionTag.Rejected, code: "definition-not-deployed" }] };
  const reached = publication.mode === PublishMode.StartOnly ? [] : instances.flatMap((member, index) =>
    scope !== null && scope.deploymentId !== member.deployment.deploymentId ? []
      : receivers(hooks, member.deployment.program, member.state, publication)
        .map(([target, channel]) => [index, target, channel] as const));
  const sole = reached[0];
  if (reached.length > 1) return { ok: true, value: [instances, { tag: ResolutionTag.Ambiguous }] };
  if (sole !== undefined) {
    const [index, target, channel] = sole;
    const delivery: Input = {
      tag: InputTag.Deliver,
      payload: {
        occurrence: target, trigger: { tag: DeliveryTriggerTag.Message, channel }, correlation: publication.criteria,
        payload: publication.payload, variables: publication.variables, atMs,
      },
    };
    const member = instances[index];
    if (member === undefined) return { ok: false, error: "candidate-without-instance" };
    const stepped = step(hooks, member.deployment.program, member.state, delivery);
    if (!stepped.ok) return { ok: true, value: [instances, { tag: ResolutionTag.Failed, target, failure: stepped.failure }] };
    const updated = instances.map((candidate, position) => (position === index ? { ...member, state: stepped.value } : candidate));
    return { ok: true, value: [updated, { tag: ResolutionTag.Committed, target }] };
  }
  if (publication.mode === PublishMode.ExecutionsOnly) return { ok: true, value: [instances, { tag: ResolutionTag.NoMatch }] };
  const starts = startCandidates(registry, scope, publication.message);
  const only = starts[0];
  if (only === undefined) return { ok: true, value: [instances, { tag: ResolutionTag.NoMatch }] };
  if (starts.length > 1) return { ok: true, value: [instances, { tag: ResolutionTag.Ambiguous }] };
  return startFor(hooks, instances, publication, atMs, ...only);
}
