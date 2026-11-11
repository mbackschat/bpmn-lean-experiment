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
  overlayIdentity,
  requireBytes,
  requireWireString,
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
import { engineDefinitionCapabilitiesFromJson, type EngineDefinitionCapabilities } from "./definition-capabilities.js";

/** `Kernel.Host.Requirements`: what a program needs from its host. */
export type EngineHostRequirements = ReturnType<typeof hostRequirements>;

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
      capabilities: engineDefinitionCapabilitiesFromJson(capabilitiesJson(definitionCapabilities(decoded.value))),
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
