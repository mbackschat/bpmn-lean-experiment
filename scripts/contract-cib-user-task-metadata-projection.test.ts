import assert from "node:assert/strict";
import { test } from "node:test";

import {
  userTaskMetadataProfileId,
  projectCibUserTaskMetadata,
} from "./contract-cib-user-task-metadata-projection.ts";
import type {
  TaskQueryTask,
} from "./contract-cib-evidence.ts";

const selectedTask = {
  elementId: "UserTask_Approve",
  name: "Approve",
  identityLinks: [{
    type: "candidate",
    userId: null,
    groupId: "invoice-approvers",
  }],
  formFields: [{ id: "approved", typeName: "boolean" }],
} as const satisfies TaskQueryTask;

test("projects neutral task metadata only from raw public-service facts", () => {
  assert.deepEqual(
    projectCibUserTaskMetadata(userTaskMetadataProfileId, selectedTask),
    {
      assignment: {
        candidates: [{ kind: "group", id: "invoice-approvers" }],
      },
      form: {
        fields: [{ key: "approved", type: "boolean" }],
      },
    },
  );

  assert.notDeepEqual(
    projectCibUserTaskMetadata(userTaskMetadataProfileId, {
      ...selectedTask,
      formFields: [{ id: "approved", typeName: "string" }],
    }),
    projectCibUserTaskMetadata(userTaskMetadataProfileId, selectedTask),
  );
});

test("refuses missing, extra, or wrong-kind raw metadata facts", () => {
  const invalidTasks: ReadonlyArray<TaskQueryTask> = [
    {
      elementId: selectedTask.elementId,
      name: selectedTask.name,
      formFields: selectedTask.formFields,
    },
    {
      elementId: selectedTask.elementId,
      name: selectedTask.name,
      identityLinks: selectedTask.identityLinks,
    },
    {
      ...selectedTask,
      identityLinks: [
        ...selectedTask.identityLinks,
        { type: "candidate", userId: null, groupId: "extra" },
      ],
    },
    {
      ...selectedTask,
      identityLinks: [{
        type: "candidate",
        userId: "source-derived-user",
        groupId: "invoice-approvers",
      }],
    },
    {
      ...selectedTask,
      formFields: [
        ...selectedTask.formFields,
        { id: "source-derived-field", typeName: "boolean" },
      ],
    },
  ];
  for (const task of invalidTasks) {
    assert.throws(
      () => projectCibUserTaskMetadata(userTaskMetadataProfileId, task),
      /requires exactly one|must be a candidate group/,
    );
  }
});

test("keeps metadata properties physically absent for every old profile", () => {
  const oldTask = {
    elementId: "UserTask_Approve",
    name: "Approve",
  } satisfies TaskQueryTask;
  assert.equal(
    projectCibUserTaskMetadata(
      "cibseven-2.2.0-user-task-boolean-completion-draft",
      oldTask,
    ),
    undefined,
  );
  assert.throws(
    () => projectCibUserTaskMetadata(
      "cibseven-2.2.0-user-task-boolean-completion-draft",
      selectedTask,
    ),
    /old profile must omit raw User Task metadata/,
  );
});
