import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  AuditSearchService,
  SqliteAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  decodeResolvedBpmnDiagramPresentation,
  DefinitionDeployStatus,
} from "@bpmn-lean/platform-contracts";
import {
  createPlatformServer,
} from "@bpmn-lean/platform-server";
import {
  SqliteWorkRepository,
  WorkAuditOutboxService,
} from "@bpmn-lean/platform-work";

const metadataSourcePath = new URL(
  "../../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
);

test("composes the definition route and closes its HTTP and SQLite owners idempotently", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-server-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const runtime = await createPlatformServer({
    host: "127.0.0.1",
    port,
    publicOrigin: origin,
    dataDirectory,
    maxSourceBytes: 1024,
    parserDeadlineMs: 1000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1000,
  });
  try {
    assert.equal(await runtime.listen(), origin);
    const response = await fetch(`${origin}/api/v1/definitions`, {
      signal: AbortSignal.timeout(1_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { definitions: [] });
    const processInstances = await fetch(
      `${origin}/api/v1/process-instances`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(processInstances.status, 200);
    assert.deepEqual(await processInstances.json(), {
      instances: [],
      nextCursor: null,
    });
    const tasks = await fetch(
      `${origin}/api/v1/work-tasks`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(tasks.status, 200);
    assert.deepEqual(await tasks.json(), { tasks: [] });
    const audit = await fetch(
      `${origin}/api/v1/work-audit`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(audit.status, 200);
    assert.deepEqual(await audit.json(), {
      events: [],
      nextCursor: null,
    });
    const schedules = await fetch(
      `${origin}/api/v1/definitions/missing/versions/1/schedules`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(schedules.status, 404);
    assert.deepEqual(await schedules.json(), {
      error: {
        code: "notFound",
        message: "The definition version was not found.",
      },
    });
    const publication = await fetch(
      `${origin}/api/v1/message-start-publications/missing`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(publication.status, 404);
    assert.deepEqual(await publication.json(), {
      error: {
        code: "notFound",
        message: "The Message Start publication was not found.",
      },
    });

    await Promise.all([runtime.close(), runtime.close()]);
    await runtime.close();
    const database = await readFile(join(dataDirectory, "definitions.sqlite"));
    assert.ok(database.byteLength > 0);
    const processInstanceDatabase = await readFile(
      join(dataDirectory, "process-instances.sqlite"),
    );
    assert.ok(processInstanceDatabase.byteLength > 0);
    const workDatabase = await readFile(join(dataDirectory, "work.sqlite"));
    assert.ok(workDatabase.byteLength > 0);
    const auditDatabase = await readFile(join(dataDirectory, "audit.sqlite"));
    assert.ok(auditDatabase.byteLength > 0);
    await assert.rejects(runtime.listen(), /runtime is closed/u);
  } finally {
    await runtime.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("serves a generated presentation while retaining exact admitted M3 source", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-presentation-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const sourceBytes = await readFile(metadataSourcePath);
  const runtime = await createPlatformServer(platformConfig(
    origin,
    port,
    dataDirectory,
  ));
  try {
    assert.equal(await runtime.listen(), origin);
    const deploy = await fetch(
      `${origin}/api/v1/definitions?sourceId=m3.bpmn&semanticProfile=cibseven-2.2.0-user-task-assignment-form-metadata-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/bpmn+xml" },
        body: sourceBytes,
        signal: AbortSignal.timeout(2_000),
      },
    );
    assert.equal(deploy.status, 201);
    const deployed = await deploy.json() as Readonly<{
      status: string;
      definition: Readonly<{ processId: string; version: number }>;
    }>;
    assert.equal(deployed.status, DefinitionDeployStatus.Deployed);

    const presentationResponse = await fetch(
      `${origin}/api/v1/definitions/${deployed.definition.processId}/versions/${deployed.definition.version}/presentation`,
      { signal: AbortSignal.timeout(2_000) },
    );
    assert.equal(presentationResponse.status, 200);
    const presentation = decodeResolvedBpmnDiagramPresentation(
      await presentationResponse.json(),
    );
    assert.equal(presentation.provenance.kind, "generated");
    assert.match(presentation.presentationBpmnXml, /<bpmndi:BPMNDiagram\b/u);

    const sourceResponse = await fetch(
      `${origin}/api/v1/definitions/${deployed.definition.processId}/versions/${deployed.definition.version}/source`,
      { signal: AbortSignal.timeout(2_000) },
    );
    assert.deepEqual(Buffer.from(await sourceResponse.arrayBuffer()), sourceBytes);
  } finally {
    await runtime.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("validates all configuration before creating its data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-server-config-"));
  const dataDirectory = join(root, "must-not-exist");
  try {
    await assert.rejects(createPlatformServer({
      host: "127.0.0.1",
      port: 3000,
      publicOrigin: "http://user:secret@public.example",
      dataDirectory,
      maxSourceBytes: 1024,
      parserDeadlineMs: 1000,
      temporalAddress: "127.0.0.1:7233",
      temporalNamespace: "default",
      temporalTaskQueue: "bpmn-semantic",
      temporalConnectTimeoutMs: 5000,
      fakeActorId: "demo-user",
      fakeActorGroups: ["reviewers"],
      operationsGroupId: "operators",
      maxWorkProcesses: 100,
      maxWorkTasks: 1000,
    }), /publicOrigin/u);
    await assert.rejects(stat(dataDirectory), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reconciles exactly one audit row after insertion succeeds and Work acknowledgement crashes", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-server-audit-crash-"));
  const workFile = join(dataDirectory, "work.sqlite");
  const auditFile = join(dataDirectory, "audit.sqlite");
  let work: SqliteWorkRepository | undefined;
  let audit: SqliteAuditRepository | undefined;
  try {
    work = new SqliteWorkRepository(workFile);
    audit = new SqliteAuditRepository(auditFile);
    await work.recordConfirmedProcessInstance(workPublication);
    assert.equal(work.claimTask(workClaimInput).kind, "claimed");
    const crashAfterAuditInsert = new WorkAuditOutboxService({
      listUndeliveredAuditEvents: () => work!.listUndeliveredAuditEvents(),
      acknowledgeAuditEvent: () => {
        throw new Error("crash before Work acknowledgement");
      },
    }, audit);

    assert.throws(() => crashAfterAuditInsert.reconcileAll(), /Work acknowledgement/u);
    assert.deepEqual(new AuditSearchService(audit).search({
      actorId: "demo-user",
      limit: 50,
    }).events, [workClaimInput.audit.claimed]);
    assert.equal(work.listUndeliveredAuditEvents().length, 1);
    work.close();
    audit.close();

    work = new SqliteWorkRepository(workFile);
    audit = new SqliteAuditRepository(auditFile);
    new WorkAuditOutboxService(work, audit).reconcileAll();
    assert.deepEqual(new AuditSearchService(audit).search({
      actorId: "demo-user",
      limit: 50,
    }).events, [workClaimInput.audit.claimed]);
    assert.deepEqual(work.listUndeliveredAuditEvents(), []);
  } finally {
    work?.close();
    audit?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

const workTask = {
  hostingProcessInstanceId: "host-1",
  taskId: {
    processInstanceId: "task-process-1",
    elementId: "ReviewTask",
    activation: 1,
  },
} as const;

const workPublication = {
  instance: {
    processInstanceId: "host-1",
    definition: {
      processId: "Review_Process",
      version: 1,
      source: {
        kind: "bpmnSource" as const,
        id: "review.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8" as const,
      },
      semanticProfile: "profile-1",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  locator: "private:host-1",
};

const workClaimInput = {
  actionId: "claim-1",
  actorId: "demo-user",
  task: workTask,
  expectedGeneration: 0,
  audit: {
    claimed: workAuditEvent("claimed"),
    idempotent: workAuditEvent("idempotent"),
    conflict: workAuditEvent("conflict"),
  },
} as const;

function workAuditEvent(outcome: "claimed" | "idempotent" | "conflict") {
  return {
    eventId: `claim-1-${outcome}`,
    actorId: "demo-user",
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: workTask.hostingProcessInstanceId,
    taskId: workTask.taskId,
    action: { kind: "claim" as const, actionId: "claim-1", outcome },
  };
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
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  } as const;
}
