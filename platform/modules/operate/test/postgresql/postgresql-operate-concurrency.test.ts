import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  PostgresqlExecutionPublicationRepository,
  PostgresqlFlowNodeOccurrenceRepository,
  PostgresqlIncidentActionRepository,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";

import {
  firstPage,
  registration,
  secondPage,
} from "../execution-publication-fixture.ts";
import {
  occurrenceFirstPage,
  occurrenceRegistration,
  occurrenceSecondPage,
} from "../flow-node-occurrence-fixture.ts";
import {
  incidentAudit,
  incidentBinding,
} from "../support/incident-action-repository-contract.ts";
import {
  processPublication,
} from "../support/process-instance-repository-contract.ts";
import {
  createOperateTestRuntime,
  migrateOperateDatabase,
  resetOperateDatabase,
} from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Operate concurrency requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-concurrency", 24);

  before(async () => await migrateOperateDatabase(baseUrl));
  beforeEach(async () => await resetOperateDatabase(runtime));
  after(async () => await runtime.close());

  test("concurrent distinct audit events allocate the exact contiguous source prefix", async () => {
    await new PostgresqlProcessInstanceRepository(runtime).recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    const runtimes = Array.from({ length: 10 }, (_, index) =>
      createOperateTestRuntime(baseUrl, `operate-audit-${index}`, 2));
    try {
      await Promise.all(runtimes.map(async (independent, index) => {
        const binding = incidentBinding(`audit-action-${index}`);
        const result = await new PostgresqlIncidentActionRepository(independent)
          .reserve(binding, incidentAudit(binding, "reserved"));
        assert.equal(result.kind, "reserved");
      }));
      const repository = new PostgresqlIncidentActionRepository(runtime);
      assert.deepEqual(
        (await repository.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
        Array.from({ length: 10 }, (_, index) => index + 1),
      );
      assert.equal(
        (await runtime.query({
          text: `
            SELECT head::text AS head
            FROM bpmn_platform.operate_incident_action_audit_source_head
            WHERE singleton = true
          `,
        })).rows[0]?.head,
        "10",
      );
    } finally {
      await Promise.all(runtimes.map(async (independent) => await independent.close()));
    }
  });

  test("an unrelated Process ID proceeds while another registration row is locked", async () => {
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    await processes.recordConfirmed(processPublication("locked-instance"));
    await processes.recordConfirmed(processPublication("unrelated-instance"));
    let reportLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const owner = runtime.withDedicatedSession(async (session) => {
      await session.query({ text: "BEGIN ISOLATION LEVEL READ COMMITTED" });
      try {
        await session.query({
          text: `
            SELECT process_instance_id
            FROM bpmn_platform.operate_process_instances
            WHERE process_instance_id = $1
            FOR UPDATE
          `,
          values: [Buffer.from("locked-instance", "utf8")],
        });
        reportLocked();
        await release;
      } finally {
        await session.query({ text: "ROLLBACK" });
      }
    });
    await locked;
    try {
      await Promise.race([
        processes.recordObservation("unrelated-instance", "indeterminate"),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("unrelated Process row blocked")), 1_000);
        }),
      ]);
    } finally {
      releaseLock();
      await owner;
    }
  });

  test("same action ID racing across changed incident identity is reclassified", async () => {
    await new PostgresqlProcessInstanceRepository(runtime).recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    const exact = incidentBinding("identity-race");
    const changed = withChangedIncidentElementId(exact, "Changed_Task");
    const left = createOperateTestRuntime(baseUrl, "operate-action-identity-left", 2);
    const right = createOperateTestRuntime(baseUrl, "operate-action-identity-right", 2);
    try {
      const results = await Promise.all([
        new PostgresqlIncidentActionRepository(left)
          .reserve(exact, incidentAudit(exact, "reserved")),
        new PostgresqlIncidentActionRepository(right)
          .reserve(changed, incidentAudit(changed, "reserved")),
      ]);
      assert.deepEqual(
        results.map(({ kind }) => kind).toSorted(),
        ["conflict", "reserved"],
      );
    } finally {
      await Promise.all([left.close(), right.close()]);
    }
  });

  test("competing exact and changed execution suffixes retain one complete winner", async () => {
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const ordinal = await processes.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const exactRegistration = { ...registration, ordinal };
    await new PostgresqlExecutionPublicationRepository(runtime)
      .applyPage(exactRegistration, firstPage());
    const changed = withChangedExecutionCommand(secondPage(), "changed-command");
    const left = createOperateTestRuntime(baseUrl, "operate-e1-left", 2);
    const right = createOperateTestRuntime(baseUrl, "operate-e1-right", 2);
    try {
      const outcomes = await Promise.allSettled([
        new PostgresqlExecutionPublicationRepository(left)
          .applyPage(exactRegistration, secondPage()),
        new PostgresqlExecutionPublicationRepository(right)
          .applyPage(exactRegistration, changed),
      ]);
      assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
      const retained = await new PostgresqlExecutionPublicationRepository(runtime)
        .get(registration.instance.processInstanceId);
      assert.equal(retained?.headRevision, 3);
      assert.equal(retained?.batches.length, 2);
    } finally {
      await Promise.all([left.close(), right.close()]);
    }
  });

  test("competing changed occurrence suffixes preserve one terminal row", async () => {
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const ordinal = await processes.recordConfirmed({
      instance: occurrenceRegistration.instance,
      locator: occurrenceRegistration.locator,
    });
    const exactRegistration = { ...occurrenceRegistration, ordinal };
    await new PostgresqlExecutionPublicationRepository(runtime).replaceFromPages(
      exactRegistration,
      [firstPage(), secondPage()],
    );
    await new PostgresqlFlowNodeOccurrenceRepository(runtime)
      .applyPage(exactRegistration, occurrenceFirstPage());
    const left = createOperateTestRuntime(baseUrl, "operate-occurrence-left", 2);
    const right = createOperateTestRuntime(baseUrl, "operate-occurrence-right", 2);
    try {
      const outcomes = await Promise.allSettled([
        new PostgresqlFlowNodeOccurrenceRepository(left)
          .applyPage(exactRegistration, occurrenceSecondPage(150)),
        new PostgresqlFlowNodeOccurrenceRepository(right)
          .applyPage(exactRegistration, occurrenceSecondPage(160)),
      ]);
      assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
      const retained = await new PostgresqlFlowNodeOccurrenceRepository(runtime)
        .get(registration.instance.processInstanceId);
      assert.equal(retained?.occurrences.length, 1);
      assert.equal(retained?.occurrences[0]?.terminal, "completed");
    } finally {
      await Promise.all([left.close(), right.close()]);
    }
  });
}

function withChangedIncidentElementId(
  exact: ReturnType<typeof incidentBinding>,
  elementId: string,
): ReturnType<typeof incidentBinding> {
  const changed = structuredClone(exact);
  const writable = changed as unknown as {
    incident: {
      id: { effectId: { elementId: string } };
      effect: { id: { elementId: string } };
    };
    interaction: { incidentId: { effectId: { elementId: string } } };
  };
  writable.incident.id.effectId.elementId = elementId;
  writable.incident.effect.id.elementId = elementId;
  writable.interaction.incidentId.effectId.elementId = elementId;
  return changed;
}

function withChangedExecutionCommand(
  exact: ReturnType<typeof secondPage>,
  commandId: string,
): ReturnType<typeof secondPage> {
  const changed = structuredClone(exact);
  const batch = changed.batches[0];
  if (batch === undefined) throw new TypeError("fixture has no execution batch");
  (batch as unknown as { commandId: string }).commandId = commandId;
  const transition = batch.transitions[0]?.transition;
  if (transition?.kind !== "externalStimulus") {
    throw new TypeError("fixture has no external stimulus transition");
  }
  (transition.stimulus as unknown as { commandId: string }).commandId = commandId;
  return changed;
}
