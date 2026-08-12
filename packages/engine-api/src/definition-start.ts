/** Exact-definition direct-start preparation, one-shot creation, and retained comparison. */
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceIdentity,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import {
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  TemporalDefinitionStartDescriptionResultKind,
  TemporalDefinitionStartPreparationResultKind,
  TemporalPreparedDefinitionStartResultKind,
  describeTemporalDefinitionStart,
  prepareTemporalDefinitionStart,
  startPreparedTemporalDefinition,
  temporalDefinitionStartWorkflowId,
  temporalDefinitionStartWorkflowType,
} from "@bpmn-lean/temporal-client/definition-start";
import type {
  TemporalDefinitionStartClient,
  TemporalDefinitionStartIntent,
} from "@bpmn-lean/temporal-client/definition-start";

import type { EngineDefinitionIdentity } from "./index.js";
import {
  engineProcessWorkLocatorForCanonicalProcess,
} from "./process-work.js";
import type {
  EngineProcessWorkLocator,
} from "./process-work.js";

export const EngineDefinitionStartStatus = {
  Admitted: "admitted",
  Started: "started",
  Rejected: "rejected",
  IntegrityFailure: "integrityFailure",
} as const;

export type EngineDefinitionStartStatus =
  typeof EngineDefinitionStartStatus[keyof typeof EngineDefinitionStartStatus];

export const EngineDefinitionStartIntegrityCode = {
  CompilationRejected: "definitionCompilationRejected",
  IdentityDrift: "definitionIdentityDrift",
  ConstructorDrift: "directStartConstructorDrift",
} as const;

export type EngineDefinitionStartIntegrityCode =
  typeof EngineDefinitionStartIntegrityCode[
    keyof typeof EngineDefinitionStartIntegrityCode
  ];

export type EngineDefinitionStartIntent = TemporalDefinitionStartIntent;

export type EngineDefinitionStartPreparationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  processInstanceId: string;
  limits: BpmnSourceLimits;
  taskQueue: string;
}>;

export type EngineDefinitionStartRequest =
  EngineDefinitionStartPreparationRequest & Readonly<{
    temporalClient: TemporalDefinitionStartClient;
  }>;

export type EnginePreparedDefinitionStartRequest =
  EngineDefinitionStartRequest & Readonly<{
    expectedIntent: EngineDefinitionStartIntent;
  }>;

export type EngineDefinitionStartFailure = DeepReadonly<{
  code: string;
  evidence: string;
}>;

export type EnginePreparedDefinitionStart =
  DeepReadonly<{
    status: typeof EngineDefinitionStartStatus.Admitted;
    source: BpmnSourceIdentity;
    definition: EngineDefinitionIdentity;
    processInstanceId: string;
    intent: EngineDefinitionStartIntent;
  }> & Readonly<{
    locator: EngineProcessWorkLocator;
  }>;

export type EngineStartedDefinition = DeepReadonly<{
  status: typeof EngineDefinitionStartStatus.Started;
  source: BpmnSourceIdentity;
  definition: EngineDefinitionIdentity;
  processInstanceId: string;
}>;

export type EngineRejectedDefinitionStart = DeepReadonly<{
  status: typeof EngineDefinitionStartStatus.Rejected;
  source: BpmnSourceIdentity;
  definition: EngineDefinitionIdentity;
  failure: EngineDefinitionStartFailure;
}>;

export type EngineDefinitionStartIntegrityFailure = DeepReadonly<{
  status: typeof EngineDefinitionStartStatus.IntegrityFailure;
  source: BpmnSourceIdentity;
  definition: EngineDefinitionIdentity;
  failure: EngineDefinitionStartFailure;
}>;

export type EngineDefinitionStartPreparationResult =
  | EnginePreparedDefinitionStart
  | EngineRejectedDefinitionStart
  | EngineDefinitionStartIntegrityFailure;

export type EngineDefinitionStartResult =
  | EngineStartedDefinition
  | EngineRejectedDefinitionStart
  | EngineDefinitionStartIntegrityFailure;

export enum EngineDefinitionStartDescriptionStatus {
  Matching = "matching",
  Missing = "missing",
  Divergent = "divergent",
  Unavailable = "unavailable",
}

export type EngineDefinitionStartDescriptionRequest = Readonly<{
  temporalClient: TemporalDefinitionStartClient;
  processInstanceId: string;
  taskQueue: string;
  expectedIntent: EngineDefinitionStartIntent;
}>;

export type EngineDefinitionStartDescriptionResult = Readonly<{
  status: EngineDefinitionStartDescriptionStatus;
}>;

/** Recompiles and admits one immutable direct-start intent without an SDK call. */
export async function prepareBpmnDefinitionVersionStart(
  request: EngineDefinitionStartPreparationRequest,
): Promise<EngineDefinitionStartPreparationResult> {
  const snapshot = snapshotPreparationRequest(request);
  const prepared = await prepareSnapshot(snapshot);
  return "compilation" in prepared
    ? admittedResult(prepared, snapshot)
    : prepared;
}

