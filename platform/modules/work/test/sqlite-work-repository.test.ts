import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import { SqliteWorkRepository } from "../dist/sqlite-work-repository.js";
import type {
  WorkCompletionBinding,
  WorkClaimTransitionInput,
  WorkCompletionOutcomeInput,
  WorkReleaseTransitionInput,
  WorkTaskReference,
} from "../dist/work-contracts.js";
import {
  WorkRepositoryIntegrityError,
  WorkSchemaResetRequiredError,
} from "../dist/work-contracts.js";

const task: WorkTaskReference = {
  hostingProcessInstanceId: "host-1",
  taskId: {
    processInstanceId: "task-process-1",
    elementId: "review",
    activation: 1,
  },
};

const publication = {
  instance: {
    processInstanceId: "host-1",
    definition: {
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
    },
  },
  locator: "bpmn-process-work-v1:private-workflow-address",
};

function audit(
  eventId: string,
  actorId: string,
  kind: "claim" | "release",
  actionId: string,
  outcome: "claimed" | "idempotent" | "conflict" | "released",
): WorkAuditEvent {
  return {
    eventId,
    actorId,
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: task.taskId,
    action: kind === "claim"
      ? { kind, actionId, outcome: outcome as "claimed" | "idempotent" | "conflict" }
      : { kind, actionId, outcome: outcome as "released" | "idempotent" | "conflict" },
  };
}

function claimInput(
  actionId: string,
  actorId: string,
  expectedGeneration: number,
  eventPrefix: string,
): WorkClaimTransitionInput {
  return {
    actionId,
    actorId,
    task,
    expectedGeneration,
    audit: {
      claimed: audit(`${eventPrefix}-claimed`, actorId, "claim", actionId, "claimed"),
      idempotent: audit(`${eventPrefix}-idempotent`, actorId, "claim", actionId, "idempotent"),
      conflict: audit(`${eventPrefix}-conflict`, actorId, "claim", actionId, "conflict"),
    },
  };
}

function releaseInput(
  actionId: string,
  actorId: string,
  generation: number,
  eventPrefix: string,
): WorkReleaseTransitionInput {
  return {
    actionId,
    actorId,
    task,
    generation,
    audit: {
      released: audit(`${eventPrefix}-released`, actorId, "release", actionId, "released"),
      idempotent: audit(`${eventPrefix}-idempotent`, actorId, "release", actionId, "idempotent"),
      conflict: audit(`${eventPrefix}-conflict`, actorId, "release", actionId, "conflict"),
    },
  };
}

