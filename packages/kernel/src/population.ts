/**
 * Population, transcribed from `Kernel/Population.lean`: mechanisms across process instances. Every input reaches
 * an instance through `step`; this layer only decides which instance an input goes to. Implemented: instances of
 * possibly different definitions, each driven by its own inputs, and Message key correlation with exact-cardinality
 * routing (docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md): a publication addresses one deployed definition,
 * process, Message channel and correlation key; the candidates are the open subscriptions of that definition's
 * instances that `Hooks.correlates` accepts; exactly one is delivered to, while zero or several reject the
 * publication and change no instance. Candidate order never picks a winner.
 *
 * A failure here is a harness refusal with a stable code, never a semantic outcome.
 */
import { ValueTag, compareStrings, mergeSort, type Program } from "./il/types.js";
import type { Hooks } from "./hooks.js";
import {
  InputTag,
  instanceOf,
  type Binding,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type State,
} from "./state.js";
import { context, step } from "./step.js";

/** Lean's `Except String α`: a population refusal is a harness error with a stable code. */
export type Refusable<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function accept<T>(value: T): Refusable<T> {
  return { ok: true, value };
}

function refuse<T>(error: string): Refusable<T> {
  return { ok: false, error };
}

/** The source overlay a definition was compiled with. */
export interface Overlay {
  readonly id: string;
  readonly sha256: string;
}

/**
 * A deployed definition's identity as a publication addresses it: definitions whose local identifiers agree but
 * whose source, overlay or profile differ are distinct.
 */
export interface DefinitionRef {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly overlay: Overlay | null;
  readonly profile: string;
}

/** Lean's derived `DecidableEq DefinitionRef`. */
export function definitionRefEquals(left: DefinitionRef, right: DefinitionRef): boolean {
  const overlays = left.overlay === null || right.overlay === null
    ? left.overlay === right.overlay
    : left.overlay.id === right.overlay.id && left.overlay.sha256 === right.overlay.sha256;
  return left.sourceId === right.sourceId && left.sourceSha256 === right.sourceSha256 && overlays &&
    left.profile === right.profile;
}

export interface Definition {
  readonly ref: DefinitionRef;
  readonly program: Program;
}

/** A correlated publication's address. */
export interface Address {
  readonly definition: DefinitionRef;
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
  NoMatch = "noMatch",
  Ambiguous = "ambiguous",
}

export type Resolution =
  | { readonly tag: ResolutionTag.Committed; readonly target: OccurrenceRef }
  | { readonly tag: ResolutionTag.NoMatch }
  | { readonly tag: ResolutionTag.Ambiguous };

/** `ingressOrdinal` numbers the publications in arrival order, from 1. */
export interface PublicationResult {
  readonly commandId: string;
  readonly ingressOrdinal: number;
  readonly resolution: Resolution;
}

export interface Result {
  readonly publications: readonly PublicationResult[];
  /** Ordered by process instance identifier, whatever order they started in. */
  readonly instances: readonly Instance[];
}

/** Start one instance and apply its inputs; each must commit. */
export function startInstance(
  hooks: Hooks,
  definition: Definition,
  inputs: readonly (readonly [string, Input])[],
): Refusable<Instance> {
  let state: State | null = null;
  for (const [commandId, input] of inputs) {
    const outcome = step(hooks, definition.program, state, input);
    if (!outcome.ok) {
      return refuse(`instance-input-not-committed:${commandId}`);
    }
    state = outcome.value;
  }
  return state === null ? refuse("instance-without-inputs") : accept({ definition, state });
}

export function occurrence(state: State, item: OpenItem): OccurrenceRef {
  return { processInstanceId: instanceOf(state, item.scope), element: item.element, activation: item.activation };
}

/**
 * The instances at the address's definition and process, by position, with each of their correlated subscriptions
 * that accepts `correlation`.
 */
export function candidates(
  hooks: Hooks,
  instances: readonly Instance[],
  address: Address,
  correlation: readonly Binding[],
): Refusable<readonly (readonly [number, OccurrenceRef])[]> {
  const found: (readonly [number, OccurrenceRef])[] = [];
  for (const [index, member] of instances.entries()) {
    const program = member.definition.program;
    if (!definitionRefEquals(member.definition.ref, address.definition) ||
      program.identity.processId !== address.processId) {
      continue;
    }
    const ctx = context(hooks, program);
    for (const item of member.state.openItems) {
      const accepts = hooks.correlates(ctx, item, address.channel, correlation, member.state);
      if (!accepts.ok) {
        return refuse("correlation-candidate-invalid");
      }
      if (accepts.value) {
        found.push([index, occurrence(member.state, item)]);
      }
    }
  }
  return accept(found);
}

/** Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. */
export function publish(
  hooks: Hooks,
  definitions: readonly Definition[],
  instances: readonly Instance[],
  ingressOrdinal: number,
  publication: Publication,
): Refusable<readonly [readonly Instance[], PublicationResult]> {
  const address = publication.address;
  if (!definitions.some((definition) =>
    definitionRefEquals(definition.ref, address.definition) &&
    definition.program.identity.processId === address.processId)) {
    return refuse("publication-unknown-definition");
  }
  if (publication.payload === "") {
    return refuse("publication-payload-empty");
  }
  const correlation: readonly Binding[] = [[address.correlationKey, { tag: ValueTag.String, value: publication.payload }]];
  const result = (resolution: Resolution): PublicationResult =>
    ({ commandId: publication.commandId, ingressOrdinal, resolution });
  const found = candidates(hooks, instances, address, correlation);
  if (!found.ok) {
    return found;
  }
  const [only, ...others] = found.value;
  if (only === undefined) {
    return accept([instances, result({ tag: ResolutionTag.NoMatch })]);
  }
  if (others.length > 0) {
    return accept([instances, result({ tag: ResolutionTag.Ambiguous })]);
  }
  const [index, target] = only;
  const delivery: Input = {
    tag: InputTag.Deliver,
    payload: { occurrence: target, channel: address.channel, correlation, payload: null },
  };
  const updated: Instance[] = [];
  for (const [position, member] of instances.entries()) {
    if (position !== index) {
      updated.push(member);
      continue;
    }
    const outcome = step(hooks, member.definition.program, member.state, delivery);
    if (!outcome.ok) {
      return refuse("correlated-delivery-not-committed");
    }
    updated.push({ ...member, state: outcome.value });
  }
  return accept([updated, result({ tag: ResolutionTag.Committed, target })]);
}

/** Start every instance, in order, then route every publication, in order. */
export function run(
  hooks: Hooks,
  definitions: readonly Definition[],
  scripts: readonly (readonly [Definition, readonly (readonly [string, Input])[]])[],
  publications: readonly Publication[],
): Refusable<Result> {
  let instances: readonly Instance[] = [];
  for (const [definition, inputs] of scripts) {
    const started = startInstance(hooks, definition, inputs);
    if (!started.ok) {
      return started;
    }
    instances = [...instances, started.value];
  }
  const ids = instances.map((member) => member.state.instanceId);
  if (new Set(ids).size !== ids.length) {
    return refuse("instance-id-duplicate");
  }
  const results: PublicationResult[] = [];
  for (const [position, publication] of publications.entries()) {
    const published = publish(hooks, definitions, instances, position + 1, publication);
    if (!published.ok) {
      return published;
    }
    instances = published.value[0];
    results.push(published.value[1]);
  }
  return accept({
    publications: results,
    instances: mergeSort(instances, (left, right) => compareStrings(left.state.instanceId, right.state.instanceId) <= 0),
  });
}
