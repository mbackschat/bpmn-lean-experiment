import assert from "node:assert/strict";
import test from "node:test";

import type {
  EngineProcessFlowNodeOccurrenceObservationRequest,
} from "@bpmn-lean/engine-api";
import {
  BpmnProcessFlowNodeOccurrenceGateway,
  createBpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";

import { publicationSegmentResponse } from "./publication-segment-test-support.ts";

const definition: EngineProcessFlowNodeOccurrenceObservationRequest["definition"] = {
  compiler: "bpmn-source-semantic-process" as
    EngineProcessFlowNodeOccurrenceObservationRequest["definition"]["compiler"],
  semanticProfile: "profile",
  sourceId: "metrics.bpmn",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

const processId = "MetricsProcess";
const processInstanceId = "instance";

function occurrenceResult(privateMutation = false): unknown {
  const start = {
    id: { processInstanceId, startRevision: 1, startIndex: 0 },
    processId,
    elementId: "Start",
    owner: { processInstanceId, definitionScopeId: processId, activation: 1 },
    ...(privateMutation ? { anchor: { kind: "transition" } } : {}),
  };
  return {
    kind: "available",
    page: {
      definition,
      processId,
      processInstanceId,
      requestedAfterRevision: 0,
      pageThroughRevision: 1,
      headRevision: 1,
      batches: [{
        commandId: "start",
        fromRevision: 0,
        throughRevision: 1,
        committedAtEpochMs: 100,
        transitions: [{
          revision: 1,
          lifecycle: {
            started: [start],
            ended: [{ id: start.id, terminal: "completed" }],
          },
        }],
      }],
      currentOpen: [],
    },
  };
}

test("traverses one paired occurrence snapshot without returning its private locator", async () => {
  const calls: unknown[] = [];
  const gateway = new BpmnProcessFlowNodeOccurrenceGateway({
    getHandle: (workflowId: string) => ({
      query: async (name: string, request: unknown) => {
        calls.push({ workflowId, name, request });
        return publicationSegmentResponse(
          name,
          request,
          publicationSnapshot(),
          executionCounterpart(),
          occurrenceResult(),
        );
      },
    }),
  } as never);
  const locator = "bpmn-process-work-v1:execution-workflow";

  const result = await gateway.observe({
    locator,
    definition,
    processId,
    processInstanceId,
    afterRevision: 0,
    limit: 10,
  });

  assert.equal(result.kind, "available");
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes("execution-workflow"), true);
  assert.equal(JSON.stringify(calls).includes('"afterRevision":0'), true);
  assert.equal("locator" in result, false);
  assert.equal("workflowId" in result, false);
  assert.equal("runId" in result, false);
});

test("rejects a malformed opaque locator before lookup", () => {
  let calls = 0;
  const gateway = new BpmnProcessFlowNodeOccurrenceGateway({
    getHandle: () => {
      calls += 1;
      return {};
    },
  } as never);
  assert.throws(() => gateway.observe({
    locator: "execution-workflow",
    definition,
    processId,
    processInstanceId,
    afterRevision: 0,
  }), /canonical v1 token/u);
  assert.equal(calls, 0);
});

test("fails closed when the delegated result contains a private semantic anchor", async () => {
  const gateway = new BpmnProcessFlowNodeOccurrenceGateway({
    getHandle: () => ({
      query: async (name: string, request: unknown) =>
        publicationSegmentResponse(
          name,
          request,
          publicationSnapshot(),
          executionCounterpart(),
          occurrenceResult(true),
        ),
    }),
  } as never);
  const locator = "bpmn-process-work-v1:execution-workflow";
  await assert.rejects(() => gateway.observe({
    locator,
    definition,
    processId,
    processInstanceId,
    afterRevision: 0,
  }), /malformed flow-node occurrence publication transport result/u);
});

function publicationSnapshot() {
  return {
    definition,
    processId,
    processInstanceId,
    headRevision: 1,
    current: executionCounterpart().page.current,
    currentOpen: [],
  };
}

function executionCounterpart() {
  return {
    kind: "available",
    page: {
      definition,
      processId,
      processInstanceId,
      requestedAfterRevision: 0,
      pageThroughRevision: 1,
      headRevision: 1,
      batches: [{
        commandId: "start",
        fromRevision: 0,
        throughRevision: 1,
        transitions: [{
          revision: 1,
          logicalTimeMs: 0,
          transition: {
            kind: "externalStimulus",
            stimulus: {
              kind: "startProcess",
              commandId: "start",
              processId,
              instanceId: processInstanceId,
              initialVariables: [],
            },
          },
          positionDelta: {
            consumedTokens: [],
            producedTokens: [],
            enteredScopes: [],
            exitedScopes: [],
          },
        }],
      }],
      current: {
        revision: 1,
        state: {
          kind: "state",
          instanceId: processInstanceId,
          status: "completed",
          activeWaits: [],
          openUserTasks: [],
          openMessageSubscriptions: [],
          openTimers: [],
          openEffects: [],
          openIncidents: [],
          variables: [],
          enabledInteractions: [],
          logicalTimeMs: 0,
        },
        controlTokens: [],
        scopes: [],
      },
    },
  } as const;
}

test("exposes the occurrence gateway through the lazy composition runtime", async () => {
  const runtime = createBpmnEngineGatewayRuntime({
    maxSourceBytes: 1_024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "test-task-queue",
    temporalConnectTimeoutMs: 1_000,
  });
  assert.equal(
    runtime.processFlowNodeOccurrences instanceof BpmnProcessFlowNodeOccurrenceGateway,
    true,
  );
  await runtime.close();
});
