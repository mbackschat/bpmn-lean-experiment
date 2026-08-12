import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import {
  WorkService,
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

test("fails the complete snapshot when any current host is unavailable", async () => {
  const observations: Record<string, WorkObservation> = {
    "host-a": {
      status: "open",
      openUserTasks: [{
        id: { processInstanceId: "called-a", elementId: "Review", activation: 1 },
        name: "Review",
        state: "active",
        metadata: {
          assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
          form: { fields: [{ key: "approved", type: "boolean" }] },
        },
      }],
    },
    "host-b": { status: "unavailable" },
  };
  const service = createService(observations);

  await assert.rejects(service.listTasks(), WorkSnapshotUnavailableError);
});

test("projects actor-visible tasks only after exact system aggregation", async () => {
  const service = createService({
    "host-a": {
      status: "open",
      openUserTasks: [
        openTask("eligible", "reviewers", 2),
        openTask("ineligible", "managers", 1),
        { id: { processInstanceId: "called-a", elementId: "plain", activation: 3 }, name: null, state: "active" },
      ],
    },
    "host-b": { status: "open", openUserTasks: [openTask("first", "reviewers", 1)] },
  });

  const system = await service.observeSystemTasks();
  assert.equal(system.length, 4);
  const snapshot = await service.listTasks();
  assert.deepEqual(snapshot.tasks.map(({ hostingInstance, task }) => [
    hostingInstance.processInstanceId,
    task.id.elementId,
  ]), [
    ["host-a", "eligible"],
    ["host-b", "first"],
  ]);
  assert.equal("locator" in snapshot.tasks[0]!, false);
});

type WorkObservation =
  | { status: "open"; openUserTasks: ReturnType<typeof openTask>[] | unknown[] }
  | { status: "closed" | "unknown" | "unavailable" };

function createService(observations: Record<string, WorkObservation>): WorkService {
  const registrations = ["host-b", "host-a"].map((processInstanceId) => ({
    instance: { processInstanceId, definition },
    locator: `private:${processInstanceId}`,
    observation: "indeterminate" as const,
  }));
  return new WorkService({
    repository: {
      listProcessRegistrations: () => structuredClone(registrations),
      recordObservation: () => undefined,
      getClaim: () => ({ claimGeneration: 0, claim: null }),
    },
    gateway: {
      observeOpenWork: async ({ hostingProcessInstanceId }: { hostingProcessInstanceId: string }) =>
        structuredClone(observations[hostingProcessInstanceId]) as never,
    },
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    limits: { maxProcesses: 10, maxTasks: 20 },
  });
}

function openTask(elementId: string, group: string, activation: number) {
  return {
    id: { processInstanceId: "called-a", elementId, activation },
    name: elementId,
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: group }] },
      form: { fields: [{ key: "approved", type: "boolean" }] },
    },
  };
}
