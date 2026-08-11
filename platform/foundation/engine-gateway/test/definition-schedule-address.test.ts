import assert from "node:assert/strict";
import { test } from "node:test";

import {
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
} from "@bpmn-lean/platform-engine-gateway";

test("derives stable opaque host addresses from arbitrary public and semantic identities", () => {
  const reference = {
    processId: "Process/ä",
    version: 7,
    scheduleId: "schedule/東京",
  } as const;

  const scheduleId = definitionScheduleHostId(reference);
  const workflowId = definitionScheduleWorkflowIdBase("instance/東京");

  assert.match(scheduleId, /^bpmn-definition-schedule-sha256:[0-9a-f]{64}$/u);
  assert.match(workflowId, /^bpmn-process-sha256:[0-9a-f]{64}$/u);
  assert.equal(definitionScheduleHostId(reference), scheduleId);
  assert.equal(definitionScheduleWorkflowIdBase("instance/東京"), workflowId);
  assert.notEqual(
    definitionScheduleHostId({ ...reference, scheduleId: "schedule/other" }),
    scheduleId,
  );
  assert.notEqual(definitionScheduleWorkflowIdBase("instance/other"), workflowId);
  assert.equal(scheduleId.includes(reference.scheduleId), false);
  assert.equal(workflowId.includes("instance/東京"), false);
});

test("rejects malformed address inputs before hashing", () => {
  assert.throws(
    () => definitionScheduleHostId({ processId: "", version: 1, scheduleId: "id" }),
    /processId/u,
  );
  assert.throws(
    () => definitionScheduleHostId({ processId: "Process", version: 0, scheduleId: "id" }),
    /version/u,
  );
  assert.throws(
    () => definitionScheduleWorkflowIdBase(""),
    /processInstanceId/u,
  );
});
