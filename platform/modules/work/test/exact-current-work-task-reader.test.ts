import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicWorkTask } from "@bpmn-lean/platform-contracts";
import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  ExactCurrentWorkTaskReader,
  type SystemWorkTask,
  WorkSnapshotUnavailableError,
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

test("targets only the owning locator for an exact Unicode task occurrence", async () => {
  const other = candidate("other-host", "Other");
  const selected = candidate("own\u0000host", "Review\u0000task");
  const calls: unknown[] = [];
  const reader = exactReader([other, selected], async (request) => {
    calls.push(structuredClone(request));
    return {
      status: "found",
      detail: { task: structuredClone(selected.task), inputVariables: [] },
    };
  });

  const visible = await reader.findVisibleTask(selected.task.id);

  assert.equal(visible?.registration.instance.processInstanceId, "own\u0000host");
  assert.deepEqual(calls, [{
    locator: "private:own\u0000host",
    hostingProcessInstanceId: "own\u0000host",
    taskId: selected.task.id,
    inputVariableNames: [],
  }]);
});

test("reads metadata-free candidates before applying the uniform hidden policy", async () => {
  const projected = candidate("metadata-free", "Review", false);
  let calls = 0;
  const reader = exactReader([projected], async () => {
    calls += 1;
    return {
      status: "found",
      detail: { task: structuredClone(projected.task), inputVariables: [] },
    };
  });

  assert.equal(await reader.findVisibleTaskDetail(projected.task.id), null);
  assert.equal(calls, 1);
});

test("omits absent current tasks and fails unavailable on changed or uncertain facts", async () => {
  const projected = candidate("stale", "Review");
  assert.equal(
    await exactReader([projected], async () => ({ status: "notFound" }))
      .findVisibleTask(projected.task.id),
    null,
  );
  await assert.rejects(
    exactReader([projected], async () => ({
      status: "found",
      detail: {
        task: { ...projected.task, name: "Changed" },
        inputVariables: [],
      },
    })).findVisibleTask(projected.task.id),
    WorkSnapshotUnavailableError,
  );
  await assert.rejects(
    exactReader([projected], async () => ({ status: "unavailable" }))
      .findVisibleTask(projected.task.id),
    WorkSnapshotUnavailableError,
  );
});

test("fetches declared detail values in the same single exact Product 1 read", async () => {
  const projected = candidate("detail", "Review");
  const requestedNames: string[][] = [];
  const reader = exactReader([projected], async ({ inputVariableNames }) => {
    requestedNames.push([...inputVariableNames]);
    return {
      status: "found",
      detail: {
        task: structuredClone(projected.task),
        inputVariables: [{ name: "approved", value: { kind: "boolean", value: false } }],
      },
    };
  });

  const exact = await reader.findVisibleTaskDetail(projected.task.id);

  assert.deepEqual(requestedNames, [["approved"]]);
  assert.deepEqual(exact?.inputVariables, [
    { name: "approved", value: { kind: "boolean", value: false } },
  ]);
});

function exactReader(
  candidates: readonly SystemWorkTask[],
  readWorkDetail: (
    request: Readonly<{
      locator: string;
      hostingProcessInstanceId: string;
      taskId: PublicWorkTask["task"]["id"];
      inputVariableNames: readonly string[];
    }>,
  ) => Promise<
    | Readonly<{
        status: "found";
        detail: Readonly<{
          task: PublicWorkTask["task"];
          inputVariables: readonly unknown[];
        }>;
      }>
    | Readonly<{ status: "notFound" | "closed" | "unknown" | "unavailable" }>
  >,
): ExactCurrentWorkTaskReader {
  return new ExactCurrentWorkTaskReader({
    candidates: {
      findTaskCandidate: async (taskId) => {
        const matches = candidates.filter(({ task }) => sameTaskId(task.id, taskId));
        return matches.length === 1 ? structuredClone(matches[0]!) : null;
      },
    },
    gateway: { readWorkDetail },
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    catalogs: { readHumanTaskCatalog: async () => null },
  });
}

function candidate(
  hostingProcessInstanceId: string,
  elementId: string,
  withMetadata = true,
): SystemWorkTask {
  const task: PublicWorkTask["task"] = {
    id: { processInstanceId: hostingProcessInstanceId, elementId, activation: 1 },
    name: elementId,
    state: "active",
    ...(withMetadata
      ? {
          metadata: {
            assignment: {
              candidates: [{ kind: "group" as const, id: "reviewers" }] as const,
            },
            form: {
              fields: [{ key: "approved", type: "boolean" as const }] as const,
            },
          },
        }
      : {}),
  };
  return {
    registration: {
      instance: { processInstanceId: hostingProcessInstanceId, definition },
      locator: `private:${hostingProcessInstanceId}`,
      observation: "active",
    },
    task,
    claim: { claimGeneration: 0, claim: null },
    structuredTask: null,
  };
}

function sameTaskId(
  left: PublicWorkTask["task"]["id"],
  right: PublicWorkTask["task"]["id"],
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}
