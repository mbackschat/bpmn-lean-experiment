/**
 * Exact-definition direct start: preparation recompiles the stored bytes and binds the start into an intent without
 * touching the host; the prepared start dispatches at most once; recovery compares the intent the host retained.
 */
import {
  requireWireString,
  snapshotOverlay,
  snapshotProfile,
  type EngineBinding,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineIntent,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceIdentity,
  type EngineSourceOverlaySelection,
  type JsonValue,
} from "./common.js";
import { atVersion, compileProgram, type CompiledDefinition } from "./definition.js";
import { engineProcessWorkflowId, type EngineHost } from "./host.js";
import { engineProcessLocatorForCanonicalProcess, type EngineProcessLocator } from "./process-locator.js";
import {
  EngineStartDescriptionStatus,
  StartDispatchKind,
  describeStart,
  dispatchStart,
  prepareStart,
  sameIntent,
  type PreparedStart,
} from "./start-dispatch.js";

/** The intent protocol of a direct start. */
export const engineDirectStartProtocol = "bpmn-kernel-direct-start";

export enum EngineDefinitionStartStatus {
  Admitted = "admitted",
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export enum EngineDefinitionStartIntegrityCode {
  CompilationRejected = "definitionCompilationRejected",
  IdentityDrift = "definitionIdentityDrift",
  ConstructorDrift = "directStartConstructorDrift",
}

export type EngineDefinitionStartPreparationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  profile: EngineProfile;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  expectedProcessId: string;
  /** The deployed version the platform stored the definition under. */
  version: number;
  processInstanceId: string;
  initialVariables: readonly EngineBinding[];
  limits: EngineLimits;
}>;

export type EngineDefinitionStartRequest = EngineDefinitionStartPreparationRequest & Readonly<{ host: EngineHost }>;

export type EnginePreparedDefinitionStartRequest = EngineDefinitionStartRequest & Readonly<{ expectedIntent: EngineIntent }>;

type Outcome<S extends EngineDefinitionStartStatus> = Readonly<{
  status: S;
  source: EngineSourceIdentity;
  definition: EngineDefinitionIdentity;
}>;

export type EnginePreparedDefinitionStart = Outcome<EngineDefinitionStartStatus.Admitted> & Readonly<{
  processInstanceId: string;
  locator: EngineProcessLocator;
  intent: EngineIntent;
}>;

export type EngineStartedDefinition = Outcome<EngineDefinitionStartStatus.Started> & Readonly<{ processInstanceId: string }>;

export type EngineDefinitionStartRefusal =
  Outcome<EngineDefinitionStartStatus.Rejected | EngineDefinitionStartStatus.IntegrityFailure> & Readonly<{ failure: EngineFailure }>;

export type EngineDefinitionStartPreparationResult = EnginePreparedDefinitionStart | EngineDefinitionStartRefusal;
export type EngineDefinitionStartResult = EngineStartedDefinition | EngineDefinitionStartRefusal;

export type EngineDefinitionStartDescriptionRequest = Readonly<{
  host: EngineHost;
  processInstanceId: string;
  expectedIntent: EngineIntent;
}>;

/** Recompiles and binds one direct start without a host call; the host only says what it serves. */
export async function prepareBpmnDefinitionVersionStart(
  request: EngineDefinitionStartPreparationRequest & Readonly<{ host: EngineHost }>,
): Promise<EngineDefinitionStartPreparationResult> {
  const prepared = await prepare(snapshot(request), request.host);
  if ("failure" in prepared) return prepared;
  return {
    status: EngineDefinitionStartStatus.Admitted,
    source: prepared.compiled.compilation.source,
    definition: prepared.compiled.compilation.definition,
    processInstanceId: prepared.processInstanceId,
    locator: engineProcessLocatorForCanonicalProcess(request.host.population.population, prepared.processInstanceId),
    intent: prepared.intent,
  };
}

/** Repeats preparation, refuses a start whose intent drifted, and starts at most once. */
export async function startPreparedBpmnDefinitionVersion(
  request: EnginePreparedDefinitionStartRequest,
): Promise<EngineDefinitionStartResult> {
  const expected = { protocol: request.expectedIntent.protocol, intentSha256: request.expectedIntent.intentSha256 };
  const prepared = await prepare(snapshot(request), request.host);
  if ("failure" in prepared) return prepared;
  const { source, definition } = prepared.compiled.compilation;
  if (!sameIntent(prepared.intent, expected)) {
    return {
      status: EngineDefinitionStartStatus.IntegrityFailure,
      source,
      definition,
      failure: {
        code: EngineDefinitionStartIntegrityCode.ConstructorDrift,
        evidence: "The recomputed start differs from the prepared intent.",
      },
    };
  }
  const dispatched = await dispatchStart(request.host, prepared);
  switch (dispatched.kind) {
    case StartDispatchKind.Started:
      return { status: EngineDefinitionStartStatus.Started, source, definition, processInstanceId: prepared.processInstanceId };
    case StartDispatchKind.Rejected:
      return { status: EngineDefinitionStartStatus.Rejected, source, definition, failure: dispatched.failure };
    case StartDispatchKind.IntegrityFailure:
      return { status: EngineDefinitionStartStatus.IntegrityFailure, source, definition, failure: dispatched.failure };
  }
}

