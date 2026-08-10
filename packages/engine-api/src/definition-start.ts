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
import type { DeepReadonly } from "@bpmn-lean/semantic-core";
import {
  TemporalDefinitionStartResultKind,
  startBpmnProcessWithoutHandle,
} from "@bpmn-lean/temporal-client/definition-start";
import type {
  TemporalDefinitionStartClient,
} from "@bpmn-lean/temporal-client/definition-start";

import type { EngineDefinitionIdentity } from "./index.js";

export const EngineDefinitionStartStatus = {
  Started: "started",
  Rejected: "rejected",
  IntegrityFailure: "integrityFailure",
} as const;

export type EngineDefinitionStartStatus =
  typeof EngineDefinitionStartStatus[keyof typeof EngineDefinitionStartStatus];

export const EngineDefinitionStartIntegrityCode = {
  CompilationRejected: "definitionCompilationRejected",
  IdentityDrift: "definitionIdentityDrift",
} as const;

export type EngineDefinitionStartIntegrityCode =
  typeof EngineDefinitionStartIntegrityCode[
    keyof typeof EngineDefinitionStartIntegrityCode
  ];

export type EngineDefinitionStartRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  processInstanceId: string;
  limits: BpmnSourceLimits;
  temporalClient: TemporalDefinitionStartClient;
  taskQueue: string;
}>;

export type EngineDefinitionStartFailure = DeepReadonly<{
  code: string;
  evidence: string;
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

export type EngineDefinitionStartResult =
  | EngineStartedDefinition
  | EngineRejectedDefinitionStart
  | EngineDefinitionStartIntegrityFailure;

export async function startBpmnDefinitionVersion(
  request: EngineDefinitionStartRequest,
): Promise<EngineDefinitionStartResult> {
  const snapshot = snapshotStartRequest(request);
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
    return {
      status: EngineDefinitionStartStatus.IntegrityFailure,
      source: compilation.source,
      definition: expectedDefinition,
      failure: {
        code: EngineDefinitionStartIntegrityCode.CompilationRejected,
        evidence: compilation.diagnostics[0]?.evidence ??
          "Stored definition recompilation was rejected.",
      },
    };
  }

  if (!compiledIdentityMatches(compilation, snapshot)) {
    return {
      status: EngineDefinitionStartStatus.IntegrityFailure,
      source: compilation.source,
      definition: expectedDefinition,
      failure: {
        code: EngineDefinitionStartIntegrityCode.IdentityDrift,
        evidence:
          "Compiled source and definition identity did not match the stored definition version.",
      },
    };
  }
  const started = await startBpmnProcessWithoutHandle(
    snapshot.temporalClient,
    {
      kind: StimulusKind.StartProcess,
      commandId: `start:${snapshot.processInstanceId}`,
      processId: compilation.semanticProcess.processId,
      instanceId: snapshot.processInstanceId,
      initialVariables: [],
    },
    compilation.semanticProcess,
    { taskQueue: snapshot.taskQueue },
  );
  switch (started.kind) {
    case TemporalDefinitionStartResultKind.Started:
      return {
        status: EngineDefinitionStartStatus.Started,
        source: compilation.source,
        definition: expectedDefinition,
        processInstanceId: snapshot.processInstanceId,
      };
    case TemporalDefinitionStartResultKind.Rejected:
      return {
        status: EngineDefinitionStartStatus.Rejected,
        source: compilation.source,
        definition: expectedDefinition,
        failure: {
          code: started.failure.code,
          evidence: started.failure.evidence,
        },
      };
    default:
      return assertNever(started);
  }
}

type StartRequestSnapshot = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  processInstanceId: string;
  limits: BpmnSourceLimits;
  temporalClient: TemporalDefinitionStartClient;
  taskQueue: string;
}>;

function snapshotStartRequest(
  request: EngineDefinitionStartRequest,
): StartRequestSnapshot {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  if (
    typeof request.processInstanceId !== "string" ||
    request.processInstanceId.length === 0 ||
    !isWellFormedWireString(request.processInstanceId)
  ) {
    throw new TypeError(
      "processInstanceId must be a nonempty well-formed Unicode string",
    );
  }
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceId: request.sourceId,
    expectedSha256: request.expectedSha256,
    semanticProfile: request.semanticProfile,
    expectedProcessId: request.expectedProcessId,
    processInstanceId: request.processInstanceId,
    limits: { ...request.limits },
    temporalClient: request.temporalClient,
    taskQueue: request.taskQueue,
  };
}

function definitionIdentity(
  snapshot: StartRequestSnapshot,
): EngineDefinitionIdentity {
  return {
    processId: snapshot.expectedProcessId,
    semanticProfile: snapshot.semanticProfile,
  };
}

function compiledIdentityMatches(
  compilation: AcceptedBpmnCompilation,
  snapshot: StartRequestSnapshot,
): boolean {
  return (
    compilation.source.id === snapshot.sourceId &&
    compilation.source.sha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceId === snapshot.sourceId &&
    compilation.semanticProcess.identity.sourceSha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceOverlay === null &&
    compilation.semanticProcess.identity.semanticProfile ===
      snapshot.semanticProfile &&
    compilation.semanticProcess.processId === snapshot.expectedProcessId
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported BPMN start result: ${String(value)}`);
}
