/**
 * Exact-definition Message Start: the caller selects one published Message start capability and owns the instance,
 * command and Workflow identities (Product 2 derives them from its publication identity, so a repeated publication
 * reuses them); preparation binds the start into an intent, dispatch starts at most once, and recovery compares the
 * retained intent.
 */
import {
  requireWireString,
  sameJson,
  snapshotOverlay,
  snapshotProfile,
  type EngineFailure,
  type EngineIntent,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceOverlaySelection,
  type JsonValue,
} from "./common.js";
import {
  atVersion,
  compileProgram,
  type CompiledDefinition,
  type EngineMessageChannel,
  type EngineStartCapability,
} from "./definition.js";
import { engineProcessWorkflowId, type EngineHost } from "./host.js";
import {
  StartDispatchKind,
  describeStart,
  dispatchStart,
  prepareStart,
  sameIntent,
  type EngineStartDescriptionStatus,
  type PreparedStart,
} from "./start-dispatch.js";

export const engineMessageStartProtocol = "bpmn-kernel-message-start";

export enum EngineDefinitionMessageStartStatus {
  Admitted = "admitted",
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export enum EngineDefinitionMessageStartFailureCode {
  CompilationRejected = "definitionCompilationRejected",
  IdentityDrift = "definitionIdentityDrift",
  CapabilityDrift = "definitionStartCapabilityDrift",
  CapabilityNotSelected = "messageStartCapabilityNotSelected",
  ConstructorDrift = "messageStartConstructorDrift",
}

export type EngineMessageStartSelection = Readonly<{ startEventId: string; channel: EngineMessageChannel }>;

export type EngineDefinitionMessageStartPreparationRequest = Readonly<{
  host: EngineHost;
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  sourceId: string;
  expectedSha256: string;
  expectedByteLength: number;
  profile: EngineProfile;
  expectedProcessId: string;
  /** The deployed version the platform stored the definition under. */
  version: number;
  expectedStarts: readonly EngineStartCapability[];
  messageStart: EngineMessageStartSelection;
  processInstanceId: string;
  commandId: string;
  workflowId: string;
  limits: EngineLimits;
}>;

export type EngineDefinitionMessageStartRequest = EngineDefinitionMessageStartPreparationRequest & Readonly<{
  expectedIntent: EngineIntent;
}>;

type Refusal = Readonly<{
  status: EngineDefinitionMessageStartStatus.Rejected | EngineDefinitionMessageStartStatus.IntegrityFailure;
  failure: EngineFailure;
}>;

export type EngineDefinitionMessageStartPreparationResult =
  | Readonly<{ status: EngineDefinitionMessageStartStatus.Admitted; intent: EngineIntent }>
  | Refusal;

export type EngineDefinitionMessageStartResult =
  | Readonly<{ status: EngineDefinitionMessageStartStatus.Started }>
  | Refusal;

export type EngineDefinitionMessageStartDescriptionRequest = Readonly<{
  host: EngineHost;
  workflowId: string;
  expectedIntent: EngineIntent;
}>;

/** The canonical Workflow ID of a Message-started instance, the same address as a direct start's. */
export function engineDefinitionMessageStartWorkflowId(processInstanceId: string): string {
  return engineProcessWorkflowId(processInstanceId);
}

export async function prepareBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartPreparationRequest,
): Promise<EngineDefinitionMessageStartPreparationResult> {
  const prepared = await prepare(snapshot(request), request.host);
  return "failure" in prepared ? prepared : { status: EngineDefinitionMessageStartStatus.Admitted, intent: prepared.intent };
}

export async function startBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartRequest,
): Promise<EngineDefinitionMessageStartResult> {
  const expected = { protocol: request.expectedIntent.protocol, intentSha256: request.expectedIntent.intentSha256 };
  const prepared = await prepare(snapshot(request), request.host);
  if ("failure" in prepared) return prepared;
  if (!sameIntent(prepared.intent, expected)) {
    return integrityFailure(EngineDefinitionMessageStartFailureCode.ConstructorDrift,
      "The recomputed Message start differs from the prepared intent.");
  }
  const dispatched = await dispatchStart(request.host, prepared);
  switch (dispatched.kind) {
    case StartDispatchKind.Started:
      return { status: EngineDefinitionMessageStartStatus.Started };
    case StartDispatchKind.Rejected:
      return { status: EngineDefinitionMessageStartStatus.Rejected, failure: dispatched.failure };
    case StartDispatchKind.IntegrityFailure:
      return { status: EngineDefinitionMessageStartStatus.IntegrityFailure, failure: dispatched.failure };
  }
}

