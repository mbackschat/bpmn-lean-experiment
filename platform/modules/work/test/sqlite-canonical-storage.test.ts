import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";
import {
  SqliteWorkRepository,
  WorkRepositoryStoredValueError,
} from "@bpmn-lean/platform-work";
import type {
  WorkCompletionBinding,
  WorkTaskReference,
} from "@bpmn-lean/platform-work";

const task: WorkTaskReference = {
  hostingProcessInstanceId: "host-1",
  taskId: {
    processInstanceId: "task-process-1",
    elementId: "ReviewTask",
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

test("rejects semantically equal noncanonical JSON in every Work storage family", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-canonical-"));
  const databaseFile = join(root, "work.sqlite");
  try {
    const repository = new SqliteWorkRepository(databaseFile);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.claimTask({
      actionId: "claim-1",
      actorId: "actor-1",
      task,
      expectedGeneration: 0,
      audit: {
        claimed: audit("claim-claimed", "claim", "claim-1", "claimed"),
        idempotent: audit("claim-idempotent", "claim", "claim-1", "idempotent"),
        conflict: audit("claim-conflict", "claim", "claim-1", "conflict"),
      },
    });
    const binding: WorkCompletionBinding = {
      actionId: "completion-1",
      actorId: "actor-1",
      task,
      claimGeneration: 1,
      submittedField: {
        key: "approved",
        declaredType: "boolean",
        value: { kind: "boolean", value: true },
      },
    };
    await repository.reserveCompletion({
      binding,
      audit: audit("completion-reserved", "completion", "completion-1", "reserved"),
    });
    await repository.close();

    const database = new DatabaseSync(databaseFile);
    try {
      for (const [table, column] of [
        ["work_processes", "public_instance_json"],
        ["work_actions", "result_json"],
        ["work_completions", "binding_json"],
        ["work_audit_outbox", "event_json"],
      ] as const) {
        database.exec(`UPDATE ${table} SET ${column} = ' ' || ${column}`);
      }
    } finally {
      database.close();
    }

    const reopened = new SqliteWorkRepository(databaseFile);
    try {
      await context.test("registration", async () => {
        await assert.rejects(
          reopened.listProcessRegistrations(),
          WorkRepositoryStoredValueError,
        );
      });
      await context.test("claim or release action", async () => {
        await assert.rejects(
          reopened.getClaimReleaseAction("claim-1"),
          WorkRepositoryStoredValueError,
        );
      });
      await context.test("completion binding", async () => {
        await assert.rejects(
          reopened.getCompletionAction("completion-1"),
          WorkRepositoryStoredValueError,
        );
      });
      await context.test("audit outbox", async () => {
        await assert.rejects(
          reopened.listUndeliveredAuditEvents(),
          WorkRepositoryStoredValueError,
        );
      });
    } finally {
      await reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function audit(
  eventId: string,
  kind: "claim" | "completion",
  actionId: string,
  outcome: "claimed" | "idempotent" | "conflict" | "reserved",
): WorkAuditEvent {
  return {
    eventId,
    actorId: "actor-1",
    recordedAt: "2026-08-17T12:00:00.000Z",
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: task.taskId,
    action: kind === "claim"
      ? { kind, actionId, outcome: outcome as "claimed" | "idempotent" | "conflict" }
      : { kind, actionId, outcome: outcome as "reserved" },
  };
}
