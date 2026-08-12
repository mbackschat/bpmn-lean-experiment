import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import {
  AuditEventIntegrityError,
  AuditSearchService,
  SqliteAuditRepository,
} from "../dist/index.js";

const event = (overrides: Partial<WorkAuditEvent> = {}): WorkAuditEvent => ({
  eventId: "event-1",
  actorId: "demo-user",
  recordedAt: "2026-08-12T10:00:00.000Z",
  hostingProcessInstanceId: "host-1",
  taskId: {
    processInstanceId: "task-process-1",
    elementId: "ReviewTask",
    activation: 1,
  },
  action: { kind: "claim", actionId: "action-1", outcome: "claimed" },
  ...overrides,
});

test("rejects changed content under one event ID", () => {
  withRepository((repository) => {
    repository.record(event());
    assert.throws(
      () => repository.record(event({ actorId: "other-user" })),
      AuditEventIntegrityError,
    );
  });
});

test("stores equivalent retries once and survives reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const first = new SqliteAuditRepository(databaseFile);
    first.record(event());
    first.record(event());
    first.close();
    const reopened = new SqliteAuditRepository(databaseFile);
    assert.deepEqual(new AuditSearchService(reopened).search({
      actorId: "demo-user",
      limit: 50,
    }), { events: [event()], nextCursor: null });
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("filters exact actor, Process identities, and action kind", () => {
  withRepository((repository) => {
    const second = event({
      eventId: "event-2",
      hostingProcessInstanceId: "host-2",
      taskId: { processInstanceId: "task-process-2", elementId: "Approve", activation: 2 },
      action: { kind: "completion", actionId: "action-2", outcome: "reserved" },
    });
    repository.record(event());
    repository.record(second);
    const service = new AuditSearchService(repository);
    assert.deepEqual(service.search({
      actorId: "demo-user",
      taskProcessInstanceId: "task-process-2",
      hostingProcessInstanceId: "host-2",
      actionKind: "completion",
      limit: 50,
    }).events, [second]);
    assert.deepEqual(service.search({ actorId: "other-user", limit: 50 }).events, []);
  });
});

test("pages in stable insertion order across newer inserts", () => {
  withRepository((repository) => {
    repository.record(event());
    repository.record(event({ eventId: "event-2", recordedAt: "2026-08-12T10:00:01.000Z" }));
    const service = new AuditSearchService(repository);
    const first = service.search({ actorId: "demo-user", limit: 1 });
    assert.deepEqual(first.events.map(({ eventId }) => eventId), ["event-1"]);
    assert.notEqual(first.nextCursor, null);
    repository.record(event({ eventId: "event-3", recordedAt: "2026-08-12T10:00:02.000Z" }));
    assert.notEqual(first.nextCursor, null);
    const second = service.search({
      actorId: "demo-user",
      cursor: first.nextCursor as string,
      limit: 2,
    });
    assert.deepEqual(second.events.map(({ eventId }) => eventId), ["event-2", "event-3"]);
    assert.equal(second.nextCursor, null);
  });
});

test("rejects malformed cursors before repository search", () => {
  withRepository((repository) => {
    const service = new AuditSearchService(repository);
    for (const cursor of ["v1.padded=", "v1.MA", "v2.MQ", "v1.@@"]) {
      assert.throws(
        () => service.search({ actorId: "demo-user", cursor, limit: 50 }),
        TypeError,
      );
    }
  });
});

test("fails closed when redundant filter columns disagree with stored JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const repository = new SqliteAuditRepository(databaseFile);
    repository.record(event());
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.prepare("UPDATE work_audit_events SET action_kind = 'release'").run();
    database.close();
    const reopened = new SqliteAuditRepository(databaseFile);
    assert.throws(
      () => new AuditSearchService(reopened).search({ actorId: "demo-user", limit: 50 }),
      /stored audit event is invalid/,
    );
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function withRepository(run: (repository: SqliteAuditRepository) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  const repository = new SqliteAuditRepository(databaseFile);
  try {
    run(repository);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function requireSqlite(): typeof import("node:sqlite") {
  return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
}
