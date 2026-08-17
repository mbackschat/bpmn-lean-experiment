/**
 * Handle-free concrete Temporal start boundary for definition deployment consumers.
 *
 * The SDK client and Workflow handle remain inside this package. The opaque token is created only by
 * the lazy concrete runtime and is not a portability interface or a second start contract.
 */
import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import {
  Client,
  Connection,
} from "@temporalio/client";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import type { WorkflowClient } from "@temporalio/client";

import {
  bpmnProcessWorkflowType,
  canonicalTypedTupleEncoding,
  deterministicSha256Hex,
  processWorkflowId,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";

import {
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess as startBpmnProcessWithHandle,
} from "./process-client.js";

const operationDeadlineMs = 5_000;
const directStartIntentProtocol = "bpmn-direct-start-v1";
const directStartMemoKey = "bpmnLeanDirectStartIntentSha256";

export const temporalDefinitionStartWorkflowType = bpmnProcessWorkflowType;

export function temporalDefinitionStartWorkflowId(
  processInstanceId: string,
): string {
  return processWorkflowId(processInstanceId);
}

declare const temporalDefinitionStartClientBrand: unique symbol;

export type TemporalDefinitionStartClient = Readonly<{
  [temporalDefinitionStartClientBrand]: true;
}>;

export type LazyTemporalClientRuntimeOptions = Readonly<{
  address: string;
  namespace: string;
  connectTimeoutMs: number;
}>;

export const TemporalDefinitionStartResultKind = {
  Started: "started",
  Rejected: "rejected",
} as const;

export type TemporalDefinitionStartResultKind =
  typeof TemporalDefinitionStartResultKind[
    keyof typeof TemporalDefinitionStartResultKind
  ];

export type TemporalDefinitionStartResult =
  | Readonly<{
      kind: typeof TemporalDefinitionStartResultKind.Started;
    }>
  | Readonly<{
      kind: typeof TemporalDefinitionStartResultKind.Rejected;
      failure: Readonly<{
        code: string;
        evidence: string;
      }>;
    }>;

export type TemporalDefinitionStartIntent = Readonly<{
  protocol: typeof directStartIntentProtocol;
  intentSha256: string;
}>;

export type TemporalDefinitionStartPreparationRequest = Readonly<{
  start: StartProcessStimulus;
  semanticProcess: SemanticProcessProgram;
  workflowId: string;
  taskQueue: string;
}>;

export enum TemporalDefinitionStartPreparationResultKind {
  Admitted = "admitted",
  Rejected = "rejected",
}

export type TemporalDefinitionStartPreparationResult =
  | Readonly<{
      kind: TemporalDefinitionStartPreparationResultKind.Admitted;
      intent: TemporalDefinitionStartIntent;
    }>
  | Readonly<{
      kind: TemporalDefinitionStartPreparationResultKind.Rejected;
      failure: Readonly<{ code: string; evidence: string }>;
    }>;

export enum TemporalPreparedDefinitionStartResultKind {
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type TemporalPreparedDefinitionStartResult =
  | Readonly<{ kind: TemporalPreparedDefinitionStartResultKind.Started }>
  | Readonly<{
      kind: TemporalPreparedDefinitionStartResultKind.Rejected;
      failure: Readonly<{ code: string; evidence: string }>;
    }>
  | Readonly<{
      kind: TemporalPreparedDefinitionStartResultKind.IntegrityFailure;
      failure: Readonly<{
        code: "constructionFailed" | "intentMarkerMismatch";
        evidence: string;
      }>;
    }>;

export type TemporalPreparedDefinitionStartRequest =
  TemporalDefinitionStartPreparationRequest & Readonly<{
    expectedIntent: TemporalDefinitionStartIntent;
  }>;

export enum TemporalDefinitionStartDescriptionResultKind {
  Found = "found",
  Missing = "missing",
  Unavailable = "unavailable",
}

export type TemporalDefinitionStartDescriptionResult =
  | Readonly<{
      kind: TemporalDefinitionStartDescriptionResultKind.Found;
      description: Readonly<{
        workflowId: string;
        workflowType: string;
        taskQueue: string;
        intentSha256: string | undefined;
      }>;
    }>
  | Readonly<{ kind: TemporalDefinitionStartDescriptionResultKind.Missing }>
  | Readonly<{ kind: TemporalDefinitionStartDescriptionResultKind.Unavailable }>;

/** Owns one lazy, reused SDK connection and the concrete client for Workflow and Schedule calls. */
export class LazyTemporalClientRuntime {
  readonly client: TemporalDefinitionStartClient;
  readonly #connection: Connection;
  #closePromise: Promise<void> | undefined;

  constructor(options: LazyTemporalClientRuntimeOptions) {
    const snapshot = snapshotOptions(options);
    this.#connection = Connection.lazy({
      address: snapshot.address,
      connectTimeout: snapshot.connectTimeoutMs,
    });
    this.client = new Client({
      connection: this.#connection,
      namespace: snapshot.namespace,
    }) as unknown as TemporalDefinitionStartClient;
  }

  /** Completes the lazy server handshake or rejects with the SDK connection failure. */
  ensureConnected(): Promise<void> {
    return this.#connection.ensureConnected();
  }

  /** Returns one shared close operation even when lifecycle owners close repeatedly. */
  close(): Promise<void> {
    this.#closePromise ??= this.#connection.close();
    return this.#closePromise;
  }
}