test("an old release retry cannot clear a later reclaim through another connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-aba-"));
  const databaseFile = join(root, "work.sqlite");
  const first = new SqliteWorkRepository(databaseFile);
  const second = new SqliteWorkRepository(databaseFile);
  try {
    await first.recordConfirmedProcessInstance(publication);
    assert.equal(first.claimTask(claimInput("claim-1", "actor-a", 0, "event-claim-1")).kind, "claimed");
    assert.equal(first.releaseTask(releaseInput("release-1", "actor-a", 1, "event-release-1")).kind, "released");
    assert.equal(second.claimTask(claimInput("claim-2", "actor-a", 2, "event-claim-2")).kind, "claimed");

    const firstRetry = releaseInput("release-1", "actor-a", 1, "event-release-retry-a");
    const secondRetry = releaseInput("release-1", "actor-a", 1, "event-release-retry-b");
    assert.equal(second.releaseTask(firstRetry).kind, "idempotent");
    assert.equal(second.releaseTask(secondRetry).kind, "idempotent");
    assert.deepEqual(first.getClaim(task), {
      claimGeneration: 3,
      claim: { actorId: "actor-a", generation: 3 },
    });
    const actionReader = second as unknown as {
      getClaimReleaseAction(actionId: string): unknown;
    };
    assert.deepEqual(actionReader.getClaimReleaseAction("release-1"), {
      binding: {
        actionId: "release-1",
        actorId: "actor-a",
        task,
        generation: 1,
        kind: "release",
      },
      result: {
        taskId: task.taskId,
        claimGeneration: 2,
        released: true,
      },
    });
    assert.equal(
      second.listUndeliveredAuditEvents().filter(({ event }) =>
        event.action.actionId === "release-1" && event.action.outcome === "idempotent"
      ).length,
      1,
    );

    const changedEvent = {
      ...secondRetry,
      audit: {
        ...secondRetry.audit,
        idempotent: {
          ...firstRetry.audit.idempotent,
          recordedAt: "2026-08-12T10:00:01.000Z",
        },
      },
    };
    assert.throws(
      () => second.releaseTask(changedEvent),
      WorkRepositoryIntegrityError,
    );
  } finally {
    first.close();
    second.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an epoch-2 database whose schema has drifted", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-schema-"));
  const databaseFile = join(root, "work.sqlite");
  let unexpectedlyOpened: SqliteWorkRepository | undefined;
  try {
    const repository = new SqliteWorkRepository(databaseFile);
    repository.close();
    const database = new DatabaseSync(databaseFile);
    database.exec("ALTER TABLE work_claims ADD COLUMN unexpected TEXT");
    database.close();

    assert.throws(
      () => {
        unexpectedlyOpened = new SqliteWorkRepository(databaseFile);
      },
      WorkSchemaResetRequiredError,
    );
  } finally {
    unexpectedlyOpened?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("two independent claim connections produce one winner", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-claim-race-"));
  const databaseFile = join(root, "work.sqlite");
  const first = new SqliteWorkRepository(databaseFile);
  const second = new SqliteWorkRepository(databaseFile);
  try {
    await first.recordConfirmedProcessInstance(publication);
    assert.equal(first.claimTask(claimInput("claim-a", "actor-a", 0, "event-a")).kind, "claimed");
    assert.equal(second.claimTask(claimInput("claim-b", "actor-b", 0, "event-b")).kind, "conflict");
    assert.deepEqual(second.getClaim(task), {
      claimGeneration: 1,
      claim: { actorId: "actor-a", generation: 1 },
    });
  } finally {
    first.close();
    second.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("serializes completion actions and retains distinct logical outcomes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-completion-"));
  const databaseFile = join(root, "work.sqlite");
  const repository = new SqliteWorkRepository(databaseFile);
  const binding = completionBinding("completion-1", true);
  try {
    await repository.recordConfirmedProcessInstance(publication);
    repository.claimTask(claimInput("claim-1", "actor-a", 0, "event-claim"));
    assert.equal(repository.reserveCompletion({
      binding,
      audit: completionAudit("reserved", binding.actionId),
    }).kind, "reserved");
    assert.equal(repository.reserveCompletion({
      binding: { ...binding, actionId: "completion-2" },
      audit: completionAudit("reserved", "completion-2"),
    }).kind, "conflict");
    assert.equal(repository.reserveCompletion({
      binding: completionBinding("completion-1", false),
      audit: completionAudit("reserved", "completion-1"),
    }).kind, "conflict");
    assert.equal(repository.beginCompletionSubmission(binding.actionId, binding).kind, "acquired");
    assert.equal(repository.recordCompletionOutcome({
      binding,
      outcome: { kind: "indeterminate" },
      audit: completionAudit("indeterminate", binding.actionId),
    }).kind, "recorded");
    assert.equal(repository.beginCompletionSubmission(binding.actionId, binding).kind, "acquired");
    const committed: WorkCompletionOutcomeInput = {
      binding,
      outcome: { kind: "committed" },
      audit: completionAudit("committed", binding.actionId),
    };
    assert.equal(repository.recordCompletionOutcome(committed).kind, "recorded");
    assert.equal(repository.recordCompletionOutcome(committed).kind, "retained");
    assert.deepEqual(repository.getClaim(task), { claimGeneration: 2, claim: null });
    assert.deepEqual(
      repository.listUndeliveredAuditEvents().map(({ event }) => event.action.outcome),
      ["claimed", "reserved", "indeterminate", "committed"],
    );
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("persists and acknowledges the audit outbox across reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-outbox-"));
  const databaseFile = join(root, "work.sqlite");
  try {
    const first = new SqliteWorkRepository(databaseFile);
    await first.recordConfirmedProcessInstance(publication);
    first.claimTask(claimInput("claim-1", "actor-a", 0, "event-claim"));
    first.close();
    const reopened = new SqliteWorkRepository(databaseFile);
    const pending = reopened.listUndeliveredAuditEvents();
    assert.equal(pending.length, 1);
    reopened.acknowledgeAuditEvent(pending[0]!.event.eventId);
    reopened.acknowledgeAuditEvent(pending[0]!.event.eventId);
    assert.deepEqual(reopened.listUndeliveredAuditEvents(), []);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function completionBinding(actionId: string, value: boolean): WorkCompletionBinding {
  return {
    actionId,
    actorId: "actor-a",
    task,
    claimGeneration: 1,
    submittedField: {
      key: "approved",
      declaredType: "boolean",
      value: { kind: "boolean", value },
    },
  };
}

function completionAudit(
  outcome: "reserved" | "committed" | "rejected" | "indeterminate",
  actionId: string,
): WorkAuditEvent {
  return {
    eventId: `${actionId}-${outcome}`,
    actorId: "actor-a",
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: task.taskId,
    action: { kind: "completion", actionId, outcome },
  };
}
