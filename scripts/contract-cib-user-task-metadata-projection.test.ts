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

const parallelProfileId =
  "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft";

const parallelTasks = [{
  elementId: "UserTask_ContentReview",
  name: "Review content",
  identityLinks: [{
    type: "candidate",
    userId: null,
    groupId: "reviewers",
  }],
  formFields: [{ id: "contentApproved", typeName: "boolean" }],
}, {
  elementId: "UserTask_RiskReview",
  name: "Review risk",
  identityLinks: [{
    type: "candidate",
    userId: null,
    groupId: "reviewers",
  }],
  formFields: [{ id: "riskApproved", typeName: "boolean" }],
}] as const satisfies ReadonlyArray<TaskQueryTask>;

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

test("projects the composed profile by BPMN element identity independently of query order", () => {
  const projectByElement = (tasks: ReadonlyArray<TaskQueryTask>) =>
    Object.fromEntries(tasks.map((task) => [
      task.elementId,
      projectCibUserTaskMetadata(parallelProfileId, task),
    ]));
  const expected = {
    UserTask_ContentReview: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "contentApproved", type: "boolean" }] },
    },
    UserTask_RiskReview: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "riskApproved", type: "boolean" }] },
    },
  };

  assert.deepEqual(projectByElement(parallelTasks), expected);
  assert.deepEqual(projectByElement([...parallelTasks].reverse()), {
    UserTask_RiskReview: expected.UserTask_RiskReview,
    UserTask_ContentReview: expected.UserTask_ContentReview,
  });

  const swapped = parallelTasks.map((task, index) => ({
    ...task,
    identityLinks: parallelTasks[1 - index]?.identityLinks,
    formFields: parallelTasks[1 - index]?.formFields,
  })) as ReadonlyArray<TaskQueryTask>;
  assert.notDeepEqual(projectByElement(swapped), expected);
  assert.notDeepEqual(projectByElement(parallelTasks.slice(0, 1)), expected);
});
