import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IncidentAuditEvent } from "@bpmn-lean/platform-contracts";

import {
  IncidentAuditEventFactory,
  IncidentAuditEventIntegrityError,
  IncidentAuditSearchService,
  SqliteIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";

const incidentId = {
  effectId: {
    processInstanceId: "process-1",
    elementId: "ServiceTask_Fail",
    activation: 1,
  },
  generation: 1,
} as const;

const event = (
  overrides: Partial<IncidentAuditEvent> = {},
): IncidentAuditEvent => ({
  eventId: "event-1",
  actorId: "operator-1",
  recordedAt: "2026-08-14T10:00:00.000Z",
  hostingProcessInstanceId: "process-1",
  incidentId,
  actionId: "action-1",
  actionKind: "retryIncident",
  outcome: "reserved",
  ...overrides,
});

test("rejects changed incident audit content under one event ID", async () => {
  await withRepository(async (repository) => {
    await repository.record({ ordinal: 1, event: event() });
    await assert.rejects(
      repository.record({ ordinal: 1, event: event({ outcome: "committed" }) }),
      IncidentAuditEventIntegrityError,
    );
  });
});

test("rejects another event identity for the same action outcome", async () => {
  await withRepository(async (repository) => {
    await repository.record({ ordinal: 1, event: event() });
    await assert.rejects(
      repository.record({ ordinal: 1, event: event({ eventId: "event-2" }) }),
      IncidentAuditEventIntegrityError,
    );
  });
});

test("mints incident audit identity and canonical time independently of Work audit", () => {
  const factory = new IncidentAuditEventFactory({
    generateId: () => "event-minted",
    now: () => new Date("2026-08-14T10:00:00.000Z"),
  });
  assert.deepEqual(factory.create({
    actorId: "operator-1",
    hostingProcessInstanceId: "process-1",
    incidentId,
    actionId: "action-1",
    actionKind: "retryIncident",
    outcome: "reserved",
  }), event({ eventId: "event-minted" }));
});

test("stores equivalent retries once and survives reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const first = new SqliteIncidentAuditRepository(databaseFile);
    await first.record({ ordinal: 1, event: event() });
    await first.record({ ordinal: 1, event: event() });
    first.close();
    const reopened = new SqliteIncidentAuditRepository(databaseFile);
    assert.deepEqual(await new IncidentAuditSearchService(reopened).search({ limit: 50 }), {
      events: [event()],
      nextCursor: null,
    });
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects partial incident filters at the repository boundary", async () => {
  await withRepository(async (repository) => {
    await assert.rejects(
      repository.search({
        incidentId: { effectId: { processInstanceId: "process-1" } },
        limit: 50,
      } as never),
      /public fields/u,
    );
  });
});

test("filters actor, hosting Process, exact incident, and action kind", async () => {
  await withRepository(async (repository) => {
    const second = event({
      eventId: "event-2",
      actorId: "operator-2",
      actionId: "action-2",
      actionKind: "cancelIncidentProcess",
    });
    await repository.record({ ordinal: 1, event: event() });
    await repository.record({ ordinal: 2, event: second });
    const service = new IncidentAuditSearchService(repository);
    assert.deepEqual((await service.search({
      actorId: "operator-2",
      hostingProcessInstanceId: "process-1",
      incidentProcessInstanceId: "process-1",
      incidentElementId: "ServiceTask_Fail",
      incidentActivation: 1,
      incidentGeneration: 1,
      actionKind: "cancelIncidentProcess",
      limit: 50,
    })).events, [second]);
  });
});

test("pages exclusively in insertion order when new rows arrive between reads", async () => {
  await withRepository(async (repository) => {
    await repository.record({ ordinal: 1, event: event() });
    await repository.record({ ordinal: 2, event: event({
      eventId: "event-2",
      actionId: "action-2",
      recordedAt: "2026-08-14T10:00:01.000Z",
    }) });
    const service = new IncidentAuditSearchService(repository);
    const first = await service.search({ limit: 1 });
    assert.deepEqual(first.events.map(({ eventId }) => eventId), ["event-1"]);
    assert.notEqual(first.nextCursor, null);

    await repository.record({ ordinal: 3, event: event({
      eventId: "event-3",
      actionId: "action-3",
      recordedAt: "2026-08-14T10:00:02.000Z",
    }) });
    const second = await service.search({
      cursor: first.nextCursor as string,
      limit: 2,
    });
    assert.deepEqual(second.events.map(({ eventId }) => eventId), [
      "event-2",
      "event-3",
    ]);
    assert.equal(second.nextCursor, null);
  });
});

