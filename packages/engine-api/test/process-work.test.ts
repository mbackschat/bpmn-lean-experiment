/** Product 1 Process Work locators preserve exact producer addresses behind one private token. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineOpenWorkStatus,
  engineProcessWorkLocatorForCanonicalProcess,
  engineProcessWorkLocatorForScheduleExecution,
  observeOpenWork,
  parseEngineProcessWorkLocator,
  serializeEngineProcessWorkLocator,
} from "@bpmn-lean/engine-api";

test("round-trips canonical and service-returned locators without exposing a field shape", () => {
  const direct = engineProcessWorkLocatorForCanonicalProcess("semantic-instance-42");
  const schedule = engineProcessWorkLocatorForScheduleExecution("execution/id ✓ 42");

  assert.match(serializeEngineProcessWorkLocator(direct), /^bpmn-process-work-v1:/u);
  assert.equal(
    serializeEngineProcessWorkLocator(schedule),
    "bpmn-process-work-v1:execution%2Fid%20%E2%9C%93%2042",
  );
  assert.equal(
    serializeEngineProcessWorkLocator(parseEngineProcessWorkLocator(
      serializeEngineProcessWorkLocator(schedule),
    )),
    serializeEngineProcessWorkLocator(schedule),
  );
  assert.equal(typeof schedule, "string");
  assert.throws(
    () => parseEngineProcessWorkLocator("bpmn-process-work-v1:%2f"),
    /canonical v1 token/u,
  );
});

test("addresses Schedule work only through the service execution locator", async () => {
  const configured = engineProcessWorkLocatorForScheduleExecution("configured-base");
  const execution = engineProcessWorkLocatorForScheduleExecution("service-execution");
  const task = {
    id: { processInstanceId: "host", elementId: "Task", activation: 1 },
    name: null,
    state: "active",
  };
  const client = {
    getHandle: (workflowId: string) => ({
      query: async () => {
        if (workflowId === "service-execution") return [task];
        throw Object.assign(new Error("not found"), { name: "WorkflowNotFoundError" });
      },
      result: async () => {
        throw Object.assign(new Error("not found"), { name: "WorkflowNotFoundError" });
      },
    }),
  } as never;

  assert.deepEqual(
    await observeOpenWork({ temporalClient: client, locator: execution, hostingProcessInstanceId: "host" }),
    { status: EngineOpenWorkStatus.Open, openUserTasks: [task] },
  );
  assert.notDeepEqual(
    await observeOpenWork({ temporalClient: client, locator: configured, hostingProcessInstanceId: "host" }),
    { status: EngineOpenWorkStatus.Open, openUserTasks: [task] },
  );
});
