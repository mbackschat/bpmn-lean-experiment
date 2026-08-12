import assert from "node:assert/strict";
import { test } from "node:test";

import {
  m3HostFailureDiagnostic,
  reportM3HostFailure,
} from "../src/host-log.ts";

test("host failure logging excludes private failure facts", () => {
  const messages: string[] = [];
  const failure = {
    workflowId: "private:workflow-id-secret",
    locator: "private:locator-secret",
    runId: "private:run-id-secret",
    taskQueue: "private:task-queue-secret",
    scheduleId: "private:schedule-id-secret",
    history: { commandId: "private:command-secret" },
  };

  reportM3HostFailure(failure, (message) => messages.push(message));

  assert.deepEqual(messages, [m3HostFailureDiagnostic]);
  const logged = JSON.stringify(messages);
  const privateSentinels = [
    ...Object.keys(failure),
    "commandId",
    ...Object.values(failure).flatMap((value) =>
      typeof value === "string" ? [value] : Object.values(value)
    ),
  ];
  for (const secret of privateSentinels) {
    assert.equal(logged.includes(secret), false);
  }
});
