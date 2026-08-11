/** Exact-definition Message Start admission, direct creation, and retained-host comparison. */
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import {
  MessageChannelKind,
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  TemporalMessageStartDescriptionResultKind,
  TemporalMessageStartPreparationResultKind,
  TemporalMessageStartResultKind,
  describeTemporalMessageStart,
  prepareTemporalMessageStart,
  startTemporalMessageStart,
  temporalMessageStartWorkflowType,
} from "@bpmn-lean/temporal-client/message-start";
import type {
  TemporalMessageStartClient,
  TemporalMessageStartIntent,
} from "@bpmn-lean/temporal-client/message-start";

import {
  engineDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import type {
  EngineDefinitionStartCapabilities,
  EngineMessageStartCapability,
} from "./definition-capabilities.js";

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

export type EngineDefinitionMessageStartIntent = TemporalMessageStartIntent;

export type EngineDefinitionMessageStartPreparationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  expectedByteLength: number;
  semanticProfile: string;
  expectedProcessId: string;
  expectedStartCapabilities: EngineDefinitionStartCapabilities;
  expectedMessageStart: EngineMessageStartCapability;
  processInstanceId: string;
  commandId: string;
  workflowId: string;
  taskQueue: string;
  limits: BpmnSourceLimits;
}>;

export type EngineDefinitionMessageStartRequest =
  EngineDefinitionMessageStartPreparationRequest & Readonly<{
    temporalClient: TemporalMessageStartClient;
    expectedIntent: EngineDefinitionMessageStartIntent;
  }>;

export type EngineDefinitionMessageStartFailure = Readonly<{
  code: string;
  evidence: string;
}>;

export type EngineDefinitionMessageStartPreparationResult =
  | Readonly<{
      status: EngineDefinitionMessageStartStatus.Admitted;
      intent: EngineDefinitionMessageStartIntent;
    }>
  | Readonly<{
      status: EngineDefinitionMessageStartStatus.Rejected;
      failure: EngineDefinitionMessageStartFailure;
    }>
  | Readonly<{
      status: EngineDefinitionMessageStartStatus.IntegrityFailure;
      failure: EngineDefinitionMessageStartFailure;
    }>;

export type EngineDefinitionMessageStartResult =
  | Readonly<{ status: EngineDefinitionMessageStartStatus.Started }>
  | Exclude<
      EngineDefinitionMessageStartPreparationResult,
      { status: EngineDefinitionMessageStartStatus.Admitted }
    >;

export type EngineDefinitionMessageStartDescriptionRequest = Readonly<{
  temporalClient: TemporalMessageStartClient;
  workflowId: string;
  taskQueue: string;
  expectedIntent: EngineDefinitionMessageStartIntent;
}>;

export enum EngineDefinitionMessageStartDescriptionStatus {
  Matching = "matching",
  Missing = "missing",
  Divergent = "divergent",
  Unavailable = "unavailable",
}

export type EngineDefinitionMessageStartDescriptionResult = Readonly<{
  status: EngineDefinitionMessageStartDescriptionStatus;
}>;

/** Recompiles and admits the exact dispatch while returning no semantic representation. */
export async function prepareBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartPreparationRequest,
): Promise<EngineDefinitionMessageStartPreparationResult> {
  const prepared = await prepareDefinitionMessageStart(snapshotRequest(request));
  return "compilation" in prepared
    ? { status: EngineDefinitionMessageStartStatus.Admitted, intent: prepared.intent }
    : prepared;
}

/** Repeats exact admission at dispatch and invokes the fixed production constructor once. */
export async function startBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartRequest,
): Promise<EngineDefinitionMessageStartResult> {
  const snapshot = snapshotRequest(request);
  const temporalClient = request.temporalClient;
  const expectedIntent = { ...request.expectedIntent };
  const prepared = await prepareDefinitionMessageStart(snapshot);
  if (!("compilation" in prepared)) {
    switch (prepared.status) {
      case EngineDefinitionMessageStartStatus.Rejected:
      case EngineDefinitionMessageStartStatus.IntegrityFailure:
        return prepared;
      case EngineDefinitionMessageStartStatus.Admitted:
        throw new TypeError("Prepared Message Start lacked its admitted compilation");
    }
  }
  const started = await startTemporalMessageStart(temporalClient, {
    start: prepared.start,
    semanticProcess: prepared.compilation.semanticProcess,
    workflowId: snapshot.workflowId,
    taskQueue: snapshot.taskQueue,
    expectedIntent,
  });
  switch (started.kind) {
    case TemporalMessageStartResultKind.Started:
      return { status: EngineDefinitionMessageStartStatus.Started };
    case TemporalMessageStartResultKind.Rejected:
      return {
        status: EngineDefinitionMessageStartStatus.Rejected,
        failure: started.failure,
      };
    case TemporalMessageStartResultKind.IntegrityFailure:
      return integrityFailure(
        EngineDefinitionMessageStartFailureCode.ConstructorDrift,
        started.failure.evidence,
      );
  }
}

