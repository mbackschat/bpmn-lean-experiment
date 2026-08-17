import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { PublicWorkTask } from "@bpmn-lean/platform-contracts";
import {
  DefinitionCompilationStatus,
  DefinitionScheduleHostPhase,
  DefinitionStartDescriptionStatus,
  DefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";

export const sharedDefinitionProcessId = "Process_ExpenseExceptionReview";
export const sharedDefinitionProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
export const sharedTimerStartCapability = Object.freeze({
  startEventId: "Timer_Start",
  durationMs: 60_000,
});
export const sharedMessageStartCapability = Object.freeze({
  startEventId: "Message_Start",
  channel: Object.freeze({
    kind: "operationMessage" as const,
    interfaceId: "Shared_Interface",
    interfaceOperationId: "Shared_Start",
    messageId: "Shared_Message",
  }),
});

export type CrossReplicaEngineEvidence = Readonly<{
  exactSource: Uint8Array;
  sourceSha256: string;
  sourceDigests: string[];
  operations: string[];
  tasks: Map<string, PublicWorkTask["task"]>;
  taskFor(processInstanceId: string): PublicWorkTask["task"];
}>;

export function createCrossReplicaEngineEvidence(
  sourceBytes: Uint8Array,
): CrossReplicaEngineEvidence {
  const exactSource = sourceBytes.slice();
  const tasks = new Map<string, PublicWorkTask["task"]>();
  return {
    exactSource,
    sourceSha256: sha256(exactSource),
    sourceDigests: [],
    operations: [],
    tasks,
    taskFor: (processInstanceId) => {
      const task = tasks.get(processInstanceId);
      if (task === undefined) {
        throw new Error(`no retained test task for ${processInstanceId}`);
      }
      return structuredClone(task);
    },
  };
}

export function createCrossReplicaEngineRuntime(
  evidence: CrossReplicaEngineEvidence,
  replica: "first" | "second",
): BpmnEngineGatewayRuntime {
  const source = (
    operation: string,
    request: Readonly<{
      bytes: Uint8Array;
      sourceId?: string;
      definition?: Readonly<{ source: Readonly<{ id: string }> }>;
    }>,
  ) => captureSource(evidence, replica, operation, request);
  const noCalls = new Proxy({}, {
    get: (_target, property) => async () => {
      throw new Error(`unexpected Product 1 call ${String(property)}`);
    },
  });
  return {
    gateway: {
      compileDefinition: async (request: Readonly<{
        bytes: Uint8Array;
        sourceId: string;
        semanticProfile: string;
      }>) => ({
        status: DefinitionCompilationStatus.Accepted,
        source: source("compile", request),
        diagnostics: [],
        definition: {
          processId: sharedDefinitionProcessId,
          semanticProfile: request.semanticProfile,
        },
        startCapabilities: capabilities(),
      }),
      prepareDefinitionVersion: async (request: Readonly<{
        bytes: Uint8Array;
        sourceId: string;
        semanticProfile: string;
        processInstanceId: string;
      }>) => ({
        status: DefinitionStartStatus.Admitted,
        source: source("direct-prepare", request),
        definition: {
          processId: sharedDefinitionProcessId,
          semanticProfile: request.semanticProfile,
        },
        processInstanceId: request.processInstanceId,
        locator: `shared:${request.processInstanceId}`,
        intent: directIntent,
      }),
      startPreparedDefinitionVersion: async (request: Readonly<{
        bytes: Uint8Array;
        sourceId: string;
        semanticProfile: string;
        processInstanceId: string;
        expectedIntent: typeof directIntent;
      }>) => {
        source("direct-start", request);
        assert.deepEqual(request.expectedIntent, directIntent);
        evidence.tasks.set(
          request.processInstanceId,
          sharedWorkTask(request.processInstanceId),
        );
        return {
          status: DefinitionStartStatus.Started,
          source: sourceIdentity(evidence, request.sourceId),
          definition: {
            processId: sharedDefinitionProcessId,
            semanticProfile: request.semanticProfile,
          },
          processInstanceId: request.processInstanceId,
        };
      },
      describeDefinitionVersionStart: async () => ({
        status: DefinitionStartDescriptionStatus.Matching,
      }),
      startDefinitionVersion: async () => {
        throw new Error("shared definition start must use the prepared boundary");
      },
    },
    scheduleHost: {
      validateDefinition: async (request: Readonly<{
        bytes: Uint8Array;
        sourceId: string;
        semanticProfile: string;
      }>) => ({
        status: "accepted",
        source: source("schedule-validate", request),
        processId: sharedDefinitionProcessId,
        semanticProfile: request.semanticProfile,
        startCapabilities: capabilities(),
      }),
      createOrCompare: async (request: SourceBoundRequest) => {
        source("schedule-create", request);
        return { phase: DefinitionScheduleHostPhase.Pending, paused: false };
      },
      inspect: async (request: SourceBoundRequest) => {
        source("schedule-inspect", request);
        return { phase: DefinitionScheduleHostPhase.Pending, paused: false };
      },
      pause: async () => {
        throw new Error("shared Schedule witness does not cancel");
      },
      delete: async () => {
        throw new Error("shared Schedule witness does not reach cleanup");
      },
    },
    messageStartHost: {
      prepare: async (request: SourceBoundRequest) => {
        source("message-prepare", request);
        return { status: "admitted", intent: messageIntent };
      },
      start: async (request: SourceBoundRequest & Readonly<{
        expectedIntent: typeof messageIntent;
      }>) => {
        source("message-start", request);
        assert.deepEqual(request.expectedIntent, messageIntent);
        return { status: "started" };
      },
      describe: async () => ({ status: "matching" }),
    },
    processWork: {
      canonicalLocator: (processInstanceId: string) => `shared:${processInstanceId}`,
      scheduleExecutionLocator: (workflowId: string) => `shared:${workflowId}`,
      readWorkDetail: async (request: Readonly<{
        hostingProcessInstanceId: string;
        taskId: PublicWorkTask["task"]["id"];
      }>) => {
        evidence.operations.push(`${replica}:work-detail`);
        const task = evidence.taskFor(request.hostingProcessInstanceId);
        assert.deepEqual(request.taskId, task.id);
        return {
          status: "found",
          detail: { task, inputVariables: [] },
        };
      },
      observeOpenWork: async () => {
        throw new Error("API requests must not perform Work fleet observation");
      },
      completeWork: async () => {
        throw new Error("shared definition witness does not complete Work");
      },
    },
    processOperations: noCalls,
    processExecution: noCalls,
    processFlowNodeOccurrences: noCalls,
    ensureConnected: async () => undefined,
    close: async () => undefined,
  } as unknown as BpmnEngineGatewayRuntime;
}

function captureSource(
  evidence: CrossReplicaEngineEvidence,
  replica: string,
  operation: string,
  request: Readonly<{
    bytes: Uint8Array;
    sourceId?: string;
    definition?: Readonly<{ source: Readonly<{ id: string }> }>;
  }>,
) {
  assert.deepEqual(request.bytes, evidence.exactSource);
  const digest = sha256(request.bytes);
  assert.equal(digest, evidence.sourceSha256);
  evidence.operations.push(`${replica}:${operation}`);
  evidence.sourceDigests.push(digest);
  return sourceIdentity(
    evidence,
    request.sourceId ?? request.definition?.source.id ?? "shared-definition.bpmn",
  );
}

function sourceIdentity(evidence: CrossReplicaEngineEvidence, sourceId: string) {
  return {
    kind: "bpmnSource" as const,
    id: sourceId,
    sha256: evidence.sourceSha256,
    byteLength: evidence.exactSource.byteLength,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  };
}

function capabilities() {
  return {
    messageStarts: [{
      ...sharedMessageStartCapability,
      channel: { ...sharedMessageStartCapability.channel },
    }],
    timerStarts: [{ ...sharedTimerStartCapability }],
  };
}

function sharedWorkTask(processInstanceId: string): PublicWorkTask["task"] {
  return {
    id: {
      processInstanceId,
      elementId: "ReviewException",
      activation: 1,
    },
    name: "Review exception",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    },
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const directIntent = Object.freeze({
  protocol: "bpmn-direct-start-v1",
  intentSha256: "d".repeat(64),
});

const messageIntent = Object.freeze({
  protocol: "bpmn-message-start-v1",
  intentSha256: "e".repeat(64),
});

type SourceBoundRequest = Readonly<{
  bytes: Uint8Array;
  definition: Readonly<{ source: Readonly<{ id: string }> }>;
}>;