/** Construction is lazy and performs no server handshake or other network I/O. */
export function createLazyTemporalClientRuntime(
  options: LazyTemporalClientRuntimeOptions,
): LazyTemporalClientRuntime {
  return new LazyTemporalClientRuntime(options);
}

/** Performs admission and hashes the complete immutable Workflow request without an SDK call. */
export function prepareTemporalDefinitionStart(
  request: TemporalDefinitionStartPreparationRequest,
): TemporalDefinitionStartPreparationResult {
  const snapshot = snapshotDirectStartRequest(request);
  return prepareDirectStartSnapshot(snapshot);
}

/** Reconstructs the complete request, rejects marker drift, and invokes one SDK start. */
export async function startPreparedTemporalDefinition(
  client: TemporalDefinitionStartClient,
  request: TemporalPreparedDefinitionStartRequest,
): Promise<TemporalPreparedDefinitionStartResult> {
  let snapshot: DirectStartSnapshot;
  let prepared: TemporalDefinitionStartPreparationResult;
  let expectedIntent: TemporalDefinitionStartIntent;
  try {
    snapshot = snapshotDirectStartRequest(request);
    prepared = prepareDirectStartSnapshot(snapshot);
    expectedIntent = snapshotIntent(request.expectedIntent);
  } catch {
    return {
      kind: TemporalPreparedDefinitionStartResultKind.IntegrityFailure,
      failure: {
        code: "constructionFailed",
        evidence: "Direct Start production request construction failed before SDK invocation.",
      },
    };
  }
  if (prepared.kind === TemporalDefinitionStartPreparationResultKind.Rejected) {
    return {
      kind: TemporalPreparedDefinitionStartResultKind.Rejected,
      failure: prepared.failure,
    };
  }
  if (!sameIntent(prepared.intent, expectedIntent)) {
    return {
      kind: TemporalPreparedDefinitionStartResultKind.IntegrityFailure,
      failure: {
        code: "intentMarkerMismatch",
        evidence: "Persisted Direct Start intent did not match the production constructor.",
      },
    };
  }
  await withDeadline(
    workflowClientOf(client).start(bpmnProcessWorkflowType, {
      taskQueue: snapshot.taskQueue,
      workflowId: snapshot.workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      workflowIdConflictPolicy: "FAIL",
      args: [snapshot.start, snapshot.semanticProcess],
      memo: { [directStartMemoKey]: prepared.intent.intentSha256 },
    }),
    operationDeadlineMs,
    "Direct Start Workflow creation",
  );
  return { kind: TemporalPreparedDefinitionStartResultKind.Started };
}

/** Reads only retained service facts needed to decide direct-start recovery. */
export async function describeTemporalDefinitionStart(
  client: TemporalDefinitionStartClient,
  workflowId: string,
): Promise<TemporalDefinitionStartDescriptionResult> {
  requireNonempty(workflowId, "workflowId");
  try {
    const description = await withDeadline(
      workflowClientOf(client).getHandle(workflowId).describe(),
      operationDeadlineMs,
      "Direct Start Workflow description",
    );
    return {
      kind: TemporalDefinitionStartDescriptionResultKind.Found,
      description: {
        workflowId: description.workflowId,
        workflowType: description.type,
        taskQueue: description.taskQueue,
        intentSha256: decodeIntentSha256(
          description.memo?.[directStartMemoKey],
        ),
      },
    };
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? { kind: TemporalDefinitionStartDescriptionResultKind.Missing }
      : { kind: TemporalDefinitionStartDescriptionResultKind.Unavailable };
  }
}