/** Compares only the retained facts required by the no-redispatch lifecycle. */
export async function describeBpmnDefinitionMessageStart(
  request: EngineDefinitionMessageStartDescriptionRequest,
): Promise<EngineDefinitionMessageStartDescriptionResult> {
  const snapshot = {
    temporalClient: request.temporalClient,
    workflowId: request.workflowId,
    taskQueue: request.taskQueue,
    expectedIntent: { ...request.expectedIntent },
  };
  const described = await describeTemporalMessageStart(
    snapshot.temporalClient,
    snapshot.workflowId,
  );
  switch (described.kind) {
    case TemporalMessageStartDescriptionResultKind.Missing:
      return { status: EngineDefinitionMessageStartDescriptionStatus.Missing };
    case TemporalMessageStartDescriptionResultKind.Unavailable:
      return { status: EngineDefinitionMessageStartDescriptionStatus.Unavailable };
    case TemporalMessageStartDescriptionResultKind.Found: {
      const retained = described.description;
      return {
        status: retained.workflowId === snapshot.workflowId &&
            retained.workflowType === temporalMessageStartWorkflowType &&
            retained.taskQueue === snapshot.taskQueue &&
            retained.intent !== undefined &&
            sameIntent(retained.intent, snapshot.expectedIntent)
          ? EngineDefinitionMessageStartDescriptionStatus.Matching
          : EngineDefinitionMessageStartDescriptionStatus.Divergent,
      };
    }
  }
}

type MessageStartSnapshot = Omit<
  EngineDefinitionMessageStartPreparationRequest,
  "bytes" | "limits"
> & Readonly<{
  bytes: Uint8Array;
  limits: BpmnSourceLimits;
}>;

type PreparedMessageStart = Readonly<{
  compilation: AcceptedBpmnCompilation;
  start: TriggerMessageStartStimulus;
  intent: EngineDefinitionMessageStartIntent;
}>;

async function prepareDefinitionMessageStart(
  snapshot: MessageStartSnapshot,
): Promise<PreparedMessageStart | EngineDefinitionMessageStartPreparationResult> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: snapshot.bytes,
    sourceId: snapshot.sourceId,
    expectedSha256: snapshot.expectedSha256,
    semanticProfile: snapshot.semanticProfile,
    sourceOverlay: null,
    limits: snapshot.limits,
  });
  if (compilation.status === BpmnCompilationStatus.Rejected) {
    return integrityFailure(
      EngineDefinitionMessageStartFailureCode.CompilationRejected,
      compilation.diagnostics[0]?.evidence ??
        "Stored definition recompilation was rejected.",
    );
  }
  if (!compiledIdentityMatches(compilation, snapshot)) {
    return integrityFailure(
      EngineDefinitionMessageStartFailureCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.",
    );
  }
  const capabilities = engineDefinitionStartCapabilities(
    compilation.semanticProcess,
  );
  if (!sameStartCapabilities(capabilities, snapshot.expectedStartCapabilities)) {
    return integrityFailure(
      EngineDefinitionMessageStartFailureCode.CapabilityDrift,
      "Compiled start capabilities did not match the stored definition version.",
    );
  }
  if (countCapability(capabilities, snapshot.expectedMessageStart) !== 1) {
    return {
      status: EngineDefinitionMessageStartStatus.Rejected,
      failure: {
        code: EngineDefinitionMessageStartFailureCode.CapabilityNotSelected,
        evidence: "Definition does not publish exactly the selected Message Start capability.",
      },
    };
  }
  const start = messageStartStimulus(snapshot);
  const preparation = prepareTemporalMessageStart({
    start,
    semanticProcess: compilation.semanticProcess,
    workflowId: snapshot.workflowId,
    taskQueue: snapshot.taskQueue,
  });
  switch (preparation.kind) {
    case TemporalMessageStartPreparationResultKind.Rejected:
      return {
        status: EngineDefinitionMessageStartStatus.Rejected,
        failure: preparation.failure,
      };
    case TemporalMessageStartPreparationResultKind.Admitted:
      return { compilation, start, intent: preparation.intent };
  }
}

