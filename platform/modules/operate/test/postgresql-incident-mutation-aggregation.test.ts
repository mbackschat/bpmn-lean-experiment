import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type {
  ProjectionRead,
  PublicIncident,
  PublicIncidentSnapshot,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  IncidentActionAuditOutboxService,
  IncidentMutationService,
  OperateIncidentIntegrityError,
  SqliteIncidentActionRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  IncidentOperationSubmission,
  OperateProcessRegistration,
} from "@bpmn-lean/platform-operate";

import {
  PostgresqlIncidentMutationAggregation,
} from "../dist/postgresql-incident-mutation-aggregation.js";

test("prepares one exact shared incident action without fleet observation", async () => {
  await withActionRepository(async ({ actions, processes }) => {
    const owningId = "instance\u0000A";
    const otherId = "instance-B";
    const current = incident(owningId);
    let projectionReads = 0;
    const registrationLookups: string[] = [];
    const submissions: IncidentOperationSubmission[] = [];
    let fleetLists = 0;
    let fleetObservations = 0;
    const registrations = new Map<string, OperateProcessRegistration>([
      [owningId, registration(1, owningId, "locator\u0000A")],
      [otherId, registration(2, otherId, "locator-B")],
    ]);
    await processes.recordConfirmed({
      instance: instance(owningId),
      locator: "locator\u0000A",
    });
    await processes.recordConfirmed({
      instance: instance(otherId),
      locator: "locator-B",
    });
    const repository = {
      getRegistration: async (processInstanceId: string) => {
        registrationLookups.push(processInstanceId);
        return structuredClone(registrations.get(processInstanceId) ?? null);
      },
      listNonclosed: async () => {
        fleetLists += 1;
        throw new Error("fleet listing must remain unused");
      },
    };
    const gateway = {
      observeIncidents: async () => {
        fleetObservations += 1;
        throw new Error("fleet observation must remain unused");
      },
      submitIncidentOperation: async (request: IncidentOperationSubmission) => {
        submissions.push(structuredClone(request));
        return {
          kind: "semantic",
          commandId: request.stimulus.commandId,
          outcome: "committed",
        };
      },
    };
    const aggregation = new PostgresqlIncidentMutationAggregation({
      reader: {
        read: async (): Promise<ProjectionRead<PublicIncidentSnapshot>> => {
          projectionReads += 1;
          return {
            value: { incidents: [structuredClone(current)] },
            freshness: { observedAfterEpochMs: 1, maxAgeMs: 1_000 },
          };
        },
      },
      repository,
    });
    const mutations = mutationService(aggregation, actions, gateway);

    const result = await mutations.submitAuthorized(
      { actorId: "operator" },
      "action-A",
      current.availableInteractions[0],
    );

    assert.equal(result.kind === "result" && result.result.state, "committed");
    assert.equal(projectionReads, 1);
    assert.deepEqual(registrationLookups, [owningId]);
    assert.equal(fleetLists, 0);
    assert.equal(fleetObservations, 0);
    assert.deepEqual(submissions, [{
      locator: "locator\u0000A",
      hostingProcessInstanceId: owningId,
      stimulus: {
        kind: "retryIncident",
        commandId: "action-A",
        incidentId: current.incident.id,
      },
    }]);
    assert.equal((await actions.get("action-A"))?.binding.locator, "locator\u0000A");
  });
});

test("fails mutation integrity when the exact projected registration is missing or mismatched", async () => {
  await withActionRepository(async ({ actions }) => {
    const current = incident("instance\u0000A");
    for (const [actionId, retained] of [
      ["missing", null],
      ["mismatched", registration(1, "different", "locator")],
    ] as const) {
      const aggregation = new PostgresqlIncidentMutationAggregation({
        reader: fixedReader({ incidents: [current] }),
        repository: { getRegistration: async () => structuredClone(retained) },
      });
      const mutations = mutationService(aggregation, actions, {
        submitIncidentOperation: async () => {
          throw new Error("mutation must fail before Product 1 submission");
        },
      });

      await assert.rejects(
        mutations.submitAuthorized(
          { actorId: "operator" },
          actionId,
          current.availableInteractions[0],
        ),
        (error: unknown) => error instanceof OperateIncidentIntegrityError &&
          error.message === "current incident has no exact registration",
      );
    }
  });
});

function mutationService(
  aggregation: PostgresqlIncidentMutationAggregation,
  repository: SqliteIncidentActionRepository,
  gateway: Readonly<{
    submitIncidentOperation(request: IncidentOperationSubmission): Promise<unknown>;
  }>,
): IncidentMutationService {
  return new IncidentMutationService({
    aggregation,
    repository,
    gateway,
    outbox: new IncidentActionAuditOutboxService(repository, {
      record: async () => 1,
    }),
    auditEvents: {
      create: (seed) => ({
        ...structuredClone(seed),
        eventId: `event-${seed.actionId}-${seed.outcome}`,
        recordedAt: "2026-08-17T00:00:00.000Z",
      }),
    },
  });
}

function fixedReader(
  snapshot: PublicIncidentSnapshot,
): Readonly<{ read(): Promise<ProjectionRead<PublicIncidentSnapshot>> }> {
  return {
    read: async () => ({
      value: structuredClone(snapshot),
      freshness: { observedAfterEpochMs: 1, maxAgeMs: 1_000 },
    }),
  };
}

function registration(
  ordinal: number,
  processInstanceId: string,
  locator: string,
): OperateProcessRegistration {
  return {
    ordinal,
    instance: instance(processInstanceId),
    locator,
    observation: "active",
  };
}

function incident(processInstanceId: string): PublicIncident {
  const effectId = {
    processInstanceId,
    elementId: "ServiceTask",
    activation: 1,
  } as const;
  const incidentId = { effectId, generation: 1 } as const;
  return {
    hostingInstance: instance(processInstanceId),
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: { protocol: "demo", operation: "invoke" },
        arguments: [],
      },
    },
    availableInteractions: [{ kind: "retryIncident", incidentId }],
  };
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

async function withActionRepository(
  run: (repositories: Readonly<{
    actions: SqliteIncidentActionRepository;
    processes: SqliteProcessInstanceRepository;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-pg-incident-mutation-"));
  const databaseFile = join(root, "operate.sqlite");
  const processes = new SqliteProcessInstanceRepository(databaseFile);
  const actions = new SqliteIncidentActionRepository(databaseFile);
  try {
    await run({ actions, processes });
  } finally {
    if (actions.isOpen) actions.close();
    if (processes.isOpen) processes.close();
    await rm(root, { recursive: true, force: true });
  }
}
