import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decodeCanonicalOperatorAuditExport,
  operatorAuditExportPath,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditEvent,
  PublicProcessInstanceIdentity,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  SqliteConfirmedProcessInstanceRepository,
  SqliteDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import {
  SqliteIncidentActionRepository,
} from "@bpmn-lean/platform-operate";
import {
  createPlatformServer,
} from "@bpmn-lean/platform-server";
import {
  SqliteWorkRepository,
} from "@bpmn-lean/platform-work";

test("exports both pending audit streams exactly once and converges across restart", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-operator-audit-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const config = platformConfig(origin, port, dataDirectory);
  await seedConfirmedInstance(dataDirectory);
  let runtime = await createPlatformServer(config);
  try {
    await seedPendingAuditEvents(dataDirectory);
    assert.equal(await runtime.listen(), origin);

    const firstBytes = await fetchOperatorAudit(origin);
    assertExportContainsOneEventPerStream(firstBytes);
    await runtime.close();

    runtime = await createPlatformServer(config);
    assert.equal(await runtime.listen(), origin);
    const restartedBytes = await fetchOperatorAudit(origin);
    assert.deepEqual(restartedBytes, firstBytes);
    assertExportContainsOneEventPerStream(restartedBytes);

    const work = new SqliteWorkRepository(join(dataDirectory, "work.sqlite"));
    const incidents = new SqliteIncidentActionRepository(
      join(dataDirectory, "process-instances.sqlite"),
    );
    try {
      assert.deepEqual(work.listUndeliveredAuditEvents(), []);
      assert.deepEqual(incidents.listUndeliveredAuditEvents(), []);
    } finally {
      incidents.close();
      work.close();
    }
  } finally {
    await runtime.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

const instance = {
  processInstanceId: "operator-audit-instance",
  definition: {
    processId: "OperatorAuditProcess",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "operator-audit.bpmn",
      sha256: "a".repeat(64),
      byteLength: 512,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile/operator-audit",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
} as const satisfies PublicProcessInstanceIdentity;

const locator = "private:operator-audit-instance";
const workTask = {
  hostingProcessInstanceId: instance.processInstanceId,
  taskId: {
    processInstanceId: "semantic-operator-audit-instance",
    elementId: "ReviewOrder",
    activation: 1,
  },
} as const;
const workEvent = workAuditEvent("claimed");

const incidentOccurrence = {
  processInstanceId: instance.processInstanceId,
  elementId: "ChargeCard",
  activation: 1,
} as const;
const incidentId = { effectId: incidentOccurrence, generation: 1 } as const;
const retryIncident = { kind: "retryIncident", incidentId } as const;
const incidentEvent = {
  eventId: "incident-reserved",
  actorId: "operator-1",
  recordedAt: "2026-08-15T12:00:01.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  incidentId,
  actionId: "retry-1",
  actionKind: "retryIncident",
  outcome: "reserved",
} as const satisfies IncidentAuditEvent;

async function seedConfirmedInstance(dataDirectory: string): Promise<void> {
  const databaseFile = join(dataDirectory, "definitions.sqlite");
  const definitions = new SqliteDefinitionRepository(databaseFile);
  const confirmed = new SqliteConfirmedProcessInstanceRepository(databaseFile);
  try {
    confirmed.confirm({ instance, locator });
  } finally {
    confirmed.close();
    definitions.close();
  }
}

async function seedPendingAuditEvents(dataDirectory: string): Promise<void> {
  const work = new SqliteWorkRepository(join(dataDirectory, "work.sqlite"));
  const incidents = new SqliteIncidentActionRepository(
    join(dataDirectory, "process-instances.sqlite"),
  );
  try {
    assert.equal(work.claimTask({
      actionId: "claim-1",
      actorId: "worker-1",
      task: workTask,
      expectedGeneration: 0,
      audit: {
        claimed: workEvent,
        idempotent: workAuditEvent("idempotent"),
        conflict: workAuditEvent("conflict"),
      },
    }).kind, "claimed");
    assert.equal(incidents.reserve({
      actionId: incidentEvent.actionId,
      actorId: incidentEvent.actorId,
      hostingInstance: instance,
      locator,
      incident: {
        kind: "effectExecutionFailed",
        id: incidentId,
        effect: {
          id: incidentOccurrence,
          descriptor: { protocol: "test", operation: "fail" },
          arguments: [],
        },
      },
      interaction: retryIncident,
    }, incidentEvent).kind, "reserved");
    assert.equal(work.listUndeliveredAuditEvents().length, 1);
    assert.equal(incidents.listUndeliveredAuditEvents().length, 1);
  } finally {
    incidents.close();
    work.close();
  }
}

function workAuditEvent(
  outcome: "claimed" | "idempotent" | "conflict",
): WorkAuditEvent {
  return {
    eventId: `work-${outcome}`,
    actorId: "worker-1",
    recordedAt: "2026-08-15T12:00:02.000Z",
    hostingProcessInstanceId: instance.processInstanceId,
    taskId: workTask.taskId,
    action: { kind: "claim", actionId: "claim-1", outcome },
  };
}

async function fetchOperatorAudit(origin: string): Promise<Uint8Array> {
  const response = await fetch(
    `${origin}${operatorAuditExportPath(instance.processInstanceId)}`,
    { signal: AbortSignal.timeout(1_000) },
  );
  assert.equal(response.status, 200);
  return new Uint8Array(await response.arrayBuffer());
}

function assertExportContainsOneEventPerStream(bytes: Uint8Array): void {
  const exported = decodeCanonicalOperatorAuditExport(bytes, instance);
  assert.deepEqual(exported.instance, instance);
  assert.deepEqual(exported.work, {
    headEventId: workEvent.eventId,
    events: [workEvent],
  });
  assert.deepEqual(exported.incidentActions, {
    headEventId: incidentEvent.eventId,
    events: [incidentEvent],
  });
}

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("ephemeral listener did not expose a TCP address");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return address.port;
}

function platformConfig(
  origin: string,
  port: number,
  dataDirectory: string,
) {
  return {
    host: "127.0.0.1",
    port,
    publicOrigin: origin,
    dataDirectory,
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5_000,
    fakeActorId: "operator-1",
    fakeActorGroups: ["operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  } as const;
}