export function describeBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartDescriptionRequest,
): Promise<EngineStartDescriptionStatus> {
  return describeStart(request.host, requireWireString(request.workflowId, "workflowId"), {
    protocol: request.expectedIntent.protocol,
    intentSha256: request.expectedIntent.intentSha256,
  });
}

type Snapshot = Omit<EngineDefinitionMessageStartPreparationRequest, "host" | "sourceOverlay"> & Readonly<{
  sourceOverlay: EngineSourceOverlaySelection | null;
}>;

function snapshot(request: EngineDefinitionMessageStartPreparationRequest): Snapshot {
  if (!(request.bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceOverlay: snapshotOverlay(request.sourceOverlay),
    sourceId: requireWireString(request.sourceId, "sourceId"),
    expectedSha256: requireWireString(request.expectedSha256, "expectedSha256"),
    expectedByteLength: request.expectedByteLength,
    profile: snapshotProfile(request.profile),
    expectedProcessId: requireWireString(request.expectedProcessId, "expectedProcessId"),
    version: request.version,
    expectedStarts: structuredClone(request.expectedStarts),
    messageStart: structuredClone(request.messageStart),
    processInstanceId: requireWireString(request.processInstanceId, "processInstanceId"),
    commandId: requireWireString(request.commandId, "commandId"),
    workflowId: requireWireString(request.workflowId, "workflowId"),
    limits: { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs },
  };
}

async function prepare(snapshot: Snapshot, host: EngineHost): Promise<PreparedStart | Refusal> {
  const read = await compileProgram(snapshot);
  if (!("program" in read)) {
    return integrityFailure(EngineDefinitionMessageStartFailureCode.CompilationRejected, read.diagnostics[0].evidence);
  }
  const compiled = atVersion(read, snapshot.version);
  if (!identityMatches(compiled, snapshot)) {
    return integrityFailure(EngineDefinitionMessageStartFailureCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.");
  }
  const starts = compiled.compilation.capabilities.starts;
  if (!sameJson(starts, snapshot.expectedStarts)) {
    return integrityFailure(EngineDefinitionMessageStartFailureCode.CapabilityDrift,
      "Compiled start capabilities did not match the stored definition version.");
  }
  const selected = starts.filter((start) =>
    start.startEventId === snapshot.messageStart.startEventId && sameJson(start.channel, snapshot.messageStart.channel));
  if (selected.length !== 1) {
    return {
      status: EngineDefinitionMessageStartStatus.Rejected,
      failure: {
        code: EngineDefinitionMessageStartFailureCode.CapabilityNotSelected,
        evidence: "The definition does not publish exactly the selected Message start.",
      },
    };
  }
  const stimulus: JsonValue = {
    kind: "start",
    commandId: snapshot.commandId,
    instanceId: snapshot.processInstanceId,
    startEvent: snapshot.messageStart.startEventId,
    trigger: { kind: "message", channel: snapshot.messageStart.channel },
    variables: [],
  };
  const prepared = prepareStart(host, engineMessageStartProtocol, compiled, snapshot.workflowId, snapshot.processInstanceId,
    stimulus);
  return "code" in prepared ? { status: EngineDefinitionMessageStartStatus.Rejected, failure: prepared } : prepared;
}

function identityMatches(compiled: CompiledDefinition, snapshot: Snapshot): boolean {
  const { source, definition } = compiled.compilation;
  return source.id === snapshot.sourceId && source.sha256 === snapshot.expectedSha256 &&
    source.byteLength === snapshot.expectedByteLength && definition.ref.definitionKey === snapshot.expectedProcessId &&
    definition.profile === snapshot.profile.id;
}

function integrityFailure(code: EngineDefinitionMessageStartFailureCode, evidence: string): Refusal {
  return { status: EngineDefinitionMessageStartStatus.IntegrityFailure, failure: { code, evidence } };
}