/** Repeats exact construction, checks the persisted marker, and starts at most once. */
export async function startPreparedBpmnDefinitionVersion(
  request: EnginePreparedDefinitionStartRequest,
): Promise<EngineDefinitionStartResult> {
  const snapshot = snapshotStartRequest(request);
  const expectedIntent = {
    protocol: request.expectedIntent.protocol,
    intentSha256: request.expectedIntent.intentSha256,
  };
  return startPreparedSnapshot(snapshot, expectedIntent);
}

/** Preserves the existing single-call API as prepare followed by its exact prepared start. */
export async function startBpmnDefinitionVersion(
  request: EngineDefinitionStartRequest,
): Promise<EngineDefinitionStartResult> {
  const snapshot = snapshotStartRequest(request);
  const prepared = await prepareSnapshot(snapshot);
  if (!("compilation" in prepared)) {
    return prepared;
  }
  return startPreparedSnapshot(snapshot, prepared.intent, prepared);
}

/** Compares the exact retained marker, Workflow type, address, and Task Queue. */
export async function describeBpmnDefinitionVersionStart(
  request: EngineDefinitionStartDescriptionRequest,
): Promise<EngineDefinitionStartDescriptionResult> {
  const processInstanceId = requireNonemptyWireString(
    request.processInstanceId,
    "processInstanceId",
  );
  const taskQueue = requireNonemptyWireString(request.taskQueue, "taskQueue");
  const expectedIntent = snapshotIntent(request.expectedIntent);
  const workflowId = temporalDefinitionStartWorkflowId(processInstanceId);
  const described = await describeTemporalDefinitionStart(
    request.temporalClient,
    workflowId,
  );
  switch (described.kind) {
    case TemporalDefinitionStartDescriptionResultKind.Missing:
      return { status: EngineDefinitionStartDescriptionStatus.Missing };
    case TemporalDefinitionStartDescriptionResultKind.Unavailable:
      return { status: EngineDefinitionStartDescriptionStatus.Unavailable };
    case TemporalDefinitionStartDescriptionResultKind.Found: {
      const retained = described.description;
      return {
        status:
          retained.workflowId === workflowId &&
            retained.workflowType === temporalDefinitionStartWorkflowType &&
            retained.taskQueue === taskQueue &&
            retained.intentSha256 === expectedIntent.intentSha256
            ? EngineDefinitionStartDescriptionStatus.Matching
            : EngineDefinitionStartDescriptionStatus.Divergent,
      };
    }
  }
}

type PreparationSnapshot = Omit<
  EngineDefinitionStartPreparationRequest,
  "bytes" | "limits"
> & Readonly<{
  bytes: Uint8Array;
  limits: BpmnSourceLimits;
}>;

type StartSnapshot = PreparationSnapshot & Readonly<{
  temporalClient: TemporalDefinitionStartClient;
}>;

type PreparedStart = Readonly<{
  compilation: AcceptedBpmnCompilation;
  start: StartProcessStimulus;
  intent: EngineDefinitionStartIntent;
}>;

async function prepareSnapshot(
  snapshot: PreparationSnapshot,
): Promise<PreparedStart | Exclude<
  EngineDefinitionStartPreparationResult,
  EnginePreparedDefinitionStart
>> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: snapshot.bytes,
    sourceId: snapshot.sourceId,
    expectedSha256: snapshot.expectedSha256,
    semanticProfile: snapshot.semanticProfile,
    sourceOverlay: null,
    limits: snapshot.limits,
  });
  const expectedDefinition = definitionIdentity(snapshot);
  if (compilation.status === BpmnCompilationStatus.Rejected) {
    return integrityFailure(
      compilation.source,
      expectedDefinition,
      EngineDefinitionStartIntegrityCode.CompilationRejected,
      compilation.diagnostics[0]?.evidence ??
        "Stored definition recompilation was rejected.",
    );
  }
  if (!compiledIdentityMatches(compilation, snapshot)) {
    return integrityFailure(
      compilation.source,
      expectedDefinition,
      EngineDefinitionStartIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.",
    );
  }
  const start = startStimulus(snapshot, compilation);
  const temporal = prepareTemporalDefinitionStart({
    start,
    semanticProcess: compilation.semanticProcess,
    workflowId: temporalDefinitionStartWorkflowId(snapshot.processInstanceId),
    taskQueue: snapshot.taskQueue,
  });
  switch (temporal.kind) {
    case TemporalDefinitionStartPreparationResultKind.Rejected:
      return {
        status: EngineDefinitionStartStatus.Rejected,
        source: compilation.source,
        definition: expectedDefinition,
        failure: temporal.failure,
      };
    case TemporalDefinitionStartPreparationResultKind.Admitted:
      return { compilation, start, intent: temporal.intent };
  }
}

