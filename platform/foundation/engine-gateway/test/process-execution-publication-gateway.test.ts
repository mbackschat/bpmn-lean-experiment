import assert from "node:assert/strict";
import test from "node:test";

import {
  engineProcessLocatorForScheduleExecution,
  serializeEngineProcessLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineProcessExecutionObservationRequest,
} from "@bpmn-lean/engine-api";
import {
  BpmnProcessExecutionPublicationGateway,
  createBpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";

const definition: EngineProcessExecutionObservationRequest["definition"] = {
  compiler: "bpmn-source-semantic-process" as
    EngineProcessExecutionObservationRequest["definition"]["compiler"],
  semanticProfile: "profile",
  sourceId: "source.bpmn",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

test("delegates once with exact public identity and returns no private locator", async () => {
  const calls: unknown[] = [];
  const processId = "Process";
  const processInstanceId = "instance";
  const gateway = new BpmnProcessExecutionPublicationGateway({
    getHandle: (workflowId: string) => ({
      query: async (name: string, request: unknown) => {
        calls.push({ workflowId, name, request });
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
        };
      },
    }),
  } as never);
  const locator = serializeEngineProcessLocator(
    engineProcessLocatorForScheduleExecution("execution-workflow"),
  );

  const result = await gateway.observe({
    locator,
    definition,
    processId,
    processInstanceId,
    afterRevision: 0,
    limit: 10,
  });

  assert.equal(result.kind, "available");
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls).includes("execution-workflow"), true);
  assert.equal(JSON.stringify(calls).includes('"afterRevision":0'), true);
  assert.equal("locator" in result, false);
  assert.equal("workflowId" in result, false);
  assert.equal("runId" in result, false);
});

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