/** Calls the existing production start operation and discards its SDK Workflow handle. */
export async function startBpmnProcessWithoutHandle(
  client: TemporalDefinitionStartClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  options: Readonly<{ taskQueue: string }>,
): Promise<TemporalDefinitionStartResult> {
  const started = await startBpmnProcessWithHandle(
    workflowClientOf(client),
    start,
    semanticProcess,
    options,
  );
  switch (started.kind) {
    case BpmnProcessStartResultKind.Started:
      return { kind: TemporalDefinitionStartResultKind.Started };
    case BpmnProcessStartResultKind.Rejected:
      return {
        kind: TemporalDefinitionStartResultKind.Rejected,
        failure: {
          code: started.failure.code,
          evidence: started.failure.evidence,
        },
      };
    default:
      return assertNever(started);
  }
}

function workflowClientOf(
  client: TemporalDefinitionStartClient,
): WorkflowClient {
  const concrete = client as unknown as Readonly<{
    workflow?: WorkflowClient;
  }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

type DirectStartSnapshot = Readonly<{
  start: StartProcessStimulus;
  semanticProcess: SemanticProcessProgram;
  workflowId: string;
  taskQueue: string;
}>;

function snapshotDirectStartRequest(
  request: TemporalDefinitionStartPreparationRequest,
): DirectStartSnapshot {
  requireNonempty(request.workflowId, "workflowId");
  requireNonempty(request.taskQueue, "taskQueue");
  return {
    start: structuredClone(request.start),
    semanticProcess: structuredClone(request.semanticProcess),
    workflowId: request.workflowId,
    taskQueue: request.taskQueue,
  };
}

function prepareDirectStartSnapshot(
  snapshot: DirectStartSnapshot,
): TemporalDefinitionStartPreparationResult {
  const admission = assessBpmnProcessAdmission(
    snapshot.start,
    snapshot.semanticProcess,
  );
  switch (admission.kind) {
    case BpmnProcessAdmissionResultKind.Rejected:
      return {
        kind: TemporalDefinitionStartPreparationResultKind.Rejected,
        failure: admission.failure,
      };
    case BpmnProcessAdmissionResultKind.Admitted:
      return {
        kind: TemporalDefinitionStartPreparationResultKind.Admitted,
        intent: deriveDirectStartIntent(snapshot),
      };
  }
}

function deriveDirectStartIntent(
  snapshot: DirectStartSnapshot,
): TemporalDefinitionStartIntent {
  const encoded = canonicalTypedTupleEncoding([
    "bpmnLeanDirectStartIntent",
    directStartIntentProtocol,
    bpmnProcessWorkflowType,
    snapshot.workflowId,
    snapshot.taskQueue,
    "REJECT_DUPLICATE",
    "FAIL",
    "workflowRetry:absent",
    canonicalJson(snapshot.start),
    canonicalJson(snapshot.semanticProcess),
  ]);
  return {
    protocol: directStartIntentProtocol,
    intentSha256: deterministicSha256Hex(encoded),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (!isWellFormedWireString(value)) {
      throw new TypeError("Direct Start snapshots require well-formed Unicode strings");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Direct Start snapshots require safe integers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${canonicalJson(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  throw new TypeError("Direct Start snapshots require exact JSON values");
}

function snapshotIntent(
  intent: TemporalDefinitionStartIntent,
): TemporalDefinitionStartIntent {
  if (
    intent.protocol !== directStartIntentProtocol ||
    typeof intent.intentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(intent.intentSha256)
  ) {
    throw new TypeError("Direct Start intent must be a valid v1 marker");
  }
  return { protocol: intent.protocol, intentSha256: intent.intentSha256 };
}

function sameIntent(
  left: TemporalDefinitionStartIntent,
  right: TemporalDefinitionStartIntent,
): boolean {
  return left.protocol === right.protocol &&
    left.intentSha256 === right.intentSha256;
}

function decodeIntentSha256(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotOptions(
  options: LazyTemporalClientRuntimeOptions,
): LazyTemporalClientRuntimeOptions {
  requireNonempty(options.address, "address");
  requireNonempty(options.namespace, "namespace");
  if (
    !Number.isSafeInteger(options.connectTimeoutMs) ||
    options.connectTimeoutMs <= 0
  ) {
    throw new RangeError("connectTimeoutMs must be a positive safe integer");
  }
  return {
    address: options.address,
    namespace: options.namespace,
    connectTimeoutMs: options.connectTimeoutMs,
  };
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal definition start: ${String(value)}`);
}
