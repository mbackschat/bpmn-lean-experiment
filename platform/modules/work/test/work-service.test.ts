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

test("classifies every registration state without producing a partial snapshot", async () => {
  const cases = [
    {
      name: "an active host with zero tasks stays active",
      registrations: [registration("host-a", "active")],
      observations: { "host-a": { status: "open" as const, openUserTasks: [] } },
      expected: { tasks: 0, observations: [["host-a", "active"]] },
    },
    {
      name: "a positively closed host is not queried",
      registrations: [registration("host-a", "closed")],
      observations: {},
      expected: { tasks: 0, observations: [] },
    },
    {
      name: "a gateway-closed host becomes positively closed",
      registrations: [registration("host-a", "active")],
      observations: { "host-a": { status: "closed" as const } },
      expected: { tasks: 0, observations: [["host-a", "closed"]] },
    },
    {
      name: "an indeterminate host recovers to active",
      registrations: [registration("host-a", "indeterminate")],
      observations: {
        "host-a": { status: "open" as const, openUserTasks: [openTask("recovered", "reviewers", 1)] },
      },
      expected: { tasks: 1, observations: [["host-a", "active"]] },
    },
  ] as const;
  for (const example of cases) {
    const recorded: [string, string][] = [];
    const service = createService(example.observations, {
      registrations: example.registrations,
      recordObservation: (processInstanceId, observation) => {
        recorded.push([processInstanceId, observation]);
      },
    });
    assert.equal((await service.observeSystemTasks()).length, example.expected.tasks, example.name);
    assert.deepEqual(recorded, example.expected.observations, example.name);
  }

  const recorded: [string, string][] = [];
  const unknown = createService({ "host-a": { status: "unknown" } }, {
    registrations: [registration("host-a", "active")],
    recordObservation: (processInstanceId, observation) => {
      recorded.push([processInstanceId, observation]);
    },
  });
  await assert.rejects(unknown.observeSystemTasks(), WorkSnapshotUnavailableError);
  assert.deepEqual(recorded, [["host-a", "indeterminate"]]);
});

test("enforces both configured aggregation ceilings", async () => {
  const cases = [
    {
      name: "Process ceiling",
      registrations: [registration("host-a"), registration("host-b")],
      observations: {},
      limits: { maxProcesses: 1, maxTasks: 10 },
    },
    {
      name: "task ceiling",
      registrations: [registration("host-a")],
      observations: {
        "host-a": {
          status: "open" as const,
          openUserTasks: [openTask("first", "reviewers", 1), openTask("second", "reviewers", 2)],
        },
      },
      limits: { maxProcesses: 1, maxTasks: 1 },
    },
  ] as const;
  for (const example of cases) {
    const service = createService(example.observations, {
      registrations: example.registrations,
      limits: example.limits,
    });
    await assert.rejects(service.observeSystemTasks(), WorkSnapshotUnavailableError, example.name);
  }
});

type WorkObservation =
  | { status: "open"; openUserTasks: readonly ReturnType<typeof openTask>[] | readonly unknown[] }
  | { status: "closed" | "unknown" | "unavailable" };

type ServiceOptions = Readonly<{
  registrations?: readonly ReturnType<typeof registration>[];
  recordObservation?: (
    processInstanceId: string,
    observation: "active" | "closed" | "indeterminate",
  ) => void;
  limits?: Readonly<{ maxProcesses: number; maxTasks: number }>;
}>;

function createService(
  observations: Record<string, WorkObservation>,
  options: ServiceOptions = {},
): WorkService {
  const registrations = options.registrations ?? [registration("host-b"), registration("host-a")];
  return new WorkService({
    repository: {
      listProcessRegistrations: () => structuredClone(registrations),
      recordObservation: options.recordObservation ?? (() => undefined),
      getClaim: () => ({ claimGeneration: 0, claim: null }),
    },
    gateway: {
      observeOpenWork: async ({ hostingProcessInstanceId }: { hostingProcessInstanceId: string }) =>
        structuredClone(observations[hostingProcessInstanceId]) as never,
    },
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    limits: options.limits ?? { maxProcesses: 10, maxTasks: 20 },
  });
}

function registration(
  processInstanceId: string,
  observation: "active" | "closed" | "indeterminate" = "indeterminate",
) {
  return {
    instance: { processInstanceId, definition },
    locator: `private:${processInstanceId}`,
    observation,
  };
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
