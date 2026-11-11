/**
 * Population: Message publications, transcribed from `Kernel/Population/Messages.lean`: Message key correlation with
 * exact-cardinality routing ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { programPublicId, type Program } from "../il/types.js";
import type { Hooks } from "../hooks.js";
import {
  DeliveryTriggerTag,
  InputTag,
  instanceOf,
  occurrenceOf,
  type CorrelationMatch,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type State,
} from "../state.js";
import { context, step } from "../step.js";
import {
  DefinitionSelectorTag,
  MessageAddressTag,
  PublishMode,
  ResolutionTag,
  notImplemented,
  type Deployment,
  type Instance,
  type Publication,
  type Refusable,
  type Resolution,
} from "./contract.js";

function occurrence(program: Program, state: State, item: OpenItem): OccurrenceRef {
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
 * Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. Only a
 * publication to one deployment's executions on a channel, carrying criteria and nothing else, is implemented.
 */
export function publish(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  publication: Publication,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const selector = publication.definition;
  const message = publication.message;
  if (selector?.tag !== DefinitionSelectorTag.Deployment || message.tag !== MessageAddressTag.Channel ||
    publication.payload !== null || publication.variables.length > 0 || publication.businessKey !== null ||
    publication.mode !== PublishMode.ExecutionsOnly) {
    return { ok: true, value: [instances, notImplemented] };
  }
  if (!registry.some((deployment) => deployment.deploymentId === selector.deploymentId)) {
    return { ok: true, value: [instances, { tag: ResolutionTag.Rejected, code: "definition-not-deployed" }] };
  }
  const correlation = publication.criteria;
  const found = instances.flatMap((member, index) => member.deployment.deploymentId !== selector.deploymentId ? [] :
    matching(hooks, member.deployment.program, member.state, message.channel, correlation).map((ref) => [index, ref] as const));
  const sole = found[0];
  if (sole === undefined) return { ok: true, value: [instances, { tag: ResolutionTag.NoMatch }] };
  if (found.length > 1) return { ok: true, value: [instances, { tag: ResolutionTag.Ambiguous }] };
  const [index, target] = sole;
  const delivery: Input = {
    tag: InputTag.Deliver,
    payload: { occurrence: target, trigger: { tag: DeliveryTriggerTag.Message, channel: message.channel }, correlation, payload: null, variables: [], atMs: null },
  };
  const member = instances[index];
  if (member === undefined) return { ok: false, error: "candidate-without-instance" };
  const stepped = step(hooks, member.deployment.program, member.state, delivery);
  if (!stepped.ok) return { ok: true, value: [instances, { tag: ResolutionTag.Failed, target, failure: stepped.failure }] };
  const updated = instances.map((candidate, position) => (position === index ? { ...member, state: stepped.value } : candidate));
  return { ok: true, value: [updated, { tag: ResolutionTag.Committed, target }] };
}
