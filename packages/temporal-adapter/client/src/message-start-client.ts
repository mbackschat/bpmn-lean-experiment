/** Handle-free direct Message Start construction and Worker-independent retained description. */
import type {
  SemanticProcessProgram,
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import type {
  WorkflowClient,
} from "@temporalio/client";

import {
  bpmnProcessWorkflowType,
  canonicalTypedTupleEncoding,
  deterministicSha256Hex,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";

import {
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
} from "./process-client.js";
import type {
  TemporalDefinitionStartClient,
} from "./definition-start-client.js";

const operationDeadlineMs = 5_000;
const messageStartIntentProtocol = "bpmn-message-start-v1";
const messageStartMemoKey = "bpmnMessageStartIntent";

export type TemporalMessageStartClient = TemporalDefinitionStartClient;
export const temporalMessageStartWorkflowType = bpmnProcessWorkflowType;

export type TemporalMessageStartIntent = Readonly<{
  protocol: string;
  intentSha256: string;
}>;

export type TemporalMessageStartPreparationRequest = Readonly<{
  start: TriggerMessageStartStimulus;
  semanticProcess: SemanticProcessProgram;
  workflowId: string;
  taskQueue: string;
}>;

export enum TemporalMessageStartPreparationResultKind {
  Admitted = "admitted",
  Rejected = "rejected",
}

export type TemporalMessageStartPreparationResult =
  | Readonly<{
      kind: TemporalMessageStartPreparationResultKind.Admitted;
      intent: TemporalMessageStartIntent;
    }>
  | Readonly<{
      kind: TemporalMessageStartPreparationResultKind.Rejected;
      failure: Readonly<{ code: string; evidence: string }>;
    }>;

export enum TemporalMessageStartResultKind {
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type TemporalMessageStartResult =
  | Readonly<{ kind: TemporalMessageStartResultKind.Started }>
  | Readonly<{
      kind: TemporalMessageStartResultKind.Rejected;
      failure: Readonly<{ code: string; evidence: string }>;
    }>
  | Readonly<{
      kind: TemporalMessageStartResultKind.IntegrityFailure;
      failure: Readonly<{
        code: "constructionFailed" | "intentMarkerMismatch";
        evidence: string;
      }>;
    }>;

export type TemporalMessageStartRequest =
  TemporalMessageStartPreparationRequest & Readonly<{
    expectedIntent: TemporalMessageStartIntent;
  }>;

export type TemporalMessageStartDescription = Readonly<{
  workflowId: string;
  workflowType: string;
  taskQueue: string;
  status:
    | "UNSPECIFIED"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "TERMINATED"
    | "CONTINUED_AS_NEW"
    | "TIMED_OUT"
    | "PAUSED"
    | "UNKNOWN";
  intent: TemporalMessageStartIntent | undefined;
}>;

export enum TemporalMessageStartDescriptionResultKind {
  Found = "found",
  Missing = "missing",
  Unavailable = "unavailable",
}

export type TemporalMessageStartDescriptionResult =
  | Readonly<{
      kind: TemporalMessageStartDescriptionResultKind.Found;
      description: TemporalMessageStartDescription;
    }>
  | Readonly<{ kind: TemporalMessageStartDescriptionResultKind.Missing }>
  | Readonly<{ kind: TemporalMessageStartDescriptionResultKind.Unavailable }>;

/** Performs semantic and host admission and returns only the private marker to its caller. */
export function prepareTemporalMessageStart(
  request: TemporalMessageStartPreparationRequest,
): TemporalMessageStartPreparationResult {
  return prepareSnapshot(snapshotRequest(request));
}

/** Constructs and invokes exactly one direct Workflow start without returning its SDK handle. */
export async function startTemporalMessageStart(
  client: TemporalMessageStartClient,
  request: TemporalMessageStartRequest,
): Promise<TemporalMessageStartResult> {
  let snapshot: MessageStartSnapshot;
  let preparation: TemporalMessageStartPreparationResult;
  try {
    snapshot = snapshotRequest(request);
    preparation = prepareSnapshot(snapshot);
  } catch {
    return {
      kind: TemporalMessageStartResultKind.IntegrityFailure,
      failure: {
        code: "constructionFailed",
        evidence: "Message Start production request construction failed before SDK invocation.",
      },
    };
  }
  switch (preparation.kind) {
    case TemporalMessageStartPreparationResultKind.Rejected:
      return {
        kind: TemporalMessageStartResultKind.Rejected,
        failure: preparation.failure,
      };
    case TemporalMessageStartPreparationResultKind.Admitted:
      break;
  }
  if (!sameIntent(preparation.intent, request.expectedIntent)) {
    return {
      kind: TemporalMessageStartResultKind.IntegrityFailure,
      failure: {
        code: "intentMarkerMismatch",
        evidence: "Persisted Message Start intent did not match the production constructor.",
      },
    };
  }

  await withDeadline(
    workflowClientOf(client).start(
      bpmnProcessWorkflowType,
      {
        taskQueue: snapshot.taskQueue,
        workflowId: snapshot.workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        workflowIdConflictPolicy: "FAIL",
        args: [snapshot.start, snapshot.semanticProcess],
        memo: { [messageStartMemoKey]: preparation.intent },
      },
    ),
    operationDeadlineMs,
    "Message Start Workflow creation",
  );
  return { kind: TemporalMessageStartResultKind.Started };
}

/** Uses the service describe API only; no Worker or Workflow code is required. */
export async function describeTemporalMessageStart(
  client: TemporalMessageStartClient,
  workflowId: string,
): Promise<TemporalMessageStartDescriptionResult> {
  requireNonempty(workflowId, "workflowId");
  try {
    const description = await withDeadline(
      workflowClientOf(client).getHandle(workflowId).describe(),
      operationDeadlineMs,
      "Message Start Workflow description",
    );
    return {
      kind: TemporalMessageStartDescriptionResultKind.Found,
      description: {
        workflowId: description.workflowId,
        workflowType: description.type,
        taskQueue: description.taskQueue,
        status: description.status.name,
        intent: decodeIntent(description.memo?.[messageStartMemoKey]),
      },
    };
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? { kind: TemporalMessageStartDescriptionResultKind.Missing }
      : { kind: TemporalMessageStartDescriptionResultKind.Unavailable };
  }
}

type MessageStartSnapshot = Readonly<{
  start: TriggerMessageStartStimulus;
  semanticProcess: SemanticProcessProgram;
  workflowId: string;
  taskQueue: string;
}>;

function snapshotRequest(
  request: TemporalMessageStartPreparationRequest,
): MessageStartSnapshot {
  requireNonempty(request.workflowId, "workflowId");
  requireNonempty(request.taskQueue, "taskQueue");
  return {
    start: structuredClone(request.start),
    semanticProcess: structuredClone(request.semanticProcess),
    workflowId: request.workflowId,
    taskQueue: request.taskQueue,
  };
}

function prepareSnapshot(
  snapshot: MessageStartSnapshot,
): TemporalMessageStartPreparationResult {
  const admission = assessBpmnProcessAdmission(
    snapshot.start,
    snapshot.semanticProcess,
  );
  switch (admission.kind) {
    case BpmnProcessAdmissionResultKind.Rejected:
      return {
        kind: TemporalMessageStartPreparationResultKind.Rejected,
        failure: admission.failure,
      };
    case BpmnProcessAdmissionResultKind.Admitted:
      return {
        kind: TemporalMessageStartPreparationResultKind.Admitted,
        intent: deriveIntent(snapshot),
      };
  }
}

function deriveIntent(snapshot: MessageStartSnapshot): TemporalMessageStartIntent {
  const { start, semanticProcess } = snapshot;
  const encoded = canonicalTypedTupleEncoding([
    "bpmnMessageStartIntent",
    messageStartIntentProtocol,
    bpmnProcessWorkflowType,
    snapshot.workflowId,
    snapshot.taskQueue,
    "REJECT_DUPLICATE",
    "FAIL",
    "workflowRetry:absent",
    semanticProcess.identity.sourceId,
    semanticProcess.identity.sourceSha256,
    semanticProcess.identity.semanticProfile,
    semanticProcess.processId,
    start.instanceId,
    start.kind,
    start.commandId,
    start.startEventId,
    start.channel.kind,
    start.channel.interfaceId,
    start.channel.interfaceOperationId,
    start.channel.messageId,
  ]);
  return {
    protocol: messageStartIntentProtocol,
    intentSha256: deterministicSha256Hex(encoded),
  };
}

function decodeIntent(value: unknown): TemporalMessageStartIntent | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["protocol", "intentSha256"])) {
    return undefined;
  }
  return value.protocol === messageStartIntentProtocol &&
      typeof value.intentSha256 === "string" &&
      /^[0-9a-f]{64}$/u.test(value.intentSha256)
    ? { protocol: value.protocol, intentSha256: value.intentSha256 }
    : undefined;
}

function sameIntent(
  left: TemporalMessageStartIntent,
  right: TemporalMessageStartIntent,
): boolean {
  return left.protocol === right.protocol &&
    left.intentSha256 === right.intentSha256;
}

function workflowClientOf(client: TemporalMessageStartClient): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}
