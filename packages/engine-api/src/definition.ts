/**
 * Compilation: the kernel reader turns exact BPMN bytes into the kernel IL under the profile's options, kernel admission
 * accepts or refuses it with a stable code, and the accepted definition publishes what a host needs before any instance
 * runs (`Kernel.Host.hostRequirements`, `definitionCapabilities`). The program itself stays inside Product 1.
 */
import { declaredSourceEncoding, kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import {
  admit,
  capabilitiesJson,
  decodeProgram,
  definitionCapabilities,
  hostRequirements,
} from "@bpmn-lean/kernel";

import {
  member,
  overlayIdentity,
  requireBytes,
  requireWireString,
  sameJson,
  sha256Hex,
  snapshotOverlay,
  snapshotProfile,
  type EngineDefinitionIdentity,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceIdentity,
  type EngineSourceOverlaySelection,
  type JsonValue,
} from "./common.js";

/** `Kernel.Host.Requirements`: what a program needs from its host. */
export type EngineHostRequirements = ReturnType<typeof hostRequirements>;

/** A Message channel in the scenario contract's `messageChannel` form (`channelToJson`). */
export type EngineMessageChannel =
  | Readonly<{ kind: "operationMessage"; interfaceId: string; interfaceOperationId: string; messageId: string }>
  | Readonly<{ kind: "directMessage"; messageId: string }>
  | Readonly<{ kind: "unspecifiedMessage" }>;

/**
 * A Timer start's schedule as the kernel resolves it from the definition (`Kernel.IL.Timer.resolve`): one delay, one
 * instant, a cycle's period and its repetitions (`null` unbounded), or a Cron expression's text. Admission refuses every
 * other form.
 */
export type EngineTimerSchedule =
  | Readonly<{ durationMs: number }>
  | Readonly<{ instantMs: number }>
  | Readonly<{ cycle: Readonly<{ periodMs: number; repetitions: number | null }> }>
  | Readonly<{ cron: string }>;

function naturalOf(json: unknown, name: string): number {
  if (typeof json !== "number" || !Number.isSafeInteger(json) || json < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return json;
}

function onlyMember(json: unknown, keys: readonly string[], name: string): string {
  if (json === null || typeof json !== "object" || Array.isArray(json)) throw new TypeError(`${name} must be an object`);
  const present = Object.keys(json);
  const [key] = present;
  if (present.length !== 1 || key === undefined || !keys.includes(key)) {
    throw new TypeError(`${name} must have exactly one member of ${JSON.stringify(keys)}`);
  }
  return key;
}

/**
 * A Timer start's schedule from the kernel's rendering (`Kernel.Run.resolvedTimerJson`), member by member. A rendering
 * outside the contract is a Product 1 defect, so it throws `TypeError` rather than offering a schedule.
 */
export function engineTimerScheduleFromJson(json: unknown): EngineTimerSchedule {
  const name = "Timer start schedule";
  const key = onlyMember(json, ["durationMs", "instantMs", "cycle", "cron"], name);
  const value = member(json, key);
  switch (key) {
    case "durationMs": return { durationMs: naturalOf(value, `${name}.durationMs`) };
    case "instantMs": return { instantMs: naturalOf(value, `${name}.instantMs`) };
    case "cron": return { cron: requireWireString(value, `${name}.cron`) };
    case "cycle": {
      const keys = value !== null && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : null;
      if (keys === null || !sameJson(keys, ["periodMs", "repetitions"])) {
        throw new TypeError(`${name}.cycle must have exactly periodMs and repetitions`);
      }
      const repetitions = member(value, "repetitions");
      return {
        cycle: {
          periodMs: naturalOf(member(value, "periodMs"), `${name}.cycle.periodMs`),
          repetitions: repetitions === null ? null : naturalOf(repetitions, `${name}.cycle.repetitions`),
        },
      };
    }
  }
  throw new TypeError(`${name} has no member ${key}`);
}

/** One start a host can offer: a none start (neither field), a Message start on its channel, or a Timer start. */
export type EngineStartCapability = Readonly<{
  startEventId: string;
  channel: EngineMessageChannel | null;
  timer: EngineTimerSchedule | null;
}>;

/** A correlation criterion: the correlation key and the expression bound to its value, in the kernel IL's form. */
export type EngineCorrelationCriterion = Readonly<{ key: string; value: JsonValue }>;

/**
 * The correlated catches on one Message channel: each element that waits correlated on it, and the criteria the
 * kernel evaluates in the waiting instance when a publication is matched.
 */
export type EngineCorrelatedChannel = Readonly<{
  channel: EngineMessageChannel;
  catches: readonly Readonly<{ elementId: string; criteria: readonly EngineCorrelationCriterion[] }>[];
}>;

export type EngineDefinitionCapabilities = Readonly<{
  starts: readonly EngineStartCapability[];
  correlatedChannels: readonly EngineCorrelatedChannel[];
}>;

export type EngineDiagnostic = Readonly<{ code: string; element: string | null; evidence: string }>;

export enum EngineDefinitionCompilationStatus {
  Accepted = "accepted",
  Rejected = "rejected",
}

export type EngineDefinitionCompilationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  /** When given, a source with another digest is refused before parsing. */
  expectedSha256?: string;
  profile: EngineProfile;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  limits: EngineLimits;
}>;

export type EngineAcceptedDefinitionCompilation = Readonly<{
  status: EngineDefinitionCompilationStatus.Accepted;
  source: EngineSourceIdentity;
  definition: EngineDefinitionIdentity;
  hostRequirements: EngineHostRequirements;
  capabilities: EngineDefinitionCapabilities;
}>;

export type EngineRejectedDefinitionCompilation = Readonly<{
  status: EngineDefinitionCompilationStatus.Rejected;
  source: EngineSourceIdentity;
  diagnostics: readonly [EngineDiagnostic];
}>;

export type EngineDefinitionCompilationResult = EngineAcceptedDefinitionCompilation | EngineRejectedDefinitionCompilation;

/** An accepted compilation together with the program the host runs; internal to Product 1. */
export type CompiledDefinition = Readonly<{
  compilation: EngineAcceptedDefinitionCompilation;
  program: JsonValue;
}>;

export async function compileBpmnDefinition(
  request: EngineDefinitionCompilationRequest,
): Promise<EngineDefinitionCompilationResult> {
  const compiled = await compileProgram(request);
  return "program" in compiled ? compiled.compilation : compiled;
}

/** Reads, decodes and admits one source; every refusal is one diagnostic with its stable code. */
export async function compileProgram(
  request: EngineDefinitionCompilationRequest,
): Promise<CompiledDefinition | EngineRejectedDefinitionCompilation> {
  const bytes = requireBytes(request.bytes, "bytes");
  const sourceId = requireWireString(request.sourceId, "sourceId");
  const profile = snapshotProfile(request.profile);
  const overlay = snapshotOverlay(request.sourceOverlay);
  const limits = { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs };
  const unread: EngineSourceIdentity = {
    id: sourceId,
    sha256: sha256Hex(bytes),
    byteLength: bytes.byteLength,
    declaredEncoding: declaredSourceEncoding(bytes),
    decodedAs: null,
  };
  const rejected = (source: EngineSourceIdentity, code: string, element: string | null, evidence: string):
    EngineRejectedDefinitionCompilation =>
    ({ status: EngineDefinitionCompilationStatus.Rejected, source, diagnostics: [{ code, element, evidence }] });
  const read = await readKernelProgram({
    bytes,
    ...(request.expectedSha256 === undefined ? {} : { expectedSha256: request.expectedSha256 }),
    overlay,
    profile: profile.id,
    limits,
  }, kernelProfileOptions(profile.relations));
  if (read.kind === "refused") return rejected(unread, read.code, read.element, read.evidence);
  // The reader decodes only UTF-8 and refuses every other declared encoding.
  const source: EngineSourceIdentity = { ...unread, decodedAs: "UTF-8" };
  // The reader's output is plain JSON; a round trip drops nothing and detaches it from the reader.
  const programJson = JSON.parse(JSON.stringify(read.program)) as JsonValue;
  const decoded = decodeProgram(programJson);
  if (!decoded.ok) return rejected(source, "kernel.decode", null, decoded.refusal);
  const refusal = admit(decoded.value);
  if (refusal !== null) return rejected(source, refusal, null, `Kernel admission refused the definition: ${refusal}.`);
  const capabilities = capabilitiesJson(definitionCapabilities(decoded.value));
  return {
    program: programJson,
    compilation: {
      status: EngineDefinitionCompilationStatus.Accepted,
      source,
      definition: {
        ref: { definitionKey: decoded.value.identity.processId, version: null, sha256: source.sha256 },
        profile: profile.id,
        sourceOverlay: overlayIdentity(overlay),
      },
      hostRequirements: hostRequirements(decoded.value),
      capabilities: {
        starts: (member(capabilities, "starts") as readonly JsonValue[]).map((start) => ({
          startEventId: member(start, "startEventId") as string,
          channel: (member(start, "channel") ?? null) as EngineMessageChannel | null,
          timer: member(start, "timer") === undefined ? null : engineTimerScheduleFromJson(member(start, "timer")),
        })),
        correlatedChannels: member(capabilities, "correlatedChannels") as readonly EngineCorrelatedChannel[],
      },
    },
  };
}

/** The compiled definition as the deployed `version` the platform stored it under. */
export function atVersion(compiled: CompiledDefinition, version: number): CompiledDefinition {
  if (!Number.isSafeInteger(version) || version <= 0) throw new RangeError("version must be a positive safe integer");
  const { compilation } = compiled;
  return {
    program: compiled.program,
    compilation: {
      ...compilation,
      definition: { ...compilation.definition, ref: { ...compilation.definition.ref, version } },
    },
  };
}

/** The host capability names, one per `EngineHostRequirements` flag, in the order refusals are reported. */
export type EngineHostCapability = "timers" | "messages" | "effects" | "userTasks" | "calls";

/** What a deployment's Workers serve; a program needing an unserved capability is refused before it starts. */
export type EngineServedRequirements = Readonly<Record<EngineHostCapability, boolean>>;

/**
 * The host refusal table: the stable code for each requirement a deployment does not serve. `maxConcurrentWaits` has
 * no entry: the Temporal host derives its Continue-As-New budget from it and bounds nothing.
 */
export const engineHostRefusalCodes: Readonly<Record<EngineHostCapability, string>> = {
  timers: "host.timers",
  messages: "host.messages",
  effects: "host.effects",
  userTasks: "host.userTasks",
  calls: "host.calls",
};

/** The first requirement `served` lacks, as its refusal code; `null` when the deployment can host the program. */
export function engineHostRefusal(requirements: EngineHostRequirements, served: EngineServedRequirements): string | null {
  const unserved = (Object.keys(engineHostRefusalCodes) as EngineHostCapability[])
    .find((capability) => requirements[capability] && !served[capability]);
  return unserved === undefined ? null : engineHostRefusalCodes[unserved];
}
