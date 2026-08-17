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
      const pending = await fixture.incidents.listUndeliveredAuditEvents();
      assert.deepEqual(pending.map(({ ordinal }) => ordinal), [1, 2]);
      assert.deepEqual(pending.map(({ event }) => event.outcome), ["reserved", "committed"]);
      await fixture.incidents.acknowledgeAuditEvent(pending[0]!.event.eventId);
      assert.deepEqual(
        (await fixture.incidents.listUndeliveredAuditEvents())
          .map(({ event }) => event.outcome),
        ["committed"],
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
}
