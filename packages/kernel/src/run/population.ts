/**
 * Kernel runner for population scenarios, transcribed from `Kernel/Run/Population.lean`: reads a population scenario
 * (`contracts/schemas/engine-population-scenario.schema.json`) into the population's stimuli and renders the
 * engine-population result (`contracts/schemas/engine-population-result.schema.json`). `run.ts` runs the stimuli,
 * because it is the one module that may import both registries. A malformed population scenario is a harness error,
 * these with stable codes: `population-time-backward`, `population-time-mismatch`, `population-unknown-definition`
 * and, for the deployment sources, `population-source-missing`, `population-sources-unused`,
 * `population-source-refused-shape` and `population-source-identity`.
 *
 * The harness passes one source per deployment, in deploy order: the definitions no `deploy` step names, in list order,
 * then every `deploy` step in step order, so the n-th source is what deployment ordinal n deploys (`population.ts`
 * numbers deployments by stimulus order). A source is the program assembled for that deployment, or `{"refused": code}`
 * for a definition the reader refused, which deploys as `deploymentRefused` with that code.
 */
import { assertNever, type Program } from "../il/types.js";
import { decodeProgram, isObject, type Decoded, type JsonValue } from "../il/codec.js";
import {
  channelFromJson,
  decodeBindings,
  decodeCorrelation,
  decodeSignalAddress,
  decodeStrictValue,
  failureCode,
  failureName,
  occurrenceFromJson,
} from "../il/codec/stimulus.js";
import type { Binding, Failure, State } from "../state.js";
import {
  CommandTag,
  DefinitionSelectorTag,
  DeploymentOutcomeTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  StimulusTag,
  type Command,
  type DefinitionSelector,
  type DeploymentRef,
  type DeploymentResult,
  type FanOutEntry,
  type Publication,
  type Receiver,
  type Resolution,
  type Result as PopulationResult,
  type Stimulus,
} from "../population.js";
import { arrayField, field, referenceJson, requiredString, stimulusOf, type ScenarioStimulus } from "./wire.js";
/** A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. */
export function definitionRefFromJson(resource: unknown, profile: string, where: string): DeploymentRef {
  const overlay = field(resource, "sourceOverlay", where);
  return {
    sourceId: requiredString(resource, "id", where),
    sourceSha256: requiredString(resource, "sha256", where),
    overlay: overlay === null ? null : { id: requiredString(overlay, "id", where), sha256: requiredString(overlay, "sha256", where) },
    profile,
  };
}

/** An instance step names its instance and definition; every step of one instance names the same definition. */
interface Script {
  readonly instanceId: string;
  readonly definitionRef: string;
}

/** A scenario definition: its reference and the BPMN resource it names. */
export interface Declared {
  readonly definitionRef: string;
  readonly ref: DeploymentRef;
}

export enum DeploymentSourceTag { Program = "program", Refused = "refused" }

/** What one deployment deploys: the program assembled for it, or the code the reader refused its source with. */
export type DeploymentSource =
  | { readonly tag: DeploymentSourceTag.Program; readonly program: Program }
  | { readonly tag: DeploymentSourceTag.Refused; readonly code: string };

/** A source file: `{"refused": code}` exactly, or a program. */
export function deploymentSourceFromJson(json: unknown, where: string): DeploymentSource {
  if (optional(json, "refused") === undefined) return { tag: DeploymentSourceTag.Program, program: decoded(decodeProgram(json), where) };
  const code = requiredString(json, "refused", where);
  if (Object.keys(json as object).length !== 1) harnessRefusal(where, "population-source-refused-shape", "a refused deployment names only its code");
  return { tag: DeploymentSourceTag.Refused, code };
}

/**
 * The deployment of `entry` at `atMs` from the next of `pending`, which it removes; a program must be the definition's
 * source under the scenario's profile.
 */
function deployStimulus(entry: Declared, atMs: number, pending: DeploymentSource[], where: string): Stimulus {
  const source = pending.shift();
  if (source === undefined) harnessRefusal(where, "population-source-missing", entry.definitionRef);
  switch (source.tag) {
    case DeploymentSourceTag.Refused:
      return { tag: StimulusTag.DeployRefused, definitionRef: entry.definitionRef, ref: entry.ref, code: source.code, atMs };
    case DeploymentSourceTag.Program: {
      const identity = source.program.identity;
      if (identity.sourceSha256 !== entry.ref.sourceSha256 || identity.profile !== entry.ref.profile) {
        harnessRefusal(where, "population-source-identity", entry.definitionRef);
      }
      return { tag: StimulusTag.Deploy, definitionRef: entry.definitionRef, ref: entry.ref, program: source.program, atMs };
    }
  }
  return assertNever(source);
}

