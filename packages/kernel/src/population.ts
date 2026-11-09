/**
 * Population, transcribed from `Kernel/Population.lean`: mechanisms across process instances
 * ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#population)). Every input reaches an instance through
 * `step`; this layer only decides which instance an input goes to. A scenario is one ordered list of stimuli mixing
 * instance inputs and population stimuli. Implemented: instances of possibly different definitions, each driven by its
 * own inputs, and Message key correlation with exact-cardinality routing
 * ([specification](../../../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#global-command-and-runtime-contract)): a
 * publication addresses one deployed definition, process, Message channel and correlation key; the candidates are the
 * open subscriptions of that definition's instances that `Hooks.correlates` accepts; exactly one is delivered to,
 * while zero or several reject the publication and change no instance. Candidate order never picks a winner.
 *
 * An instance input that does not commit and a delivery a target refuses are results, never harness errors. A harness
 * refusal, with a stable code, is a publication that names no deployed definition or carries an empty payload; a
 * candidate whose key cannot be evaluated is no match.
 */
import { ValueTag, assertNever, compareStrings, distinctCount, mergeSort, programPublicId, type Program } from "./il/types.js";
import type { Hooks } from "./hooks.js";
import {
  CriterionTargetTag,
  DeliveryTriggerTag,
  InputTag,
  instanceOf,
  occurrenceOf,
  type CorrelationMatch,
  type Failure,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type State,
} from "./state.js";
import { context, step } from "./step.js";

/** Lean's `Except String α`: a population refusal is a harness error with a stable code. */
export type Refusable<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** The source overlay a definition was compiled with. */
export interface Overlay {
  readonly id: string;
  readonly sha256: string;
}

/**
 * A deployed definition's identity as a publication addresses it: definitions whose local identifiers agree but whose
 * source, overlay or profile differ are distinct (specification, global command).
 */
export interface DeploymentRef {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly overlay: Overlay | null;
  readonly profile: string;
}

/** Lean's derived `DecidableEq DeploymentRef`. */
function deploymentRefEquals(left: DeploymentRef, right: DeploymentRef): boolean {
  const overlays = left.overlay === null || right.overlay === null
    ? left.overlay === right.overlay
    : left.overlay.id === right.overlay.id && left.overlay.sha256 === right.overlay.sha256;
  return left.sourceId === right.sourceId && left.sourceSha256 === right.sourceSha256 && overlays &&
    left.profile === right.profile;
}

export interface Definition {
  readonly ref: DeploymentRef;
  readonly program: Program;
}

/** A correlated publication's address. */
export interface Address {
  readonly definition: DeploymentRef;
  readonly processId: string;
  readonly channel: MessageChannel;
  readonly correlationKey: string;
}

/** A correlated publication carrying a String payload, the profile's one key domain. */
export interface Publication {
  readonly commandId: string;
  readonly address: Address;
  readonly payload: string;
}

export interface Instance {
  readonly definition: Definition;
  readonly state: State;
}

export enum ResolutionTag {
  Committed = "committed",
  Failed = "failed",
  NoMatch = "noMatch",
  Ambiguous = "ambiguous",
}

/** `failed`: the sole candidate refused the delivery; nothing changed. */
export type Resolution =
  | { readonly tag: ResolutionTag.Committed; readonly target: OccurrenceRef }
  | { readonly tag: ResolutionTag.Failed; readonly target: OccurrenceRef; readonly failure: Failure }
  | { readonly tag: ResolutionTag.NoMatch }
  | { readonly tag: ResolutionTag.Ambiguous };

/** `ingressOrdinal` numbers the publications in arrival order, from 1. */
export interface PublicationResult {
  readonly commandId: string;
  readonly ingressOrdinal: number;
  readonly resolution: Resolution;
}

export enum StimulusTag {
  Input = "input",
  Publish = "publish",
}

/** One population scenario stimulus, in scenario order: an input for the instance of `script`, or a publication. */
export type Stimulus =
  | {
      readonly tag: StimulusTag.Input;
      readonly script: number;
      readonly definition: Definition;
      readonly commandId: string;
      readonly input: Input;
    }
  | { readonly tag: StimulusTag.Publish; readonly publication: Publication };

export interface Result {
  readonly publications: readonly PublicationResult[];
  /** Ordered by process instance identifier, whatever order they started in. */
  readonly instances: readonly Instance[];
  /** The instance inputs that did not commit, with their failures. */
  readonly inputFailures: readonly (readonly [string, Failure])[];
}

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
 * The instances at the address's definition and process, by position, with each of their correlated subscriptions that
 * accepts `correlation`.
 */
function candidates(
  hooks: Hooks,
  instances: readonly Instance[],
  address: Address,
  correlation: readonly CorrelationMatch[],
): readonly (readonly [number, OccurrenceRef])[] {
  return instances.flatMap((member, index) => {
    const program = member.definition.program;
    if (!deploymentRefEquals(member.definition.ref, address.definition) || program.identity.processId !== address.processId) {
      return [];
    }
    return matching(hooks, program, member.state, address.channel, correlation).map((ref) => [index, ref] as const);
  });
}

/** Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. */
function publish(
  hooks: Hooks,
  definitions: readonly Definition[],
  instances: readonly Instance[],
  ingressOrdinal: number,
  publication: Publication,
): Refusable<readonly [readonly Instance[], PublicationResult]> {
  const address = publication.address;
  const known = definitions.some((definition) =>
    deploymentRefEquals(definition.ref, address.definition) && definition.program.identity.processId === address.processId);
  if (!known) return { ok: false, error: "publication-unknown-definition" };
  if (publication.payload.length === 0) return { ok: false, error: "publication-payload-empty" };
  const correlation: readonly CorrelationMatch[] = [{
    target: { tag: CriterionTargetTag.ProcessVariable, name: address.correlationKey },
    expected: { tag: ValueTag.String, value: publication.payload },
  }];
  const result = (resolution: Resolution): PublicationResult => ({ commandId: publication.commandId, ingressOrdinal, resolution });
  const found = candidates(hooks, instances, address, correlation);
  const sole = found[0];
  if (sole === undefined) return { ok: true, value: [instances, result({ tag: ResolutionTag.NoMatch })] };
  if (found.length > 1) return { ok: true, value: [instances, result({ tag: ResolutionTag.Ambiguous })] };
  const [index, target] = sole;
  const delivery: Input = {
    tag: InputTag.Deliver,
    payload: { occurrence: target, trigger: { tag: DeliveryTriggerTag.Message, channel: address.channel }, correlation, payload: null, atMs: null },
  };
  const member = instances[index];
  if (member === undefined) return { ok: false, error: "candidate-without-instance" };
  const stepped = step(hooks, member.definition.program, member.state, delivery);
  if (!stepped.ok) return { ok: true, value: [instances, result({ tag: ResolutionTag.Failed, target, failure: stepped.failure })] };
  const updated = instances.map((candidate, position) => (position === index ? { ...member, state: stepped.value } : candidate));
  return { ok: true, value: [updated, result({ tag: ResolutionTag.Committed, target })] };
}

/** What a run has done so far: instances by script, publication results and input failures. */
interface Progress {
  readonly instances: readonly (readonly [number, Instance])[];
  readonly publications: readonly PublicationResult[];
  readonly inputFailures: readonly (readonly [string, Failure])[];
}

/** Apply one stimulus. A publication sees the instances started so far. */
function apply(hooks: Hooks, definitions: readonly Definition[], progress: Progress, stimulus: Stimulus): Refusable<Progress> {
  switch (stimulus.tag) {
    case StimulusTag.Input: {
      const before = progress.instances.find(([script]) => script === stimulus.script)?.[1].state ?? null;
      const stepped = step(hooks, stimulus.definition.program, before, stimulus.input);
      if (!stepped.ok) {
        return { ok: true, value: { ...progress, inputFailures: [...progress.inputFailures, [stimulus.commandId, stepped.failure]] } };
      }
      const others = progress.instances.filter(([script]) => script !== stimulus.script);
      const instance: Instance = { definition: stimulus.definition, state: stepped.value };
      return { ok: true, value: { ...progress, instances: [...others, [stimulus.script, instance]] } };
    }
    case StimulusTag.Publish: {
      const ordinal = progress.publications.length + 1;
      const scripts = progress.instances.map(([script]) => script);
      const published = publish(hooks, definitions, progress.instances.map(([, instance]) => instance), ordinal, stimulus.publication);
      if (!published.ok) return published;
      const [instances, outcome] = published.value;
      return {
        ok: true,
        value: {
          ...progress,
          instances: scripts.flatMap((script, index) => {
            const instance = instances[index];
            return instance === undefined ? [] : [[script, instance] as const];
          }),
          publications: [...progress.publications, outcome],
        },
      };
    }
  }
  return assertNever(stimulus);
}

/** Fold the stimuli in order. */
export function run(hooks: Hooks, definitions: readonly Definition[], stimuli: readonly Stimulus[]): Refusable<Result> {
  let progress: Progress = { instances: [], publications: [], inputFailures: [] };
  for (const stimulus of stimuli) {
    const next = apply(hooks, definitions, progress, stimulus);
    if (!next.ok) return next;
    progress = next.value;
  }
  const ids = progress.instances.map(([, instance]) => instance.state.instanceId);
  if (distinctCount(ids) !== ids.length) return { ok: false, error: "instance-id-duplicate" };
  return {
    ok: true,
    value: {
      publications: progress.publications,
      inputFailures: progress.inputFailures,
      instances: mergeSort(progress.instances.map(([, instance]) => instance), (left, right) =>
        compareStrings(left.state.instanceId, right.state.instanceId) <= 0),
    },
  };
}
