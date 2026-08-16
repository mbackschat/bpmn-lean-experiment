import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  IncidentAggregationService,
  IncidentSnapshotUnavailableError,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

test("fails the complete aggregate, retains indeterminate classification, and later recovers", async () => {
  await withRepository(async (repository) => {
    await repository.recordConfirmed(publication("first"));
    await repository.recordConfirmed(publication("second"));
    const outcomes = new Map<string, unknown>([
      ["first", { status: "observed", incidents: [operationsIncident("first", "Task_A")] }],
      ["second", { status: "unavailable" }],
    ]);
    const service = new IncidentAggregationService({
      repository,
      gateway: {
        observeIncidents: async ({ hostingProcessInstanceId }) =>
          structuredClone(outcomes.get(hostingProcessInstanceId)),
      },
      maxRegistrations: 10,
      maxIncidents: 10,
    });

    await assert.rejects(
      service.currentSnapshot(),
      (error: unknown) => error instanceof IncidentSnapshotUnavailableError,
    );
    assert.equal((await repository.getRegistration("first"))?.observation, "active");
    assert.equal((await repository.getRegistration("second"))?.observation, "indeterminate");

    outcomes.set("second", { status: "observed", incidents: [] });
    const recovered = await service.currentSnapshot();
    assert.deepEqual(
      recovered.incidents.map(({ incident }) => incident.id.effectId.elementId),
      ["Task_A"],
    );
    assert.equal((await repository.getRegistration("second"))?.observation, "active");
  });
});

test("sorts by exact scalar identity and enforces both positive ceilings", async () => {
  await withRepository(async (repository) => {
    await repository.recordConfirmed(publication("\u{1f300}"));
    await repository.recordConfirmed(publication("\ue000"));
    const service = new IncidentAggregationService({
      repository,
      gateway: {
        observeIncidents: async ({ hostingProcessInstanceId }) => ({
          status: "observed",
          incidents: [operationsIncident(hostingProcessInstanceId, "Task")],
        }),
      },
      maxRegistrations: 2,
      maxIncidents: 2,
    });
    assert.deepEqual(
      (await service.currentSnapshot()).incidents.map(
        ({ hostingInstance }) => hostingInstance.processInstanceId,
      ),
      ["\ue000", "\u{1f300}"],
    );
    await assert.rejects(
      new IncidentAggregationService({
        repository,
        gateway: { observeIncidents: async () => ({ status: "observed", incidents: [] }) },
        maxRegistrations: 1,
        maxIncidents: 10,
      }).currentSnapshot(),
      IncidentSnapshotUnavailableError,
    );
    await assert.rejects(
      new IncidentAggregationService({
        repository,
        gateway: {
          observeIncidents: async ({ hostingProcessInstanceId }) => ({
            status: "observed",
            incidents: [operationsIncident(hostingProcessInstanceId, "A"), operationsIncident(hostingProcessInstanceId, "B")],
          }),
        },
        maxRegistrations: 10,
        maxIncidents: 3,
      }).currentSnapshot(),
      IncidentSnapshotUnavailableError,
    );
  });
  assert.throws(
    () => new IncidentAggregationService({
      repository: {} as never,
      gateway: {} as never,
      maxRegistrations: 0,
      maxIncidents: 1,
    }),
    /positive safe integer/u,
  );
});

test("classifies exact closed results and rejects malformed Product 1 incident bytes", async () => {
  await withRepository(async (repository) => {
    await repository.recordConfirmed(publication("closed"));
    const closed = new IncidentAggregationService({
      repository,
      gateway: { observeIncidents: async () => ({ status: "closed" }) },
    });
    assert.deepEqual(await closed.currentSnapshot(), { incidents: [] });
    assert.equal((await repository.getRegistration("closed"))?.observation, "closed");

    await repository.recordConfirmed(publication("malformed"));
    const malformed = new IncidentAggregationService({
      repository,
      gateway: {
        observeIncidents: async ({ hostingProcessInstanceId }) =>
          hostingProcessInstanceId === "malformed"
            ? {
                status: "observed",
                incidents: [{
                  ...operationsIncident("malformed", "Task"),
                  privateWorkflowId: "must-not-cross",
                }],
              }
            : { status: "closed" },
      },
    });
    await assert.rejects(malformed.currentSnapshot(), IncidentSnapshotUnavailableError);
    assert.equal((await repository.getRegistration("malformed"))?.observation, "indeterminate");
  });
});

function publication(processInstanceId: string) {
  return {
    instance: instance(processInstanceId),
    locator: `bpmn-process-work-v1:${encodeURIComponent(`workflow-${processInstanceId}`)}`,
  } as const;
}

function operationsIncident(processInstanceId: string, elementId: string) {
  const effectId = { processInstanceId, elementId, activation: 1 } as const;
  const incidentId = { effectId, generation: 1 } as const;
  return {
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: { protocol: "demo", operation: "invoke" },
        arguments: [],
      },
    },
    interactions: [{ kind: "retryIncident", incidentId }],
  } as const;
}

function instance(processInstanceId: string): PublicProcessInstanceIdentity {
  return {
    processInstanceId,
    definition: {
      processId: "Process_Incident",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "source",
        sha256: "a".repeat(64),
        byteLength: 1,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "cibseven-incident",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  };
}

async function withRepository(
  run: (repository: SqliteProcessInstanceRepository) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-incident-aggregate-"));
  const repository = new SqliteProcessInstanceRepository(join(root, "operate.sqlite"));
  try {
    await run(repository);
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
}
