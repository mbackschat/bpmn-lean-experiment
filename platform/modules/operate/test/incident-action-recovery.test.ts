import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  IncidentActionAuditOutboxService,
  IncidentActionReconciliationService,
  IncidentAggregationService,
  IncidentMutationService,
  SqliteIncidentActionRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  IncidentActionBinding,
  IncidentActionRecoveryRepository,
  IncidentActionResult,
  IncidentAuditOutboxItem,
  StoredIncidentAction,
} from "@bpmn-lean/platform-operate";
import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import {
  incidentAudit,
  incidentBinding,
} from "./support/incident-action-repository-contract.ts";
import {
  processPublication,
} from "./support/process-instance-repository-contract.ts";

test("lease loss before apply leaves an acknowledged reserved action unchanged", async () => {
  await withStore(async ({ processes, incidents }) => {
    await processes.recordConfirmed(processPublication("incident-instance", "Incident_Process"));
    const binding = incidentBinding("lease-lost-action");
    await incidents.reserve(binding, incidentAudit(binding, "reserved"));
    await incidents.acknowledgeAuditEvent(incidentAudit(binding, "reserved").eventId);
    const fixture = recoveryFixture(processes, incidents);
    const prepared = await fixture.reconciliation.reconcileAction(binding.actionId);

    assert.equal(prepared.kind, "complete");
    assert.equal((await incidents.get(binding.actionId))?.state, "reserved");
    assert.equal(fixture.gatewayCalls.length, 0);
    assert.deepEqual(await incidents.listUndeliveredAuditEvents(), []);
  });
});

test("advances reserved and outcome states only through separate apply callbacks", async () => {
  await withStore(async ({ processes, incidents }) => {
    await processes.recordConfirmed(processPublication("incident-instance", "Incident_Process"));
    const binding = incidentBinding("reserved-action");
    await incidents.reserve(binding, incidentAudit(binding, "reserved"));
    const fixture = recoveryFixture(processes, incidents);

    assert.deepEqual(await fixture.reconciliation.reconcileAction(binding.actionId), {
      kind: "retry",
      reason: "reservedAuditPending",
    });
    assert.equal(fixture.gatewayCalls.length, 0);
    assert.equal(fixture.delivered.length, 0);

    assert.equal(await fixture.outbox.reconcileBatch(1), 1);
    const submission = await fixture.reconciliation.reconcileAction(binding.actionId);
    assert.equal(submission.kind, "complete");
    if (submission.kind !== "complete") assert.fail("submission was not prepared");
    assert.equal((await incidents.get(binding.actionId))?.state, "reserved");
    await submission.apply(unusedSession);
    assert.equal((await incidents.get(binding.actionId))?.state, "submitting");
    assert.equal(fixture.gatewayCalls.length, 0);

    const outcome = await fixture.reconciliation.reconcileAction(binding.actionId);
    assert.equal(outcome.kind, "complete");
    if (outcome.kind !== "complete") assert.fail("outcome was not prepared");
    assert.equal(fixture.gatewayCalls.length, 1);
    assert.equal((await incidents.get(binding.actionId))?.state, "submitting");
    assert.deepEqual(await incidents.listUndeliveredAuditEvents(), []);
    await outcome.apply(unusedSession);
    assert.deepEqual(await incidents.get(binding.actionId), {
      binding,
      state: "committed",
      result: committed(binding),
    });
    assert.deepEqual(fixture.delivered.map(({ event }) => event.outcome), ["reserved"]);
    assert.deepEqual(
      (await incidents.listUndeliveredAuditEvents()).map(({ event }) => event.outcome),
      ["committed"],
    );
  });
});

test("defers an indeterminate action when its reserved audit is pending again", async () => {
  await withStore(async ({ databaseFile, processes, incidents }) => {
    await processes.recordConfirmed(processPublication("incident-instance", "Incident_Process"));
    const binding = incidentBinding("indeterminate-action");
    await incidents.reserve(binding, incidentAudit(binding, "reserved"));
    await incidents.acknowledgeAuditEvent(incidentAudit(binding, "reserved").eventId);
    await incidents.beginSubmission(binding.actionId, binding);
    const result = indeterminate(binding);
    await incidents.recordOutcome(binding, result, incidentAudit(binding, "indeterminate"));
    const database = new DatabaseSync(databaseFile);
    try {
      database.prepare(`
        UPDATE incident_action_audit_outbox SET delivered = 0
        WHERE action_id = ? AND action_outcome = 'reserved'
      `).run(binding.actionId);
    } finally {
      database.close();
    }
    const fixture = recoveryFixture(processes, incidents);

    assert.deepEqual(await fixture.reconciliation.reconcileAction(binding.actionId), {
      kind: "retry",
      reason: "reservedAuditPending",
    });
    assert.equal(fixture.gatewayCalls.length, 0);
    assert.deepEqual(fixture.delivered, []);
  });
});

test("fences indeterminate-to-submitting before a later Product 1 call", async () => {
  await withStore(async ({ processes, incidents }) => {
    await processes.recordConfirmed(processPublication("incident-instance", "Incident_Process"));
    const binding = incidentBinding("acknowledged-indeterminate-action");
    await incidents.reserve(binding, incidentAudit(binding, "reserved"));
    await incidents.acknowledgeAuditEvent(incidentAudit(binding, "reserved").eventId);
    await incidents.beginSubmission(binding.actionId, binding);
    await incidents.recordOutcome(
      binding,
      indeterminate(binding),
      incidentAudit(binding, "indeterminate"),
    );
    const fixture = recoveryFixture(processes, incidents);

    const submission = await fixture.reconciliation.reconcileAction(binding.actionId);
    assert.equal(submission.kind, "complete");
    assert.equal(fixture.gatewayCalls.length, 0);
    if (submission.kind !== "complete") assert.fail("submission was not prepared");
    await submission.apply(unusedSession);
    assert.equal((await incidents.get(binding.actionId))?.state, "submitting");
    assert.equal(fixture.gatewayCalls.length, 0);

    const outcome = await fixture.reconciliation.reconcileAction(binding.actionId);
    assert.equal(outcome.kind, "complete");
    assert.equal(fixture.gatewayCalls.length, 1);
  });
});

