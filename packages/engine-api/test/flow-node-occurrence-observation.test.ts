import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import {
  engineProcessLocatorForScheduleExecution,
  observeEngineProcessFlowNodeOccurrences,
} from "@bpmn-lean/engine-api";

const definition = {
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  semanticProfile: "profile-occurrences",
  sourceId: "source-occurrences",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

test("observes occurrences through one opaque locator without exposing host identity", async () => {
  const calls: unknown[] = [];
  const temporalClient = {
    getHandle: (workflowId: string) => ({
      query: async (name: string, request: unknown) => {
        calls.push({ workflowId, name, request });
        return { kind: "notReady" };
      },
    }),
  } as never;
  const result = await observeEngineProcessFlowNodeOccurrences({
    temporalClient,
    locator: engineProcessLocatorForScheduleExecution("execution-address"),
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    afterRevision: 9,
    limit: 7,
  });
  assert.deepEqual(result, { kind: "notReady" });
  assert.deepEqual(calls, [{
    workflowId: "execution-address",
    name: "bpmn-flow-node-occurrences",
    request: { afterRevision: 9, limit: 7 },
  }]);
  assert.equal(JSON.stringify(result).includes("execution-address"), false);
});

test("rejects malformed locators before delegation and keeps unavailability separate", async () => {
  let handled = 0;
  const temporalClient = {
    getHandle: (workflowId: string) => {
      handled += 1;
      return {
        query: async () => {
          throw new Error(`unavailable ${workflowId}`);
        },
      };
    },
  } as never;
  assert.throws(
    () => observeEngineProcessFlowNodeOccurrences({
      temporalClient,
      locator: "execution-address" as never,
      definition,
      processId: "Process_1",
      processInstanceId: "Instance_1",
      afterRevision: 0,
    }),
    /Engine Process locator is not a canonical v1 token/u,
  );
  assert.equal(handled, 0);
  assert.deepEqual(
    await observeEngineProcessFlowNodeOccurrences({
      temporalClient,
      locator: engineProcessLocatorForScheduleExecution("missing"),
      definition,
      processId: "Process_1",
      processInstanceId: "Instance_1",
      afterRevision: 0,
    }),
    { kind: "unavailable" },
  );
  assert.equal(handled, 1);
});