function snapshotRequest(
  request: EngineDefinitionMessageStartPreparationRequest,
): MessageStartSnapshot {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  for (const [name, value] of [
    ["processInstanceId", request.processInstanceId],
    ["commandId", request.commandId],
    ["workflowId", request.workflowId],
    ["taskQueue", request.taskQueue],
  ] as const) {
    requireNonemptyWireString(value, name);
  }
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceId: request.sourceId,
    expectedSha256: request.expectedSha256,
    expectedByteLength: request.expectedByteLength,
    semanticProfile: request.semanticProfile,
    expectedProcessId: request.expectedProcessId,
    expectedStartCapabilities: cloneCapabilities(request.expectedStartCapabilities),
    expectedMessageStart: cloneMessageStart(request.expectedMessageStart),
    processInstanceId: request.processInstanceId,
    commandId: request.commandId,
    workflowId: request.workflowId,
    taskQueue: request.taskQueue,
    limits: { ...request.limits },
  };
}

function cloneCapabilities(
  capabilities: EngineDefinitionStartCapabilities,
): EngineDefinitionStartCapabilities {
  return {
    messageStarts: capabilities.messageStarts.map(cloneMessageStart),
    timerStarts: capabilities.timerStarts.map(({ startEventId, durationMs }) => ({
      startEventId,
      durationMs,
    })),
  };
}

function cloneMessageStart(
  capability: EngineMessageStartCapability,
): EngineMessageStartCapability {
  return {
    startEventId: capability.startEventId,
    channel: {
      kind: capability.channel.kind,
      interfaceId: capability.channel.interfaceId,
      interfaceOperationId: capability.channel.interfaceOperationId,
      messageId: capability.channel.messageId,
    },
  };
}

function messageStartStimulus(
  snapshot: MessageStartSnapshot,
): TriggerMessageStartStimulus {
  return {
    kind: StimulusKind.TriggerMessageStart,
    commandId: snapshot.commandId,
    processId: snapshot.expectedProcessId,
    instanceId: snapshot.processInstanceId,
    startEventId: snapshot.expectedMessageStart.startEventId,
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: snapshot.expectedMessageStart.channel.interfaceId,
      interfaceOperationId:
        snapshot.expectedMessageStart.channel.interfaceOperationId,
      messageId: snapshot.expectedMessageStart.channel.messageId,
    },
  };
}

function compiledIdentityMatches(
  compilation: AcceptedBpmnCompilation,
  snapshot: MessageStartSnapshot,
): boolean {
  return compilation.source.id === snapshot.sourceId &&
    compilation.source.sha256 === snapshot.expectedSha256 &&
    compilation.source.byteLength === snapshot.expectedByteLength &&
    compilation.semanticProcess.identity.sourceId === snapshot.sourceId &&
    compilation.semanticProcess.identity.sourceSha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceOverlay === null &&
    compilation.semanticProcess.identity.semanticProfile === snapshot.semanticProfile &&
    compilation.semanticProcess.processId === snapshot.expectedProcessId;
}

function sameStartCapabilities(
  left: EngineDefinitionStartCapabilities,
  right: EngineDefinitionStartCapabilities,
): boolean {
  return left.messageStarts.length === right.messageStarts.length &&
    left.messageStarts.every((capability, index) =>
      right.messageStarts[index] !== undefined &&
      sameMessageStart(capability, right.messageStarts[index])
    ) &&
    left.timerStarts.length === right.timerStarts.length &&
    left.timerStarts.every((capability, index) =>
      capability.startEventId === right.timerStarts[index]?.startEventId &&
      capability.durationMs === right.timerStarts[index]?.durationMs
    );
}

function countCapability(
  capabilities: EngineDefinitionStartCapabilities,
  selected: EngineMessageStartCapability,
): number {
  return capabilities.messageStarts.filter((candidate) =>
    sameMessageStart(candidate, selected)
  ).length;
}

function sameMessageStart(
  left: EngineMessageStartCapability,
  right: EngineMessageStartCapability,
): boolean {
  return left.startEventId === right.startEventId &&
    left.channel.kind === right.channel.kind &&
    left.channel.interfaceId === right.channel.interfaceId &&
    left.channel.interfaceOperationId === right.channel.interfaceOperationId &&
    left.channel.messageId === right.channel.messageId;
}

function sameIntent(
  left: EngineDefinitionMessageStartIntent,
  right: EngineDefinitionMessageStartIntent,
): boolean {
  return left.protocol === right.protocol &&
    left.intentSha256 === right.intentSha256;
}

function integrityFailure(
  code: EngineDefinitionMessageStartFailureCode,
  evidence: string,
): Extract<
  EngineDefinitionMessageStartPreparationResult,
  { status: EngineDefinitionMessageStartStatus.IntegrityFailure }
> {
  return {
    status: EngineDefinitionMessageStartStatus.IntegrityFailure,
    failure: { code, evidence },
  };
}

function requireNonemptyWireString(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0 || !isWellFormedWireString(value)) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
}