test("takes one bounded hosting-instance snapshot in source-local order", async () => {
  await withRepository(async (repository) => {
    const other = event({
      eventId: "event-other",
      actionId: "action-other",
      hostingProcessInstanceId: "process-other",
      incidentId: {
        effectId: {
          processInstanceId: "process-other",
          elementId: "ServiceTask_Other",
          activation: 1,
        },
        generation: 1,
      },
    });
    const later = event({
      eventId: "event-2",
      actionId: "action-2",
      recordedAt: "2026-08-14T09:59:59.000Z",
    });
    await repository.record({ ordinal: 1, event: event() });
    await repository.record({ ordinal: 2, event: other });
    await repository.record({ ordinal: 3, event: later });
    const snapshot = await repository.snapshotHostingProcessInstance("process-1", {
      maxEvents: 10,
      maxStoredBytes: 10_000,
    });
    assert.deepEqual(snapshot, {
      headEventId: "event-2",
      events: [event(), later],
    });
    await repository.record({ ordinal: 4, event: event({
      eventId: "event-3",
      actionId: "action-3",
      recordedAt: "2026-08-14T10:00:02.000Z",
    }) });
    const extended = await repository.snapshotHostingProcessInstance("process-1", {
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
    await repository.record({ ordinal: 1, event: multibyte });
    await repository.record({ ordinal: 2, event: event({ eventId: "event-2", actionId: "action-2" }) });
    await assert.rejects(
      repository.snapshotHostingProcessInstance("process-1", {
        maxEvents: 1,
        maxStoredBytes: 10_000,
      }),
      /snapshot limit/u,
    );
    await assert.rejects(
      repository.snapshotHostingProcessInstance("process-1", {
        maxEvents: 10,
        maxStoredBytes: Buffer.byteLength(JSON.stringify(multibyte), "utf8") - 1,
      }),
      /snapshot limit/u,
    );
  });
});

test("rejects malformed or equivalent noncanonical cursors before search", async () => {
  await withRepository(async (repository) => {
    const service = new IncidentAuditSearchService(repository);
    for (const cursor of ["v1.padded=", "v1.MA", "v2.MQ", "v1.@@"]) {
      await assert.rejects(service.search({ cursor, limit: 50 }), TypeError);
    }
  });
});

test("rejects a divergent extra schema object", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const repository = new SqliteIncidentAuditRepository(databaseFile);
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.exec("CREATE TABLE private_drift (value TEXT) STRICT");
    database.close();
    assert.throws(
      () => new SqliteIncidentAuditRepository(databaseFile),
      /exact supported epoch/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails searches and snapshots closed for a second gapped incident audit instance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const repository = new SqliteIncidentAuditRepository(databaseFile);
    await repository.record({ ordinal: 1, event: event() });
    await repository.record({ ordinal: 2, event: event({
      eventId: "event-2",
      actionId: "action-2",
    }) });
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.prepare("UPDATE incident_audit_events SET ordinal = 3 WHERE ordinal = 2").run();
    database.close();
    const reopened = new SqliteIncidentAuditRepository(databaseFile);
    await assert.rejects(reopened.search({ limit: 50 }), /invalid/u);
    await assert.rejects(
      reopened.snapshotHostingProcessInstance("process-1", { maxEvents: 10, maxStoredBytes: 10_000 }),
      /complete prefix|invalid/u,
    );
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects the previous incident-audit schema epoch without migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const repository = new SqliteIncidentAuditRepository(databaseFile);
    repository.close();
    const { DatabaseSync } = requireSqlite();
    const database = new DatabaseSync(databaseFile);
    database.exec("PRAGMA user_version = 1");
    database.close();
    assert.throws(
      () => new SqliteIncidentAuditRepository(databaseFile),
      /exact supported epoch/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function withRepository(
  run: (repository: SqliteIncidentAuditRepository) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  const repository = new SqliteIncidentAuditRepository(databaseFile);
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
