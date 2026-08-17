import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  IncidentActionBinding,
  IncidentActionRepository,
  IncidentAuditEvent,
  ProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import { processPublication } from "./process-instance-repository-contract.ts";

export type IncidentRepositoryContractFixture = Readonly<{
  processes: ProcessInstanceRepository;
  incidents: IncidentActionRepository;
  damageReservedAudit: (
    actionId: string,
    damage: "missing" | "corrupt",
  ) => Promise<void>;
  dispose: () => Promise<void>;
}>;

export function incidentBinding(
  actionId: string,
  actorId = "operator-a",
): IncidentActionBinding {
  const publication = processPublication("incident-instance", "Incident_Process");
  const effectId = {
    processInstanceId: publication.instance.processInstanceId,
    elementId: "Service_Task",
    activation: 1,
  } as const;
  const incidentId = { effectId, generation: 1 } as const;
  return {
    actionId,
    actorId,
    hostingInstance: publication.instance,
    locator: publication.locator,
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: { protocol: "demo", operation: "invoke" },
        arguments: [],
      },
    },
    interaction: { kind: "retryIncident", incidentId },
  };
}

export function incidentAudit(
  binding: IncidentActionBinding,
  outcome: IncidentAuditEvent["outcome"],
  eventId = `event-${binding.actionId}-${outcome}`,
): IncidentAuditEvent {
  const milliseconds = {
    reserved: "001",
    committed: "002",
    rejected: "003",
    indeterminate: "004",
  }[outcome];
  return {
    eventId,
    actorId: binding.actorId,
    recordedAt: `2026-08-17T00:00:00.${milliseconds}Z`,
    hostingProcessInstanceId: binding.hostingInstance.processInstanceId,
    incidentId: binding.incident.id,
    actionId: binding.actionId,
    actionKind: binding.interaction.kind,
    outcome,
  };
}

export function registerIncidentActionRepositoryContract(
  label: string,
  create: () => Promise<IncidentRepositoryContractFixture>,
): void {
  test(`${label} preserves reservation identity, authorization facts, and lifecycle CAS`, async () => {
    const fixture = await create();
    try {
      const publication = processPublication("incident-instance", "Incident_Process");
      await fixture.processes.recordConfirmed(publication);
      const binding = incidentBinding("action-1");
      const reserved = await fixture.incidents.reserve(
        binding,
        incidentAudit(binding, "reserved"),
      );
      assert.equal(reserved.kind, "reserved");
      assert.equal(
        (await fixture.incidents.reserve(
          binding,
          incidentAudit(binding, "reserved"),
        )).kind,
        "retained",
      );
      assert.equal(
        (await fixture.incidents.reserve(
          incidentBinding("action-1", "operator-b"),
          incidentAudit(incidentBinding("action-1", "operator-b"), "reserved"),
        )).kind,
        "forbidden",
      );
      assert.equal(
        (await fixture.incidents.beginSubmission("action-1", binding)).kind,
        "acquired",
      );
      assert.equal(
        (await fixture.incidents.beginSubmission("action-1", binding)).kind,
        "retained",
      );
      const result = {
        state: "committed",
        actionId: binding.actionId,
        interaction: binding.interaction,
      } as const;
      assert.equal(
        (await fixture.incidents.recordOutcome(
          binding,
          result,
          incidentAudit(binding, "committed"),
        )).kind,
        "recorded",
      );
      assert.equal(
        (await fixture.incidents.recordOutcome(
          binding,
          result,
          incidentAudit(binding, "committed"),
        )).kind,
        "retained",
      );
      const secondBinding = incidentBinding("action-2");
      assert.equal(
        (await fixture.incidents.reserve(
          secondBinding,
          incidentAudit(secondBinding, "reserved"),
        )).kind,
        "reserved",
      );
      const pending = await fixture.incidents.listUndeliveredAuditEvents();
      assert.deepEqual(pending.map(({ ordinal }) => ordinal), [1, 2, 3]);
      assert.deepEqual(
        pending.map(({ event }) => event.outcome),
        ["reserved", "committed", "reserved"],
      );
      assert.deepEqual(
        (await fixture.incidents.listUndeliveredAuditEvents(2)).map(({ ordinal }) => ordinal),
        [1, 2],
      );
      await assert.rejects(fixture.incidents.listUndeliveredAuditEvents(1_001), RangeError);
      await fixture.incidents.acknowledgeAuditEvent(pending[0]!.event.eventId);
      assert.deepEqual(
        (await fixture.incidents.listUndeliveredAuditEvents())
          .map(({ event }) => event.outcome),
        ["committed", "reserved"],
      );
    } finally {
      await fixture.dispose();
    }
  });

  test(`${label} rolls back a gap between action and audit publication`, async () => {
    const fixture = await create();
    try {
      const binding = incidentBinding("missing-registration");
      await assert.rejects(
        fixture.incidents.reserve(
          binding,
          incidentAudit(binding, "reserved"),
        ),
        { name: "OperateIncidentIntegrityError" },
      );
      assert.equal(await fixture.incidents.get(binding.actionId), null);
      assert.deepEqual(await fixture.incidents.listUndeliveredAuditEvents(), []);
    } finally {
      await fixture.dispose();
    }
  });

  test(`${label} reads one exact snapshotted reserved-audit delivery state`, async () => {
    const fixture = await create();
    try {
      await fixture.processes.recordConfirmed(
        processPublication("incident-instance", "Incident_Process"),
      );
      const exact = incidentBinding("reserved\u0000action");
      await fixture.incidents.reserve(exact, incidentAudit(exact, "reserved"));
      const mutable = structuredClone(exact);
      const pending = fixture.incidents.getReservedAuditDelivery(mutable);
      (mutable as { actionId: string }).actionId = "changed-after-call";
      (mutable as { actorId: string }).actorId = "changed-after-call";
      assert.deepEqual(await pending, { kind: "pending" });
      await fixture.incidents.acknowledgeAuditEvent(
        incidentAudit(exact, "reserved").eventId,
      );
      assert.deepEqual(
        await fixture.incidents.getReservedAuditDelivery(exact),
        { kind: "acknowledged" },
      );

      const missing = incidentBinding("missing-reserved-audit");
      await fixture.incidents.reserve(missing, incidentAudit(missing, "reserved"));
      await fixture.damageReservedAudit(missing.actionId, "missing");
      await assert.rejects(
        fixture.incidents.getReservedAuditDelivery(missing),
        { name: "OperateIncidentIntegrityError" },
      );

      const corrupt = incidentBinding("corrupt-reserved-audit");
      await fixture.incidents.reserve(corrupt, incidentAudit(corrupt, "reserved"));
      await fixture.damageReservedAudit(corrupt.actionId, "corrupt");
      await assert.rejects(
        fixture.incidents.getReservedAuditDelivery(corrupt),
        { name: "OperateIncidentStoredValueError" },
      );
    } finally {
      await fixture.dispose();
    }
  });
}