/**
 * A malformed population scenario: a harness refusal with its stable code
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#message-key-correlation).
 */
function harnessRefusal(where: string, code: string, detail: string): never {
  throw new Error(`${where}: ${code}: ${detail}`);
}

function declaredOf(declared: readonly Declared[], definitionRef: string, where: string): Declared {
  return declared.find((entry) => entry.definitionRef === definitionRef) ??
    harnessRefusal(where, "population-unknown-definition", definitionRef);
}

export function decoded<T>(value: Decoded<T>, where: string): T {
  if (!value.ok) throw new Error(`${where}: ${value.refusal}`);
  return value.value;
}

/** Lean's `getObjValAs? Nat`. */
export function natural(json: unknown, key: string, where: string): number {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${where}: ${key}: Nat expected`);
  return value;
}

const optional = (json: unknown, key: string): unknown => (isObject(json) && Object.hasOwn(json, key) ? json[key] : undefined);

/** A command's optional business key. */
function businessKeyOf(json: unknown, where: string): string | null {
  return optional(json, "businessKey") === undefined ? null : requiredString(json, "businessKey", where);
}

/** `{processKey}` names a key's current deployment, `{deploymentId}` one deployment; absent, no definition. */
function selectorFromJson(json: unknown, where: string): DefinitionSelector | null {
  if (json === undefined) return null;
  if (optional(json, "processKey") !== undefined) {
    return { tag: DefinitionSelectorTag.ProcessKey, key: requiredString(json, "processKey", where) };
  }
  return { tag: DefinitionSelectorTag.Deployment, deploymentId: natural(json, "deploymentId", where) };
}

/** A discovery order's entry: `{kind: "occurrence", occurrence}` or `{kind: "start", deploymentId, startEvent}`. */
export function receiverFromJson(json: unknown, where: string): Receiver {
  const kind = requiredString(json, "kind", where);
  if (kind === "occurrence") return { tag: ReceiverTag.Occurrence, ref: decoded(occurrenceFromJson(field(json, "occurrence", where)), where) };
  if (kind === "start") {
    return { tag: ReceiverTag.Start, deploymentId: natural(json, "deploymentId", where), startEvent: requiredString(json, "startEvent", where) };
  }
  throw new Error(`${where}: unknown receiver kind ${kind}`);
}

function orderFromJson(json: unknown, where: string): readonly Receiver[] | null {
  return optional(json, "order") === undefined ? null : arrayField(json, "order", where).map((entry) => receiverFromJson(entry, where));
}

const publishModes: ReadonlyMap<string, PublishMode> = new Map(Object.values(PublishMode).map((mode) => [mode, mode]));

export function publicationFromJson(json: unknown, where: string): Publication {
  const address = field(json, "address", where);
  const channel = optional(address, "channel");
  const name = optional(address, "name");
  if ((channel === undefined) === (name === undefined)) throw new Error(`${where}: a publication names a channel or a name`);
  const mode = publishModes.get(requiredString(json, "mode", where));
  if (mode === undefined) throw new Error(`${where}: unknown publication mode`);
  const payload = optional(json, "payload");
  return {
    commandId: requiredString(json, "commandId", where),
    definition: selectorFromJson(optional(address, "definition"), where),
    message: channel === undefined
      ? { tag: MessageAddressTag.Name, name: requiredString(address, "name", where) }
      : { tag: MessageAddressTag.Channel, channel: decoded(channelFromJson(channel), where) },
    criteria: arrayField(json, "criteria", where).map((entry) => decoded(decodeCorrelation(entry), where)),
    payload: payload === undefined ? null : decoded(decodeStrictValue(payload), where),
    variables: decoded(decodeBindings(json, "variables"), where),
    businessKey: businessKeyOf(json, where),
    mode,
  };
}

/** A population command step, or `null` for another step kind. */
export function populationCommandFromJson(kind: string, json: unknown, where: string): Command | null {
  const commandId = (): string => requiredString(json, "commandId", where);
  const variables = (): readonly Binding[] => decoded(decodeBindings(json, "variables"), where);
  switch (kind) {
    case "publish":
      return { tag: CommandTag.Publish, publication: publicationFromJson(json, where) };
    case "broadcast":
      return {
        tag: CommandTag.Broadcast,
        broadcast: { commandId: commandId(), address: decoded(decodeSignalAddress(field(json, "address", where)), where), variables: variables(), order: orderFromJson(json, where) },
      };
    case "evaluateConditions":
      return {
        tag: CommandTag.EvaluateConditions,
        evaluation: {
          commandId: commandId(), definition: selectorFromJson(optional(json, "definition"), where), variables: variables(),
          businessKey: businessKeyOf(json, where), order: orderFromJson(json, where),
        },
      };
    case "timerStart":
      return {
        tag: CommandTag.TimerStart,
        timerStart: {
          commandId: commandId(), deploymentId: natural(json, "deploymentId", where),
          startEvent: requiredString(json, "startEvent", where), dueMs: natural(json, "dueMs", where),
        },
      };
  }
  return null;
}

/**
 * An instance step's input. Its stimulus keeps its own `at`, which must equal the step's when both are given; a step
 * `at` the stimulus lacks becomes the input's.
 */
function instanceInput(json: unknown, at: number | null, where: string): ScenarioStimulus {
  const stimulus = field(json, "stimulus", where);
  const own = optional(stimulus, "at");
  if (at === null || own !== undefined) {
    if (at !== null && own !== at) harnessRefusal(where, "population-time-mismatch", `stimulus at ${String(own)}, step at ${at}`);
    return stimulusOf(stimulus, where);
  }
  return stimulusOf({ ...(stimulus as Record<string, unknown>), at }, where);
}

/**
 * The population's stimuli, in scenario order: the definitions no `deploy` step names deploy at 0 in list order, then
 * every step at its logical time, which a step gives as `at` or inherits from the step before (0 for the first) and
 * which never decreases. Each deployment takes the next of `sources`, which must all be taken. `digests` holds each
 * step's digest of its content, which the harness computes.
 */
export function stimuliOfPopulation(declared: readonly Declared[], sources: readonly DeploymentSource[], steps: readonly unknown[],
  digests: readonly string[], where: string): Stimulus[] {
  if (digests.length !== steps.length) throw new Error(`${where}: ${steps.length} steps, ${digests.length} digests`);
  const deployedByStep = steps.flatMap((json) => requiredString(json, "kind", where) === "deploy"
    ? [declaredOf(declared, requiredString(json, "definitionRef", where), where).definitionRef] : []);
  const pending = [...sources];
  const stimuli: Stimulus[] = declared.filter((entry) => !deployedByStep.includes(entry.definitionRef))
    .map((entry) => deployStimulus(entry, 0, pending, where));
  const scripts: Script[] = [];
  let clock = 0;
  steps.forEach((json, index) => {
    const at = optional(json, "at") === undefined ? null : natural(json, "at", where);
    if (at !== null && at < clock) harnessRefusal(where, "population-time-backward", `step ${index} at ${at} after ${clock}`);
    clock = at ?? clock;
    const kind = requiredString(json, "kind", where);
    if (kind === "deploy") {
      const entry = declaredOf(declared, requiredString(json, "definitionRef", where), where);
      stimuli.push(deployStimulus(entry, clock, pending, where));
      return;
    }
    if (kind === "instance") {
      stimuli.push(instanceStimulus(declared, scripts, json, at, where));
      return;
    }
    const command = populationCommandFromJson(kind, json, where);
    if (command === null) throw new Error(`${where}: unsupported population step ${kind}`);
    stimuli.push({ tag: StimulusTag.Command, command, atMs: clock, digest: digests[index] ?? "" });
  });
  if (pending.length > 0) {
    harnessRefusal(where, "population-sources-unused", `${sources.length} deployment sources, ${sources.length - pending.length} deployments`);
  }
  return stimuli;
}

/** An instance step, with the scripts seen so far: an instance's start must name the step's instance. */
function instanceStimulus(declared: readonly Declared[], scripts: Script[], json: unknown, at: number | null, where: string): Stimulus {
  const script: Script = { instanceId: requiredString(json, "instanceId", where), definitionRef: requiredString(json, "definitionRef", where) };
  declaredOf(declared, script.definitionRef, where);
  const stimulus = field(json, "stimulus", where);
  if (isObject(stimulus) && stimulus["kind"] === "start") {
    const started = requiredString(stimulus, "instanceId", where);
    if (started !== script.instanceId) throw new Error(`${where}: step of ${script.instanceId} starts ${started}`);
  }
  const [commandId, input] = instanceInput(json, at, where);
  const index = scripts.findIndex((known) => known.instanceId === script.instanceId);
  if (index === -1) {
    scripts.push(script);
    return { tag: StimulusTag.Input, instanceId: script.instanceId, definitionRef: script.definitionRef, commandId, input };
  }
  if (scripts[index]?.definitionRef !== script.definitionRef) {
    throw new Error(`${where}: instance ${script.instanceId} names two definitions`);
  }
  return { tag: StimulusTag.Input, instanceId: script.instanceId, definitionRef: script.definitionRef, commandId, input };
}

export function failureFields(failure: Failure): Record<string, JsonValue> {
  return { outcome: failureName(failure), code: failureCode(failure) };
}

export function receiverJson(receiver: Receiver): JsonValue {
  switch (receiver.tag) {
    case ReceiverTag.Occurrence:
      return { kind: "occurrence", occurrence: referenceJson(receiver.ref) };
    case ReceiverTag.Start:
      return { kind: "start", deploymentId: receiver.deploymentId, startEvent: receiver.startEvent };
  }
  return assertNever(receiver);
}

export function fanOutEntryJson(entry: FanOutEntry): JsonValue {
  switch (entry.tag) {
    case FanOutEntryTag.Delivered:
      return { kind: "delivered", target: referenceJson(entry.target) };
    case FanOutEntryTag.Started:
      return {
        kind: "started", instanceId: entry.instanceId, deploymentId: entry.deploymentId, version: entry.version,
        startEvent: entry.startEvent,
      };
    case FanOutEntryTag.Skipped:
      return { kind: "skipped", target: referenceJson(entry.target) };
    case FanOutEntryTag.Failed:
      return { kind: "failed", target: receiverJson(entry.target), ...failureFields(entry.failure) };
  }
  return assertNever(entry);
}

/** A committed delivery's `cascade` member, left out when the cascade reached no receiver. */
function cascadeField(entries: readonly FanOutEntry[]): Readonly<Record<string, JsonValue>> {
  return entries.length === 0 ? {} : { cascade: entries.map(fanOutEntryJson) };
}

export function resolutionJson(resolution: Resolution): JsonValue {
  switch (resolution.tag) {
    case ResolutionTag.Committed:
      return { kind: "committed", target: referenceJson(resolution.target), ...cascadeField(resolution.cascade) };
    case ResolutionTag.Failed:
      return { kind: "failed", target: referenceJson(resolution.target), ...failureFields(resolution.failure) };
    case ResolutionTag.FanOut:
      return { kind: "fanOut", entries: resolution.entries.map(fanOutEntryJson) };
    case ResolutionTag.NoMatch:
      return { kind: "noMatch" };
    case ResolutionTag.Ambiguous:
      return { kind: "ambiguous" };
    case ResolutionTag.Rejected:
      return { kind: "rejected", code: resolution.code };
    case ResolutionTag.Unsupported:
      return { kind: "unsupported", code: resolution.code };
  }
  return assertNever(resolution);
}

function deploymentResultJson(deployment: DeploymentResult): JsonValue {
  const outcome = deployment.outcome;
  return {
    deploymentId: deployment.deploymentId,
    definitionRef: deployment.definitionRef,
    versions: deployment.versions.map(([key, version]) => ({ key, version })),
    outcome: outcome.tag === DeploymentOutcomeTag.Deployed ? { kind: "deployed" } : { kind: "deploymentRefused", code: outcome.code },
  };
}

/** The result document; `observe` renders an instance's state as the canonical result's state observation. */
export function populationResultJson(
  observe: (program: Program, state: State) => JsonValue,
  scenarioId: string,
  population: PopulationResult,
): JsonValue {
  const inputFailures = population.inputFailures.length === 0 ? {} : {
    inputFailures: population.inputFailures.map(([commandId, failure]) => ({ commandId, ...failureFields(failure) })),
  };
  const inputCascades = population.inputCascades.length === 0 ? {} : {
    inputCascades: population.inputCascades.map(([commandId, entries]) => ({ commandId, entries: entries.map(fanOutEntryJson) })),
  };
  return {
    ...inputFailures,
    ...inputCascades,
    kind: "enginePopulationResult",
    scenarioId,
    deployments: population.deployments.map(deploymentResultJson),
    steps: population.steps.map((stepped) => ({
      commandId: stepped.commandId, ordinal: stepped.ordinal, at: stepped.atMs, resolution: resolutionJson(stepped.resolution),
    })),
    processStates: population.instances.map((member) => observe(member.deployment.program, member.state)),
  };
}
