import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  PublicWorkTask,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  SqliteWorkRepository,
  WorkAuditOutboxService,
  WorkMutationService,
  WorkService,
  WorkTaskDetailService,
} from "@bpmn-lean/platform-work";

const definition = {
  processId: "Hidden_Work_Process",
  version: 1,
  source: {
    kind: "bpmnSource" as const,
    id: "hidden-work.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  },
  semanticProfile: "profile-1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

const taskId = {
  processInstanceId: "semantic-1",
  elementId: "Review",
  activation: 1,
};

const candidateMismatchTask = {
  id: taskId,
  name: "Review",
  state: "active" as const,
  metadata: {
    assignment: {
      candidates: [{ kind: "group" as const, id: "other-reviewers" }] as const,
    },
    form: {
      fields: [{ key: "approved", type: "boolean" as const }] as const,
    },
  },
};

const metadataFreeTask = {
  id: taskId,
  name: "Review",
  state: "active" as const,
};

test("unseen policy-hidden tasks reject every mutation without audit or host mutation", async () => {
  for (const example of [
    { name: "candidate mismatch", task: candidateMismatchTask },
    { name: "metadata-free", task: metadataFreeTask },
  ] as const) {
    const harness = await createHarness(example.task);
    try {
      const auditBefore = harness.auditBytes();
      const outboxBefore = await harness.outboxBytes();

      const outcomes = await Promise.all([
        harness.service.claimTask(taskId, {
          actionId: `${example.name}-claim`,
          expectedGeneration: 0,
        }),
        harness.service.releaseTask(taskId, {
          actionId: `${example.name}-release`,
          generation: 0,
        }),
        harness.service.completeTask(`${example.name}-completion`, {
          taskId,
          expectedClaimGeneration: 0,
          submittedValues: [{
            key: "approved",
            value: { kind: "boolean", value: true },
          }],
        }),
      ]);

      assert.deepEqual(outcomes, [
        { kind: "notFound" },
        { kind: "notFound" },
        { kind: "notFound" },
      ], example.name);
      assert.equal(harness.hostMutationCalls, 0, example.name);
      assert.equal(harness.detailCalls, 0, example.name);
      assert.equal(harness.auditBytes(), auditBefore, example.name);
      assert.equal(await harness.outboxBytes(), outboxBefore, example.name);
    } finally {
      await harness.close();
    }
  }
});

async function createHarness(task: PublicWorkTask["task"]) {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-hidden-work-"));
  const repository = new SqliteWorkRepository(join(root, "work.sqlite"));
  await repository.recordConfirmedProcessInstance({
    instance: { processInstanceId: "host-1", definition },
    locator: "private:host-1",
  });
  const audit: WorkAuditEvent[] = [];
  let detailCalls = 0;
  let hostMutationCalls = 0;
  const actors = new FakeActorResolver({
    id: "demo-user",
    groups: ["reviewers"],
  });
  const gateway = {
    observeOpenWork: async () => ({
      status: "open" as const,
      openUserTasks: [structuredClone(task)],
    }),
    readWorkDetail: async () => {
      detailCalls += 1;
      throw new Error("hidden task detail crossed the policy boundary");
    },
    completeWork: async () => {
      hostMutationCalls += 1;
      throw new Error("hidden task completion crossed the policy boundary");
    },
  };
  const work = new WorkService({
    repository,
    gateway,
    actors,
    authorization: new TaskAuthorizationPolicy(),
    catalogs: { readHumanTaskCatalog: async () => null },
    limits: { maxProcesses: 1, maxTasks: 1 },
  });
  const outbox = new WorkAuditOutboxService(repository, {
    record: async (event) => {
      audit.push(structuredClone(event));
      return audit.length;
    },
  });
  const service = new WorkMutationService({
    work,
    details: new WorkTaskDetailService({ work, gateway }),
    actors,
    repository,
    gateway,
    outbox,
    auditEvents: {
      create: (input) => ({
        ...structuredClone(input),
        eventId: `event-${audit.length + 1}`,
        recordedAt: "2026-08-12T10:00:00.000Z",
      }),
    },
  });
  return {
    repository,
    service,
    auditBytes: () => JSON.stringify(audit),
    outboxBytes: async () => JSON.stringify(await repository.listUndeliveredAuditEvents()),
    get detailCalls() { return detailCalls; },
    get hostMutationCalls() { return hostMutationCalls; },
    close: async () => {
      await repository.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
