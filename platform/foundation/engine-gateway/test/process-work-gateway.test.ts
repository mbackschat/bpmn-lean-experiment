import assert from "node:assert/strict";
import { test } from "node:test";

import { EngineVariableValueKind } from "@bpmn-lean/engine-api";
import {
  BpmnProcessWorkGateway,
  ProcessWorkObservationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type { ProcessWorkCompletionRequest } from "@bpmn-lean/platform-engine-gateway";

test("mints one canonical opaque Process locator", () => {
  const gateway = new BpmnProcessWorkGateway(fakeClient());
  const canonical = gateway.canonicalLocator("semantic-instance");

  assert.match(canonical, /^bpmn-process-work-v1:/u);
});

test("interprets the private locator and exposes only closed engine task facts", async () => {
  const calls: string[] = [];
  const gateway = new BpmnProcessWorkGateway(fakeClient({
    onHandle: (workflowId) => calls.push(workflowId),
    tasks: [{
      id: {
        processInstanceId: "semantic-instance",
        elementId: "Review_Task",
        activation: 1,
      },
      name: "Review",
      state: "active",
    }],
  }));
  const locator = "bpmn-process-work-v1:execution-workflow";
  const result = await gateway.observeOpenWork({
    locator,
    hostingProcessInstanceId: "semantic-instance",
  });

  assert.equal(result.status, ProcessWorkObservationStatus.Open);
  assert.deepEqual(
    result.status === ProcessWorkObservationStatus.Open
      ? result.openUserTasks
      : [],
    [{
      id: {
        processInstanceId: "semantic-instance",
        elementId: "Review_Task",
        activation: 1,
      },
      name: "Review",
      state: "active",
    }],
  );
  assert.deepEqual(calls, ["execution-workflow"]);
  assert.equal("workflowId" in result, false);
  assert.equal("locator" in result, false);
});

test("rejects a noncanonical locator before any SDK lookup", async () => {
  let calls = 0;
  const gateway = new BpmnProcessWorkGateway(fakeClient({
    onHandle: () => { calls += 1; },
  }));

  assert.throws(
    () => gateway.observeOpenWork({
      locator: "execution-workflow",
      hostingProcessInstanceId: "semantic-instance",
    }),
    /canonical v1 token/u,
  );
  assert.equal(calls, 0);
});

test("types the Work completion request over the five Product 2 value arms only", () => {
  const request = (value: ProcessWorkCompletionRequest["stimulus"]["submittedValues"][number]["value"]) => ({
    locator: "bpmn-process-work-v1:execution-workflow",
    hostingProcessInstanceId: "semantic-instance",
    stimulus: {
      kind: "completeUserTaskInstance",
      commandId: "complete",
      taskId: { processInstanceId: "semantic-instance", elementId: "Review_Task", activation: 1 },
      submittedValues: [{ name: "answer", value }],
    },
  }) satisfies ProcessWorkCompletionRequest;
  assert.equal(request({ kind: EngineVariableValueKind.StringList, value: ["a"] }).stimulus.submittedValues.length, 1);
  // The recursive engine arms are compile-time refused here; the engine's profile domain refuses them at runtime.
  // @ts-expect-error a Decimal is not a Product 2 Work completion value
  request({ kind: EngineVariableValueKind.Decimal, coefficient: "1", scale: 0 });
  // @ts-expect-error a List is not a Product 2 Work completion value
  request({ kind: EngineVariableValueKind.List, value: [] });
  // @ts-expect-error a Map is not a Product 2 Work completion value
  request({ kind: EngineVariableValueKind.Map, value: [] });
});

type FakeOptions = Readonly<{
  onHandle?: (workflowId: string) => void;
  tasks?: readonly unknown[];
}>;

function fakeClient(options: FakeOptions = {}) {
  return {
    getHandle: (workflowId: string) => {
      options.onHandle?.(workflowId);
      return {
        client: { connection: { withDeadline: async (_deadline: number, invoke: () => Promise<unknown>) => invoke() } },
        query: async () => structuredClone(options.tasks ?? []),
      };
    },
  } as never;
}
