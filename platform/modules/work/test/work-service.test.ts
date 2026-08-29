import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import { decodeWorkTaskSnapshot } from "@bpmn-lean/platform-contracts";

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

test("joins only an exact source-bound catalog and orders its Product 2 priorities", async () => {
  const catalog = humanTaskCatalog([
    humanTaskDefinition("low", 20),
    humanTaskDefinition("high", 90),
  ]);
  const service = createService({
    "host-a": {
      status: "open",
      openUserTasks: [structuredOpenTask("low", 1), structuredOpenTask("high", 2)],
    },
  }, {
    registrations: [registration("host-a")],
    readHumanTaskCatalog: async () => catalog,
  });

  const snapshot = await service.listTasks();
  assert.deepEqual(snapshot.tasks.map(({ task, catalogPresentation }) => [
    task.id.elementId,
    catalogPresentation?.worklistPriority,
  ]), [["high", 90], ["low", 20]]);

  const mismatched = createService({
    "host-a": { status: "open", openUserTasks: [structuredOpenTask("high", 1)] },
  }, {
    registrations: [registration("host-a")],
    readHumanTaskCatalog: async () => ({ ...catalog, sourceSha256: "b".repeat(64) }),
  });
  const unjoined = await mismatched.listTasks();
  assert.equal(unjoined.tasks[0]?.catalogPresentation, undefined);
  assert.deepEqual(unjoined.tasks[0]?.task, structuredOpenTask("high", 1));
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
      recordObservation: async (processInstanceId, observation) => {
        recorded.push([processInstanceId, observation]);
      },
    });
    assert.equal((await service.observeSystemTasks()).length, example.expected.tasks, example.name);
    assert.deepEqual(recorded, example.expected.observations, example.name);
  }

  const recorded: [string, string][] = [];
  const unknown = createService({ "host-a": { status: "unknown" } }, {
    registrations: [registration("host-a", "active")],
    recordObservation: async (processInstanceId, observation) => {
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

test("narrows an engine-observed task to the fields the Work contract owns", async () => {
  const service = createService({
    "host-a": {
      status: "open",
      openUserTasks: [{
        ...openTask("Review", "reviewers", 1),
        // Published by the engine for the Activity data-input family. Work presents no Activity
        // data, and the browser re-decodes this snapshot strictly, so carrying an engine field the
        // Work contract does not own would refuse the whole page rather than ignore one value.
        inputs: [{
          name: "DataInput_ReviewContext",
          value: { kind: "string", value: "invoice-4711" },
        }],
      }],
    },
  }, { registrations: [registration("host-a")] });

  const snapshot = await service.listTasks();

  assert.deepEqual(snapshot.tasks.map(({ task }) => task), [openTask("Review", "reviewers", 1)]);
  assert.deepEqual(
    decodeWorkTaskSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown),
    snapshot,
  );
});

type WorkObservation =
  | { status: "open"; openUserTasks: readonly ReturnType<typeof openTask>[] | readonly unknown[] }
  | { status: "closed" | "unknown" | "unavailable" };

type ServiceOptions = Readonly<{
  registrations?: readonly ReturnType<typeof registration>[];
  recordObservation?: (
    processInstanceId: string,
    observation: "active" | "closed" | "indeterminate",
  ) => Promise<void>;
  limits?: Readonly<{ maxProcesses: number; maxTasks: number }>;
  readHumanTaskCatalog?: () => Promise<ReturnType<typeof humanTaskCatalog> | null>;
}>;

function createService(
  observations: Record<string, WorkObservation>,
  options: ServiceOptions = {},
): WorkService {
  const registrations = options.registrations ?? [registration("host-b"), registration("host-a")];
  return new WorkService({
    repository: {
      listProcessRegistrations: async () => structuredClone(registrations),
      recordObservation: options.recordObservation ?? (async () => undefined),
      getClaim: async () => ({ claimGeneration: 0, claim: null }),
    },
    gateway: {
      observeOpenWork: async ({ hostingProcessInstanceId }: { hostingProcessInstanceId: string }) =>
        structuredClone(observations[hostingProcessInstanceId]) as never,
    },
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    catalogs: {
      readHumanTaskCatalog: options.readHumanTaskCatalog ?? (async () => null),
    },
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

function structuredOpenTask(elementId: string, activation: number) {
  return {
    id: { processInstanceId: "called-a", elementId, activation },
    name: elementId,
    state: "active" as const,
    metadata: {
      assignment: { candidates: [{ kind: "group" as const, id: "reviewers" }] as const },
    },
  };
}

function humanTaskDefinition(elementId: string, worklistPriority: number) {
  return {
    elementId,
    description: `Review ${elementId}`,
    worklistPriority,
    form: {
      schemaVersion: "bpmn-lean-structured-form/v1" as const,
      fields: [{
        key: "approved",
        label: "Approved",
        helpText: null,
        defaultValue: null,
        visibleForActions: "all" as const,
        requiredForActions: [],
        kind: "boolean" as const,
      }],
      actions: [{
        id: "approve",
        label: "Approve",
        intent: "primary" as const,
        resolutionValue: "approved",
      }, {
        id: "reject",
        label: "Reject",
        intent: "neutral" as const,
        resolutionValue: "rejected",
      }],
      resolutionVariable: "resolution",
    },
  };
}

function humanTaskCatalog(tasks: readonly ReturnType<typeof humanTaskDefinition>[]) {
  return {
    schemaVersion: "bpmn-lean-human-task-catalog/v1" as const,
    processId: definition.processId,
    semanticProfile: definition.semanticProfile,
    sourceSha256: definition.source.sha256,
    tasks: [...tasks],
  };
}
