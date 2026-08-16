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
} from "@bpmn-lean/platform-audit";

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

test("rejects changed content under one event ID", async () => {
  await withRepository(async (repository) => {
    await repository.record(event());
    await assert.rejects(
      repository.record(event({ actorId: "other-user" })),
      AuditEventIntegrityError,
    );
  });
});

test("stores equivalent retries once and survives reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const first = new SqliteAuditRepository(databaseFile);
    await first.record(event());
    await first.record(event());
    first.close();
    const reopened = new SqliteAuditRepository(databaseFile);
    assert.deepEqual(await new AuditSearchService(reopened).search({
      actorId: "demo-user",
      limit: 50,
    }), { events: [event()], nextCursor: null });
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("filters exact actor, Process identities, and action kind", async () => {
  await withRepository(async (repository) => {
    const second = event({
      eventId: "event-2",
      hostingProcessInstanceId: "host-2",
      taskId: { processInstanceId: "task-process-2", elementId: "Approve", activation: 2 },
      action: { kind: "completion", actionId: "action-2", outcome: "reserved" },
    });
    await repository.record(event());
    await repository.record(second);
    const service = new AuditSearchService(repository);
    assert.deepEqual((await service.search({
      actorId: "demo-user",
      taskProcessInstanceId: "task-process-2",
      hostingProcessInstanceId: "host-2",
      actionKind: "completion",
      limit: 50,
    })).events, [second]);
    assert.deepEqual((await service.search({ actorId: "other-user", limit: 50 })).events, []);
  });
});

test("pages in stable insertion order across newer inserts", async () => {
  await withRepository(async (repository) => {
    await repository.record(event());
    await repository.record(event({ eventId: "event-2", recordedAt: "2026-08-12T10:00:01.000Z" }));
    const service = new AuditSearchService(repository);
    const first = await service.search({ actorId: "demo-user", limit: 1 });
    assert.deepEqual(first.events.map(({ eventId }) => eventId), ["event-1"]);
    assert.notEqual(first.nextCursor, null);
    await repository.record(event({ eventId: "event-3", recordedAt: "2026-08-12T10:00:02.000Z" }));
    assert.notEqual(first.nextCursor, null);
    const second = await service.search({
      actorId: "demo-user",
      cursor: first.nextCursor as string,
      limit: 2,
    });
    assert.deepEqual(second.events.map(({ eventId }) => eventId), ["event-2", "event-3"]);
    assert.equal(second.nextCursor, null);
  });
});

test("takes one bounded hosting-instance snapshot in source-local order", async () => {
  await withRepository(async (repository) => {
    const other = event({
      eventId: "event-other",
      hostingProcessInstanceId: "host-other",
    });
    const later = event({
      eventId: "event-2",
      recordedAt: "2026-08-12T09:59:59.000Z",
    });
    await repository.record(event());
    await repository.record(other);
    await repository.record(later);
    const snapshot = await repository.snapshotHostingProcessInstance("host-1", {
      maxEvents: 10,
      maxStoredBytes: 10_000,
    });
    assert.deepEqual(snapshot, {
      headEventId: "event-2",
      events: [event(), later],
    });
    await repository.record(event({
      eventId: "event-3",
      recordedAt: "2026-08-12T10:00:02.000Z",
    }));
    assert.deepEqual(snapshot.events.map(({ eventId }) => eventId), [
      "event-1",
      "event-2",
    ]);
    const extended = await repository.snapshotHostingProcessInstance("host-1", {
      maxEvents: 10,
      maxStoredBytes: 10_000,
    });
    assert.deepEqual(extended.events.slice(0, snapshot.events.length), snapshot.events);
    assert.equal(extended.headEventId, "event-3");
  });
});

test("fails a snapshot above its event or stored UTF-8 byte ceiling", async () => {
  await withRepository(async (repository) => {
    const multibyte = event({ actorId: "operator-🚀" });
    await repository.record(multibyte);
    await repository.record(event({ eventId: "event-2" }));
    await assert.rejects(
      repository.snapshotHostingProcessInstance("host-1", {
        maxEvents: 1,
        maxStoredBytes: 10_000,
      }),
      /snapshot limit/u,
    );
    await assert.rejects(
      repository.snapshotHostingProcessInstance("host-1", {
        maxEvents: 10,
        maxStoredBytes: Buffer.byteLength(JSON.stringify(multibyte), "utf8") - 1,
      }),
      /snapshot limit/u,
    );
  });
});

test("rejects malformed cursors before repository search", async () => {
  await withRepository(async (repository) => {
    const service = new AuditSearchService(repository);
    for (const cursor of ["v1.padded=", "v1.MA", "v2.MQ", "v1.@@"]) {
      await assert.rejects(
        service.search({ actorId: "demo-user", cursor, limit: 50 }),
        TypeError,
      );
    }
  });
});

test("fails closed when redundant filter columns disagree with stored JSON", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const repository = new SqliteAuditRepository(databaseFile);
    await repository.record(event());
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.prepare("UPDATE work_audit_events SET action_kind = 'release'").run();
    database.close();
    const reopened = new SqliteAuditRepository(databaseFile);
    await assert.rejects(
      new AuditSearchService(reopened).search({ actorId: "demo-user", limit: 50 }),
      /stored audit event is invalid/,
    );
    await assert.rejects(
      reopened.snapshotHostingProcessInstance("host-1", {
        maxEvents: 10,
        maxStoredBytes: 10_000,
      }),
      /stored audit event is invalid/u,
    );
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects the previous audit schema epoch without migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const repository = new SqliteAuditRepository(databaseFile);
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.exec("PRAGMA user_version = 1");
    database.close();
    assert.throws(
      () => new SqliteAuditRepository(databaseFile),
      /exact supported epoch/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function withRepository(
  run: (repository: SqliteAuditRepository) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-"));
  const databaseFile = join(directory, "audit.sqlite");
  const repository = new SqliteAuditRepository(databaseFile);
  try {
    await run(repository);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function requireSqlite(): typeof import("node:sqlite") {
  return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
}
