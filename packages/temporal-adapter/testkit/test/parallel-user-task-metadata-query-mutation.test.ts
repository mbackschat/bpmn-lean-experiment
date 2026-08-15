/** Separating Query checks for the combined parallel User Task metadata witness. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { UserTaskLifecycleState } from "@bpmn-lean/semantic-core";
import type { OpenUserTask } from "@bpmn-lean/semantic-core";

import {
  reconcileParallelUserTaskMetadataQuery,
} from "./parallel-user-task-metadata-query-mutation.ts";

const committed: ReadonlyArray<OpenUserTask> = [
  openTask("UserTask_ContentReview", "Review content", "contentApproved"),
  openTask("UserTask_RiskReview", "Review risk", "riskApproved"),
];

test("accepts the exact combined open-task Query", () => {
  assert.doesNotThrow(() =>
    reconcileParallelUserTaskMetadataQuery(committed, committed)
  );
});

test("rejects metadata loss without conflating it with sibling loss", () => {
  const [content, risk] = committed;
  assert.ok(content !== undefined && risk !== undefined);
  const { metadata: _metadata, ...metadataFreeRisk } = risk;

  assert.throws(
    () =>
      reconcileParallelUserTaskMetadataQuery(
        [content, metadataFreeRisk],
        committed,
      ),
    /metadata/u,
  );
});

test("rejects sibling loss without conflating it with metadata loss", () => {
  const [content] = committed;
  assert.ok(content !== undefined);

  assert.throws(
    () => reconcileParallelUserTaskMetadataQuery([content], committed),
    /sibling/u,
  );
});

function openTask(
  elementId: string,
  name: string,
  fieldKey: string,
): OpenUserTask {
  return {
    id: {
      processInstanceId: "ParallelReview_1",
      elementId,
      activation: 1,
    },
    name,
    state: UserTaskLifecycleState.Active,
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: fieldKey, type: "boolean" }] },
    },
  };
}
