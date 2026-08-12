import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type PublicWorkTask,
} from "@bpmn-lean/platform-contracts";
import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import {
  WorkService,
  WorkSnapshotUnavailableError,
  WorkTaskDetailService,
} from "@bpmn-lean/platform-work";

const definition = {
  processId: "Review_Process",
  version: 1,
  source: {
    kind: "bpmnSource" as const,
    id: "review.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  },
  semanticProfile: "profile-1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

const task = {
  id: { processInstanceId: "called-1", elementId: "Review", activation: 1 },
  name: "Review",
  state: "active" as const,
  metadata: {
    assignment: { candidates: [{ kind: "group" as const, id: "reviewers" }] as const },
    form: { fields: [{ key: "approved", type: "boolean" as const }] as const },
  },
};

test("preserves absent, null, Boolean false, and string false without coercion", async () => {
  const values = [
    [],
    [{ name: "approved", value: { kind: "null" } }],
    [{ name: "approved", value: { kind: "boolean", value: false } }],
    [{ name: "approved", value: { kind: "string", value: "false" } }],
  ] as const;
  const expected = [
    { kind: "absent" },
    { kind: "null" },
    { kind: "boolean", value: false },
    { kind: "string", value: "false" },
  ] as const;
  for (let index = 0; index < values.length; index += 1) {
    const detail = createDetailService(values[index]!).service;
    const result = await detail.getTaskDetail(task.id);
    assert.deepEqual(result?.form?.fields[0].currentValue, expected[index]);
    assert.equal(
      result?.form?.fields[0].compatibility,
      index === 3 ? "incompatible" : "compatible",
    );
  }
});

test("preserves Boolean false as incompatible with a string declaration", async () => {
  const stringTask: PublicWorkTask["task"] = {
    ...task,
    metadata: {
      ...task.metadata,
      form: { fields: [{ key: "approved", type: "string" }] },
    },
  };
  const booleanDetail = createDetailService(
    [{ name: "approved", value: { kind: "boolean", value: false } }],
    stringTask,
    stringTask,
  ).service;
  const stringDetail = createDetailService(
    [{ name: "approved", value: { kind: "string", value: "false" } }],
    stringTask,
    stringTask,
  ).service;

  assert.deepEqual((await booleanDetail.getTaskDetail(task.id))?.form?.fields[0], {
    key: "approved",
    type: "string",
    currentValue: { kind: "boolean", value: false },
    compatibility: "incompatible",
  });
  assert.deepEqual((await stringDetail.getTaskDetail(task.id))?.form?.fields[0], {
    key: "approved",
    type: "string",
    currentValue: { kind: "string", value: "false" },
    compatibility: "compatible",
  });
});

test("fails closed when detail drifts from the freshly observed occurrence", async () => {
  const { service } = createDetailService([], {
    ...task,
    name: "Changed by another projection",
  });

  await assert.rejects(service.getTaskDetail(task.id), WorkSnapshotUnavailableError);
});

function createDetailService(
  inputVariables: readonly unknown[],
  detailTask: PublicWorkTask["task"] = task,
  observedTask: PublicWorkTask["task"] = task,
): { service: WorkTaskDetailService } {
  const registration = {
    instance: { processInstanceId: "host-1", definition },
    locator: "private:host-1",
    observation: "active" as const,
  };
  const work = new WorkService({
    repository: {
      listProcessRegistrations: () => [structuredClone(registration)],
      recordObservation: () => undefined,
      getClaim: () => ({ claimGeneration: 0, claim: null }),
    },
    gateway: {
      observeOpenWork: async () => ({ status: "open", openUserTasks: [structuredClone(observedTask)] }),
    },
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    limits: { maxProcesses: 10, maxTasks: 10 },
  });
  return {
    service: new WorkTaskDetailService({
      work,
      gateway: {
        readWorkDetail: async () => ({
          status: "found",
          detail: {
            task: structuredClone(detailTask),
            inputVariables: structuredClone(inputVariables),
          },
        }),
      },
    }),
  };
}
