import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnProcessWorkGateway,
  ProcessWorkObservationStatus,
} from "@bpmn-lean/platform-engine-gateway";

test("mints distinct canonical and service-returned Schedule locators", () => {
  const gateway = new BpmnProcessWorkGateway(fakeClient());
  const canonical = gateway.canonicalLocator("semantic-instance");
  const scheduled = gateway.scheduleExecutionLocator("execution-workflow");

  assert.match(canonical, /^bpmn-process-work-v1:/u);
  assert.match(scheduled, /^bpmn-process-work-v1:/u);
  assert.notEqual(canonical, scheduled);
  assert.notEqual(
    gateway.scheduleExecutionLocator("configured-workflow-base"),
    scheduled,
  );
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
  const locator = gateway.scheduleExecutionLocator("execution-workflow");
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

type FakeOptions = Readonly<{
  onHandle?: (workflowId: string) => void;
  tasks?: readonly unknown[];
}>;

function fakeClient(options: FakeOptions = {}) {
  return {
    getHandle: (workflowId: string) => {
      options.onHandle?.(workflowId);
      return {
        query: async () => structuredClone(options.tasks ?? []),
      };
    },
  } as never;
}
