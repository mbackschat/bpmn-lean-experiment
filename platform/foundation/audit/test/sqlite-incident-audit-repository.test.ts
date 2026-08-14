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

test("rejects changed incident audit content under one event ID", () => {
  withRepository((repository) => {
    repository.record(event());
    assert.throws(
      () => repository.record(event({ outcome: "committed" })),
      IncidentAuditEventIntegrityError,
    );
  });
});

test("rejects another event identity for the same action outcome", () => {
  withRepository((repository) => {
    repository.record(event());
    assert.throws(
      () => repository.record(event({ eventId: "event-2" })),
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

test("stores equivalent retries once and survives reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const first = new SqliteIncidentAuditRepository(databaseFile);
    first.record(event());
    first.record(event());
    first.close();
    const reopened = new SqliteIncidentAuditRepository(databaseFile);
    assert.deepEqual(new IncidentAuditSearchService(reopened).search({ limit: 50 }), {
      events: [event()],
      nextCursor: null,
    });
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects partial incident filters at the repository boundary", () => {
  withRepository((repository) => {
    assert.throws(
      () => repository.search({
        incidentId: { effectId: { processInstanceId: "process-1" } },
        limit: 50,
      } as never),
      /public fields/u,
    );
  });
});

test("filters actor, hosting Process, exact incident, and action kind", () => {
  withRepository((repository) => {
    const second = event({
      eventId: "event-2",
      actorId: "operator-2",
      actionId: "action-2",
      actionKind: "cancelIncidentProcess",
    });
    repository.record(event());
    repository.record(second);
    const service = new IncidentAuditSearchService(repository);
    assert.deepEqual(service.search({
      actorId: "operator-2",
      hostingProcessInstanceId: "process-1",
      incidentProcessInstanceId: "process-1",
      incidentElementId: "ServiceTask_Fail",
      incidentActivation: 1,
      incidentGeneration: 1,
      actionKind: "cancelIncidentProcess",
      limit: 50,
    }).events, [second]);
  });
});

test("pages exclusively in insertion order when new rows arrive between reads", () => {
  withRepository((repository) => {
    repository.record(event());
    repository.record(event({
      eventId: "event-2",
      actionId: "action-2",
      recordedAt: "2026-08-14T10:00:01.000Z",
    }));
    const service = new IncidentAuditSearchService(repository);
    const first = service.search({ limit: 1 });
    assert.deepEqual(first.events.map(({ eventId }) => eventId), ["event-1"]);
    assert.notEqual(first.nextCursor, null);

    repository.record(event({
      eventId: "event-3",
      actionId: "action-3",
      recordedAt: "2026-08-14T10:00:02.000Z",
    }));
    const second = service.search({
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

test("rejects malformed or equivalent noncanonical cursors before search", () => {
  withRepository((repository) => {
    const service = new IncidentAuditSearchService(repository);
    for (const cursor of ["v1.padded=", "v1.MA", "v2.MQ", "v1.@@"]) {
      assert.throws(() => service.search({ cursor, limit: 50 }), TypeError);
    }
  });
});

test("rejects an epoch-1 store with a divergent extra schema object", () => {
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

function withRepository(
  run: (repository: SqliteIncidentAuditRepository) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  const repository = new SqliteIncidentAuditRepository(databaseFile);
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
