import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type {
  IncidentAuditEvent,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  AuditStoredValueError,
  IncidentAuditStoredValueError,
  SqliteAuditRepository,
  SqliteIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";

const workEvent: WorkAuditEvent = {
  eventId: "work-event-1",
  actorId: "actor-1",
  recordedAt: "2026-08-17T12:00:00.000Z",
  hostingProcessInstanceId: "host-1",
  taskId: {
    processInstanceId: "task-process-1",
    elementId: "ReviewTask",
    activation: 1,
  },
  action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
};

const incidentEvent: IncidentAuditEvent = {
  eventId: "incident-event-1",
  actorId: "operator-1",
  recordedAt: "2026-08-17T12:00:00.000Z",
  hostingProcessInstanceId: "host-1",
  incidentId: {
    effectId: {
      processInstanceId: "host-1",
      elementId: "ServiceTask_Fail",
      activation: 1,
    },
    generation: 1,
  },
  actionId: "retry-1",
  actionKind: "retryIncident",
  outcome: "reserved",
};

test("Work audit rejects semantically equal noncanonical stored event JSON", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-audit-canonical-"));
  const databaseFile = join(directory, "audit.sqlite");
  try {
    const repository = new SqliteAuditRepository(databaseFile);
    await repository.record({ ordinal: 1, event: workEvent });
    repository.close();
    addLeadingWhitespace(databaseFile, "work_audit_events");

    const reopened = new SqliteAuditRepository(databaseFile);
    try {
      await assert.rejects(
        reopened.search({ actorId: "actor-1", limit: 50 }),
        AuditStoredValueError,
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("incident audit rejects semantically equal noncanonical stored event JSON", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpmn-incident-audit-canonical-"));
  const databaseFile = join(directory, "incident-audit.sqlite");
  try {
    const repository = new SqliteIncidentAuditRepository(databaseFile);
    await repository.record({ ordinal: 1, event: incidentEvent });
    repository.close();
    addLeadingWhitespace(databaseFile, "incident_audit_events");

    const reopened = new SqliteIncidentAuditRepository(databaseFile);
    try {
      await assert.rejects(
        reopened.search({ limit: 50 }),
        IncidentAuditStoredValueError,
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function addLeadingWhitespace(databaseFile: string, table: string): void {
  const database = new DatabaseSync(databaseFile);
  try {
    database.exec(`UPDATE ${table} SET event_json = ' ' || event_json`);
  } finally {
    database.close();
  }
}
