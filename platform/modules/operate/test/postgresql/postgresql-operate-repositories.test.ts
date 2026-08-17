import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  IncidentActionAuditOutboxService,
  IncidentActionReconciliationService,
  IncidentAggregationService,
  IncidentMutationService,
  PostgresqlExecutionPublicationRepository,
  PostgresqlFlowNodeOccurrenceRepository,
  PostgresqlIncidentActionRepository,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import {
  firstPage,
  registration,
} from "../execution-publication-fixture.ts";
import {
  registerExecutionPublicationRepositoryContract,
} from "../support/execution-publication-repository-contract.ts";
import {
  registerFlowNodeOccurrenceRepositoryContract,
} from "../support/flow-node-occurrence-repository-contract.ts";
import {
  incidentAudit,
  incidentBinding,
  registerIncidentActionRepositoryContract,
} from "../support/incident-action-repository-contract.ts";
import {
  processPublication,
  registerProcessInstanceRepositoryContract,
} from "../support/process-instance-repository-contract.ts";
import {
  createOperateTestRuntime,
  migrateOperateDatabase,
  resetOperateDatabase,
} from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Operate repositories require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-contract", 24);

  before(async () => {
    await migrateOperateDatabase(baseUrl);
  });

  after(async () => {
    await runtime.close();
  });

  registerProcessInstanceRepositoryContract(
    "PostgreSQL Process registry",
    async () => {
      await resetOperateDatabase(runtime);
      return {
        repository: new PostgresqlProcessInstanceRepository(runtime),
        dispose: async () => undefined,
      };
    },
  );

  registerIncidentActionRepositoryContract(
    "PostgreSQL incident actions",
    async () => {
      await resetOperateDatabase(runtime);
      return {
        processes: new PostgresqlProcessInstanceRepository(runtime),
        incidents: new PostgresqlIncidentActionRepository(runtime),
        damageReservedAudit: async (actionId, damage) => {
          switch (damage) {
            case "missing":
              await runtime.query({
                text: `
                  DELETE FROM bpmn_platform.operate_incident_action_audit_outbox
                  WHERE action_id = $1 AND action_outcome = 'reserved'
                `,
                values: [Buffer.from(actionId, "utf8")],
              });
              return;
            case "corrupt":
              await runtime.query({
                text: `
                  UPDATE bpmn_platform.operate_incident_action_audit_outbox
                  SET event_json = ' ' || event_json
                  WHERE action_id = $1 AND action_outcome = 'reserved'
                `,
                values: [Buffer.from(actionId, "utf8")],
              });
              return;
          }
        },
        dispose: async () => undefined,
      };
    },
  );

  registerExecutionPublicationRepositoryContract(
    "PostgreSQL committed execution",
    async () => {
      await resetOperateDatabase(runtime);
      return {
        processes: new PostgresqlProcessInstanceRepository(runtime),
        executions: new PostgresqlExecutionPublicationRepository(runtime),
        dispose: async () => undefined,
      };
    },
  );

  registerFlowNodeOccurrenceRepositoryContract(
    "PostgreSQL flow-node occurrences",
    async () => {
      await resetOperateDatabase(runtime);
      return {
        processes: new PostgresqlProcessInstanceRepository(runtime),
        executions: new PostgresqlExecutionPublicationRepository(runtime),
        occurrences: new PostgresqlFlowNodeOccurrenceRepository(runtime),
        dispose: async () => undefined,
      };
    },
  );

  test("equivalent and conflicting registrations race through independent runtimes", async () => {
    await resetOperateDatabase(runtime);
    const runtimes = Array.from({ length: 8 }, (_, index) =>
      createOperateTestRuntime(baseUrl, `operate-registration-${index}`, 2));
    try {
      const publication = processPublication("race-instance\u0000identity");
      const ordinals = await Promise.all(runtimes.map(async (independent) =>
        await new PostgresqlProcessInstanceRepository(independent)
          .recordConfirmed(publication)));
      assert.equal(new Set(ordinals).size, 1);
      const outcomes = await Promise.allSettled([
        new PostgresqlProcessInstanceRepository(runtimes[0]!).recordConfirmed(
          { ...publication, locator: "changed" },
        ),
        new PostgresqlProcessInstanceRepository(runtimes[1]!).recordConfirmed(
          publication,
        ),
      ]);
      assert.equal(outcomes[0]?.status, "rejected");
      assert.equal(outcomes[1]?.status, "fulfilled");
    } finally {
      await Promise.all(runtimes.map(async (independent) => await independent.close()));
    }
  });

  test("same-action reservation and submission races converge to one winner", async () => {
    await resetOperateDatabase(runtime);
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    await processes.recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    const binding = incidentBinding("racing-action");
    const runtimes = Array.from({ length: 6 }, (_, index) =>
      createOperateTestRuntime(baseUrl, `operate-action-${index}`, 2));
    try {
      const reservations = await Promise.all(runtimes.map(async (independent) =>
        await new PostgresqlIncidentActionRepository(independent).reserve(
          binding,
          incidentAudit(binding, "reserved"),
        )));
      assert.equal(reservations.filter(({ kind }) => kind === "reserved").length, 1);
      assert.equal(reservations.filter(({ kind }) => kind === "retained").length, 5);
      const submissions = await Promise.all(runtimes.map(async (independent) =>
        await new PostgresqlIncidentActionRepository(independent)
          .beginSubmission(binding.actionId, binding)));
      assert.equal(submissions.filter(({ kind }) => kind === "acquired").length, 1);
      assert.equal(submissions.filter(({ kind }) => kind === "retained").length, 5);
    } finally {
      await Promise.all(runtimes.map(async (independent) => await independent.close()));
    }
  });

  test("incident recovery mutates only inside the supplied completion session", async () => {
    await resetOperateDatabase(runtime);
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const incidents = new PostgresqlIncidentActionRepository(runtime);
    await processes.recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    const binding = incidentBinding("fenced-recovery-action");
    await incidents.reserve(binding, incidentAudit(binding, "reserved"));
    const outbox = new IncidentActionAuditOutboxService(incidents, {
      record: async ({ ordinal }) => ordinal,
    });
    await outbox.reconcileBatch(1);
    let gatewayCalls = 0;
    const gateway = {
      observeIncidents: async () => ({ status: "observed", incidents: [] }),
      submitIncidentOperation: async () => {
        gatewayCalls += 1;
        return {
          kind: "semantic",
          commandId: binding.actionId,
          outcome: "committed",
        };
      },
    };
    const mutations = new IncidentMutationService({
      aggregation: new IncidentAggregationService({ repository: processes, gateway }),
      repository: incidents,
      recovery: incidents,
      gateway,
      outbox,
      auditEvents: {
        create: (seed) => incidentAudit(binding, seed.outcome),
      },
    });
    const reconciliation = new IncidentActionReconciliationService(
      incidents,
      mutations,
      outbox,
    );

    const submission = await reconciliation.reconcileAction(binding.actionId);
    assert.equal(submission.kind, "complete");
    assert.equal((await incidents.get(binding.actionId))?.state, "reserved");
    assert.equal(gatewayCalls, 0);
    if (submission.kind !== "complete") assert.fail("submission was not prepared");
    await runtime.transaction(submission.apply);
    assert.equal((await incidents.get(binding.actionId))?.state, "submitting");

    const outcome = await reconciliation.reconcileAction(binding.actionId);
    assert.equal(outcome.kind, "complete");
    assert.equal(gatewayCalls, 1);
    assert.equal((await incidents.get(binding.actionId))?.state, "submitting");
    assert.deepEqual(await incidents.listUndeliveredAuditEvents(), []);
    if (outcome.kind !== "complete") assert.fail("outcome was not prepared");
    await runtime.transaction(outcome.apply);
    assert.equal((await incidents.get(binding.actionId))?.state, "committed");
    assert.deepEqual(
      (await incidents.listUndeliveredAuditEvents()).map(({ event }) => event.outcome),
      ["committed"],
    );
  });

  test("outbox conflict rolls back action and source head before the next contiguous event", async () => {
    await resetOperateDatabase(runtime);
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const incidents = new PostgresqlIncidentActionRepository(runtime);
    await processes.recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    const first = incidentBinding("first-action");
    await incidents.reserve(first, incidentAudit(first, "reserved", "shared-event"));
    const conflict = incidentBinding("conflicting-action");
    await assert.rejects(
      incidents.reserve(
        conflict,
        incidentAudit(conflict, "reserved", "shared-event"),
      ),
      { name: "OperateIncidentIntegrityError" },
    );
    assert.equal(await incidents.get(conflict.actionId), null);
    const after = incidentBinding("after-action");
    await incidents.reserve(after, incidentAudit(after, "reserved"));
    assert.deepEqual(
      (await incidents.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1, 2],
    );
    const head = await runtime.query({
      text: `
        SELECT head::text AS head
        FROM bpmn_platform.operate_incident_action_audit_source_head
        WHERE singleton = true
      `,
    });
    assert.equal(head.rows[0]?.head, "2");
  });

  test("execution get is one coherent query and caller runtime remains usable", async () => {
    await resetOperateDatabase(runtime);
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const ordinal = await processes.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const repository = new PostgresqlExecutionPublicationRepository(runtime);
    await repository.applyPage({ ...registration, ordinal }, firstPage());
    let queryCount = 0;
    const countedRuntime: PostgresqlRuntime = {
      query: async (query: Parameters<typeof runtime.query>[0]) => {
        queryCount += 1;
        return await runtime.query(query);
      },
      transaction: async (run) => await runtime.transaction(run),
      withDedicatedSession: async (run) => await runtime.withDedicatedSession(run),
      databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
      close: async () => await runtime.close(),
    };
    const image = await new PostgresqlExecutionPublicationRepository(countedRuntime)
      .get(registration.instance.processInstanceId);
    assert.equal(image?.headRevision, 2);
    assert.equal(queryCount, 1);
    assert.equal((await runtime.query({ text: "SELECT 1 AS value" })).rows[0]?.value, 1);
  });
}
