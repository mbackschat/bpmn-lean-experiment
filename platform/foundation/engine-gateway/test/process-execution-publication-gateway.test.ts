import assert from "node:assert/strict";
import test from "node:test";

import type {
  EngineProcessExecutionObservationRequest,
} from "@bpmn-lean/engine-api";
import {
  BpmnProcessExecutionPublicationGateway,
  createBpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";

import { publicationSegmentResponse } from "./publication-segment-test-support.ts";

const definition: EngineProcessExecutionObservationRequest["definition"] = {
  compiler: "bpmn-source-semantic-process" as
    EngineProcessExecutionObservationRequest["definition"]["compiler"],
  semanticProfile: "profile",
  sourceId: "source.bpmn",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

test("traverses one paired segment snapshot without returning its private locator", async () => {
  const calls: unknown[] = [];
  const processId = "Process";
  const processInstanceId = "instance";
  const execution = executionResult(processId, processInstanceId);
  const gateway = new BpmnProcessExecutionPublicationGateway({
    getHandle: (workflowId: string) => ({
      query: async (name: string, request: unknown) => {
        calls.push({ workflowId, name, request });
        return publicationSegmentResponse(
          name,
          request,
          {
            definition,
            processId,
            processInstanceId,
            headRevision: 1,
            current: execution.page.current,
            currentOpen: [],
          },
          execution,
          occurrenceCounterpart(processId, processInstanceId),
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

function executionResult(processId: string, processInstanceId: string) {
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

function occurrenceCounterpart(processId: string, processInstanceId: string) {
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
        committedAtEpochMs: 0,
        transitions: [{
          revision: 1,
          lifecycle: { started: [], ended: [] },
        }],
      }],
      currentOpen: [],
    },
  };
}

test("rejects a noncanonical locator before any engine lookup", () => {
  let calls = 0;
  const gateway = new BpmnProcessExecutionPublicationGateway({
    getHandle: () => {
      calls += 1;
      return {};
    },
  } as never);

  assert.throws(
    () => gateway.observe({
      locator: "execution-workflow",
      definition,
      processId: "Process",
      processInstanceId: "instance",
      afterRevision: 0,
    }),
    /canonical v1 token/u,
  );
  assert.equal(calls, 0);
});

test("exposes the publication gateway through the lazy composition runtime", async () => {
  const runtime = createBpmnEngineGatewayRuntime({
    maxSourceBytes: 1_024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "test-task-queue",
    temporalConnectTimeoutMs: 1_000,
  });
  assert.equal(
    runtime.processExecution instanceof BpmnProcessExecutionPublicationGateway,
    true,
  );
  await runtime.close();
});