test("a stale terminal candidate is complete without touching another action", async () => {
  await withStore(async ({ processes, incidents }) => {
    await processes.recordConfirmed(processPublication("incident-instance", "Incident_Process"));
    const terminal = incidentBinding("terminal-action");
    const other = incidentBinding("other-action");
    await incidents.reserve(terminal, incidentAudit(terminal, "reserved"));
    await incidents.reserve(other, incidentAudit(other, "reserved"));
    await incidents.beginSubmission(terminal.actionId, terminal);
    await incidents.recordOutcome(terminal, committed(terminal), incidentAudit(terminal, "committed"));
    const fixture = recoveryFixture(processes, incidents);

    const prepared = await fixture.reconciliation.reconcileAction(terminal.actionId);
    assert.equal(prepared.kind, "complete");
    if (prepared.kind !== "complete") assert.fail("terminal action did not complete");
    await prepared.apply(unusedSession);
    assert.equal(fixture.gatewayCalls.length, 0);
    assert.equal((await incidents.get(other.actionId))?.state, "reserved");
    assert.deepEqual(
      (await incidents.listUndeliveredAuditEvents()).map(({ event }) => event.actionId),
      [terminal.actionId, other.actionId, terminal.actionId],
    );
  });
});

function recoveryFixture(
  processes: SqliteProcessInstanceRepository,
  incidents: SqliteIncidentActionRepository,
) {
  const delivered: IncidentAuditOutboxItem[] = [];
  const gatewayCalls: unknown[] = [];
  const outbox = new IncidentActionAuditOutboxService(incidents, {
    record: async (item) => {
      delivered.push(structuredClone(item));
      return delivered.length;
    },
  });
  const gateway = {
    observeIncidents: async () => ({ status: "observed", incidents: [] }),
    submitIncidentOperation: async (request: unknown) => {
      gatewayCalls.push(structuredClone(request));
      const commandId = (request as { stimulus: { commandId: string } }).stimulus.commandId;
      return { kind: "semantic", commandId, outcome: "committed" };
    },
  };
  const mutations = new IncidentMutationService({
    aggregation: new IncidentAggregationService({ repository: processes, gateway }),
    repository: incidents,
    gateway,
    outbox,
    recovery: sqliteRecovery(incidents),
    auditEvents: {
      create: (seed) => ({
        ...structuredClone(seed),
        eventId: `event-${seed.actionId}-${seed.outcome}`,
        recordedAt: {
          reserved: "2026-08-17T00:00:00.001Z",
          committed: "2026-08-17T00:00:00.002Z",
          rejected: "2026-08-17T00:00:00.003Z",
          indeterminate: "2026-08-17T00:00:00.004Z",
        }[seed.outcome],
      }),
    },
  });
  return {
    delivered,
    gatewayCalls,
    outbox,
    reconciliation: new IncidentActionReconciliationService(incidents, mutations, outbox),
  };
}

const unusedSession = {
  query: async () => assert.fail("SQLite recovery test must not query PostgreSQL"),
} as PostgresqlSession;

function sqliteRecovery(
  incidents: SqliteIncidentActionRepository,
): IncidentActionRecoveryRepository {
  return {
    applyRecoverySubmission: async (_session, expected) => {
      const current = await requireExpected(incidents, expected);
      if (current === null || current.state !== expected.state) return;
      assert.deepEqual(
        await incidents.getReservedAuditDelivery(expected.binding),
        { kind: "acknowledged" },
      );
      const applied = await incidents.beginSubmission(
        expected.binding.actionId,
        expected.binding,
      );
      assert.equal(applied.kind, "acquired");
    },
    applyRecoveryOutcome: async (_session, expected, result, audit) => {
      const current = await requireExpected(incidents, expected);
      if (current === null || current.state !== expected.state) return;
      const applied = await incidents.recordOutcome(
        expected.binding,
        result,
        audit,
      );
      assert.equal(applied.kind, "recorded");
    },
  };
}

async function requireExpected(
  incidents: SqliteIncidentActionRepository,
  expected: StoredIncidentAction,
): Promise<StoredIncidentAction | null> {
  const current = await incidents.get(expected.binding.actionId);
  if (current !== null) assert.deepEqual(current.binding, expected.binding);
  return current;
}

function committed(binding: IncidentActionBinding): IncidentActionResult {
  return {
    state: "committed",
    actionId: binding.actionId,
    interaction: structuredClone(binding.interaction),
  };
}

function indeterminate(binding: IncidentActionBinding): IncidentActionResult {
  return {
    state: "indeterminate",
    actionId: binding.actionId,
    interaction: structuredClone(binding.interaction),
  };
}

async function withStore(
  run: (fixture: Readonly<{
    databaseFile: string;
    processes: SqliteProcessInstanceRepository;
    incidents: SqliteIncidentActionRepository;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-incident-recovery-"));
  const databaseFile = join(root, "operate.sqlite");
  const processes = new SqliteProcessInstanceRepository(databaseFile);
  const incidents = new SqliteIncidentActionRepository(databaseFile);
  try {
    await run({ databaseFile, processes, incidents });
  } finally {
    incidents.close();
    processes.close();
    await rm(root, { recursive: true, force: true });
  }
}