/** Preparation followed by its own prepared start. */
export async function startBpmnDefinitionVersion(request: EngineDefinitionStartRequest): Promise<EngineDefinitionStartResult> {
  const prepared = await prepareBpmnDefinitionVersionStart(request);
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) return prepared;
  return startPreparedBpmnDefinitionVersion({ ...request, expectedIntent: prepared.intent });
}

/** Compares the intent the host retained for the instance with the expected one. */
export function describeBpmnDefinitionVersionStart(
  request: EngineDefinitionStartDescriptionRequest,
): Promise<EngineStartDescriptionStatus> {
  return describeStart(request.host, engineProcessWorkflowId(request.host.population.population, request.processInstanceId), {
    protocol: request.expectedIntent.protocol,
    intentSha256: request.expectedIntent.intentSha256,
  });
}

type Snapshot = Omit<EngineDefinitionStartPreparationRequest, "sourceOverlay"> & Readonly<{
  sourceOverlay: EngineSourceOverlaySelection | null;
}>;

function snapshot(request: EngineDefinitionStartPreparationRequest): Snapshot {
  if (!(request.bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceId: requireWireString(request.sourceId, "sourceId"),
    expectedSha256: requireWireString(request.expectedSha256, "expectedSha256"),
    profile: snapshotProfile(request.profile),
    sourceOverlay: snapshotOverlay(request.sourceOverlay),
    expectedProcessId: requireWireString(request.expectedProcessId, "expectedProcessId"),
    version: request.version,
    processInstanceId: requireWireString(request.processInstanceId, "processInstanceId"),
    initialVariables: request.initialVariables.map((binding) => ({
      name: requireWireString(binding.name, "initialVariables.name"),
      value: structuredClone(binding.value),
    })),
    limits: { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs },
  };
}

function expectedIdentity(snapshot: Snapshot): EngineDefinitionIdentity {
  return {
    ref: { definitionKey: snapshot.expectedProcessId, version: snapshot.version, sha256: snapshot.expectedSha256 },
    profile: snapshot.profile.id,
    sourceOverlay: snapshot.sourceOverlay === null ? null : { id: snapshot.sourceOverlay.id, sha256: snapshot.sourceOverlay.sha256 },
  };
}

async function prepare(snapshot: Snapshot, host: EngineHost): Promise<PreparedStart | EngineDefinitionStartRefusal> {
  const read = await compileProgram(snapshot);
  const definition = expectedIdentity(snapshot);
  if (!("program" in read)) {
    return integrityFailure(read.source, definition, EngineDefinitionStartIntegrityCode.CompilationRejected,
      read.diagnostics[0].evidence);
  }
  const compiled = atVersion(read, snapshot.version);
  if (!identityMatches(compiled, snapshot)) {
    return integrityFailure(compiled.compilation.source, definition, EngineDefinitionStartIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.");
  }
  const stimulus: JsonValue = {
    kind: "start",
    commandId: `start:${snapshot.processInstanceId}`,
    instanceId: snapshot.processInstanceId,
    variables: snapshot.initialVariables as unknown as JsonValue,
  };
  const prepared = prepareStart(host, engineDirectStartProtocol, compiled,
    engineProcessWorkflowId(host.population.population, snapshot.processInstanceId), snapshot.processInstanceId, stimulus);
  if ("code" in prepared) {
    return { status: EngineDefinitionStartStatus.Rejected, source: compiled.compilation.source, definition, failure: prepared };
  }
  return prepared;
}

function identityMatches(compiled: CompiledDefinition, snapshot: Snapshot): boolean {
  const { source, definition } = compiled.compilation;
  return source.id === snapshot.sourceId && source.sha256 === snapshot.expectedSha256 &&
    definition.ref.definitionKey === snapshot.expectedProcessId && definition.profile === snapshot.profile.id;
}

function integrityFailure(
  source: EngineSourceIdentity,
  definition: EngineDefinitionIdentity,
  code: EngineDefinitionStartIntegrityCode,
  evidence: string,
): EngineDefinitionStartRefusal {
  return { status: EngineDefinitionStartStatus.IntegrityFailure, source, definition, failure: { code, evidence } };
}