async function startPreparedSnapshot(
  snapshot: StartSnapshot,
  expectedIntent: EngineDefinitionStartIntent,
  existing?: PreparedStart,
): Promise<EngineDefinitionStartResult> {
  const prepared = existing ?? await prepareSnapshot(snapshot);
  if (!("compilation" in prepared)) {
    return prepared;
  }
  const started = await startPreparedTemporalDefinition(
    snapshot.temporalClient,
    {
      start: prepared.start,
      semanticProcess: prepared.compilation.semanticProcess,
      workflowId: temporalDefinitionStartWorkflowId(snapshot.processInstanceId),
      taskQueue: snapshot.taskQueue,
      expectedIntent,
    },
  );
  switch (started.kind) {
    case TemporalPreparedDefinitionStartResultKind.Started:
      return {
        status: EngineDefinitionStartStatus.Started,
        source: prepared.compilation.source,
        definition: definitionIdentity(snapshot),
        processInstanceId: snapshot.processInstanceId,
      };
    case TemporalPreparedDefinitionStartResultKind.Rejected:
      return {
        status: EngineDefinitionStartStatus.Rejected,
        source: prepared.compilation.source,
        definition: definitionIdentity(snapshot),
        failure: started.failure,
      };
    case TemporalPreparedDefinitionStartResultKind.IntegrityFailure:
      return integrityFailure(
        prepared.compilation.source,
        definitionIdentity(snapshot),
        EngineDefinitionStartIntegrityCode.ConstructorDrift,
        started.failure.evidence,
      );
  }
}

function admittedResult(
  prepared: PreparedStart,
  snapshot: PreparationSnapshot,
): EnginePreparedDefinitionStart {
  return {
    status: EngineDefinitionStartStatus.Admitted,
    source: prepared.compilation.source,
    definition: definitionIdentity(snapshot),
    processInstanceId: snapshot.processInstanceId,
    locator: engineProcessWorkLocatorForCanonicalProcess(
      snapshot.processInstanceId,
    ),
    intent: prepared.intent,
  };
}

function snapshotPreparationRequest(
  request: EngineDefinitionStartPreparationRequest,
): PreparationSnapshot {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceId: request.sourceId,
    expectedSha256: request.expectedSha256,
    semanticProfile: request.semanticProfile,
    expectedProcessId: request.expectedProcessId,
    processInstanceId: requireNonemptyWireString(
      request.processInstanceId,
      "processInstanceId",
    ),
    limits: { ...request.limits },
    taskQueue: requireNonemptyWireString(request.taskQueue, "taskQueue"),
  };
}

function snapshotStartRequest(request: EngineDefinitionStartRequest): StartSnapshot {
  return {
    ...snapshotPreparationRequest(request),
    temporalClient: request.temporalClient,
  };
}

function startStimulus(
  snapshot: PreparationSnapshot,
  compilation: AcceptedBpmnCompilation,
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start:${snapshot.processInstanceId}`,
    processId: compilation.semanticProcess.processId,
    instanceId: snapshot.processInstanceId,
    initialVariables: [],
  };
}

function definitionIdentity(
  snapshot: PreparationSnapshot,
): EngineDefinitionIdentity {
  return {
    processId: snapshot.expectedProcessId,
    semanticProfile: snapshot.semanticProfile,
  };
}

function compiledIdentityMatches(
  compilation: AcceptedBpmnCompilation,
  snapshot: PreparationSnapshot,
): boolean {
  return compilation.source.id === snapshot.sourceId &&
    compilation.source.sha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceId === snapshot.sourceId &&
    compilation.semanticProcess.identity.sourceSha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceOverlay === null &&
    compilation.semanticProcess.identity.semanticProfile === snapshot.semanticProfile &&
    compilation.semanticProcess.processId === snapshot.expectedProcessId;
}

function integrityFailure(
  source: BpmnSourceIdentity,
  definition: EngineDefinitionIdentity,
  code: EngineDefinitionStartIntegrityCode,
  evidence: string,
): EngineDefinitionStartIntegrityFailure {
  return {
    status: EngineDefinitionStartStatus.IntegrityFailure,
    source,
    definition,
    failure: { code, evidence },
  };
}

function snapshotIntent(intent: EngineDefinitionStartIntent): EngineDefinitionStartIntent {
  if (
    intent.protocol !== "bpmn-direct-start-v1" ||
    typeof intent.intentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(intent.intentSha256)
  ) {
    throw new TypeError("Direct Start intent must be a valid v1 marker");
  }
  return { protocol: intent.protocol, intentSha256: intent.intentSha256 };
}

function requireNonemptyWireString(value: string, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
  return value;
}
