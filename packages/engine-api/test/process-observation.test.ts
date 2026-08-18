import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import {
  observeEngineProcessExecution,
  parseEngineProcessLocator,
} from "@bpmn-lean/engine-api";

const definition = {
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

test("observes through the opaque locator without exposing a Workflow address", async () => {
  const calls: unknown[] = [];
  const temporalClient = {
    getHandle: (workflowId: string) => ({
      query: async (name: string, request: unknown) => {
        calls.push({ workflowId, name, request });
        return {
          ...(request as Record<string, unknown>),
          kind: "notReady",
        };
      },
    }),
  } as never;
  const result = await observeEngineProcessExecution({
    temporalClient,
    locator: parseEngineProcessLocator(
      "bpmn-process-work-v1:execution-address",
    ),
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    afterRevision: 9,
  });
  assert.deepEqual(result, { kind: "notReady" });
  assert.deepEqual(calls, [{
    workflowId: "execution-address",
    name: "bpmn-workflow-publication-segment-selection",
    request: {
      protocol: "bpmn-lean.workflow-publication-segments.v1",
      processInstanceId: "Instance_1",
      afterRevision: 9,
    },
  }]);
  assert.equal(JSON.stringify(result).includes("execution-address"), false);
});
