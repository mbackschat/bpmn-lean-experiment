import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  type PublicWorkTask,
  workTaskPath,
} from "@bpmn-lean/platform-contracts";
import {
  PostgresqlDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import {
  PostgresqlIncidentSnapshotGeneration,
} from "@bpmn-lean/platform-operate";
import type {
  BpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  checkSharedPlatformServerReadiness,
  createPlatformServer,
  createSharedPlatformServer,
  PlatformStorageMode,
} from "@bpmn-lean/platform-server";
import {
  decodeWorkSnapshotCandidateKey,
  PostgresqlWorkSnapshotRecoveryStep,
  PostgresqlWorkSnapshotStepKind,
  PostgresqlWorkSnapshotGeneration,
} from "@bpmn-lean/platform-work";

import {
  createCrossReplicaEngineEvidence,
  createCrossReplicaEngineRuntime,
  sharedMessageStartCapability,
  sharedTimerStartCapability,
} from "./shared-server-test-support.ts";

const connectionString = process.env.BPMN_TEST_POSTGRES_URL;

if (connectionString === undefined) {
  test("shared server PostgreSQL requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const preparation = createPostgresqlRuntime({
    connectionString,
    applicationName: "bpmn-platform-api-test-preparation",
    maxConnections: 2,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });

  before(async () => {
    await runPostgresqlMigrations({
      connectionString,
      migrationDirectories: migrationDirectories(),
    });
    assert.deepEqual(
      await new PostgresqlWorkSnapshotGeneration(preparation)
        .listCandidateKeys(100, 5_000),
      [],
    );
    assert.deepEqual(
      await new PostgresqlIncidentSnapshotGeneration(preparation)
        .listCandidateKeys(100, 5_000),
      [],
    );
  });

  after(async () => {
    await preparation.close();
  });

  test("two shared API replicas read the same empty complete projections without Product 1 fan-out", async () => {
    const firstPort = await allocatePort();
    const secondPort = await allocatePort();
    const firstEngine = fakeEngine();
    const secondEngine = fakeEngine();
    const first = await createReplica(firstPort, firstEngine);
    const second = await createReplica(secondPort, secondEngine);
    try {
      const firstOrigin = await first.listen();
      const secondOrigin = await second.listen();
      for (const origin of [firstOrigin, secondOrigin]) {
        await expectJson(origin, "/api/v1/definitions", 200, { definitions: [] });
        await expectJson(origin, "/api/v1/process-instances", 200, {
          instances: [],
          nextCursor: null,
        });
        const work = await expectJson(origin, "/api/v1/work-tasks", 200, {
          tasks: [],
        });
        assertFresh(work);
        const incidents = await expectJson(origin, "/api/v1/incidents", 200, {
          incidents: [],
        });
        assertFresh(incidents);
      }
      assert.deepEqual(firstEngine.events, ["ready"]);
      assert.deepEqual(secondEngine.events, ["ready"]);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
    assert.deepEqual(firstEngine.events, ["ready", "close"]);
    assert.deepEqual(secondEngine.events, ["ready", "close"]);
  });

  test("two API replicas share exact definition bytes across every Horizon 1 definition path", async (context) => {
    const startedAt = performance.now();
    const sourceBytes = new Uint8Array(await readFile(new URL(
      "../../../../../scenarios/expense-exception-review/process.bpmn",
      import.meta.url,
    )));
    const evidence = createCrossReplicaEngineEvidence(sourceBytes);
    const firstPort = await allocatePort();
    const secondPort = await allocatePort();
    const first = await createReplica(
      firstPort,
      createCrossReplicaEngineRuntime(evidence, "first"),
    );
    const second = await createReplica(
      secondPort,
      createCrossReplicaEngineRuntime(evidence, "second"),
    );
    try {
      const firstOrigin = await first.listen();
      const secondOrigin = await second.listen();
      const deployed = await deploySharedDefinition(firstOrigin, sourceBytes);

      const listed = await requestJson(secondOrigin, "/api/v1/definitions", 200);
      assert.deepEqual(listed, { definitions: [deployed] });
      assert.deepEqual(
        await requestBytes(
          secondOrigin,
          `/api/v1/definitions/${deployed.processId}/versions/1/source`,
        ),
        sourceBytes,
      );

      const presentationPath =
        `/api/v1/definitions/${deployed.processId}/versions/1/presentation`;
      const generated = await requestJson(secondOrigin, presentationPath, 200);
      assert.deepEqual(await requestJson(firstOrigin, presentationPath, 200), generated);
      assert.equal(
        (generated as { sourceSha256?: unknown }).sourceSha256,
        evidence.sourceSha256,
      );

      const started = await requestJson(
        secondOrigin,
        `/api/v1/definitions/${deployed.processId}/versions/1/start`,
        201,
        { method: "POST" },
      ) as Readonly<{
        status: string;
        instance: Readonly<{ processInstanceId: string }>;
      }>;
      assert.equal(started.status, "started");
      await completeStructuredWorkSnapshot(
        preparation,
        started.instance.processInstanceId,
        evidence.taskFor(started.instance.processInstanceId),
      );
      const task = evidence.taskFor(started.instance.processInstanceId);
      const inbox = await requestJson(secondOrigin, "/api/v1/work-tasks", 200) as {
        tasks: readonly unknown[];
      };
      assert.equal(inbox.tasks.length, 1);
      const detail = await requestJson(firstOrigin, workTaskPath(task.id), 200) as {
        form: Readonly<{
          catalogIdentity: Readonly<{ sourceSha256: string }>;
          taskDefinition: Readonly<{ elementId: string }>;
        }>;
      };
      assert.equal(detail.form.catalogIdentity.sourceSha256, evidence.sourceSha256);
      assert.equal(detail.form.taskDefinition.elementId, task.id.elementId);

      const schedulePath =
        `/api/v1/definitions/${deployed.processId}/versions/1/schedules/shared-schedule`;
      const activationAt = new Date(
        Math.ceil((Date.now() + 3_600_000) / 1_000) * 1_000,
      ).toISOString();
      const scheduled = await requestJson(firstOrigin, schedulePath, 201, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activationAt }),
      });
      assert.deepEqual(await requestJson(secondOrigin, schedulePath, 200), scheduled);

      const messagePath = "/api/v1/message-start-publications/shared-message";
      const published = await requestJson(secondOrigin, messagePath, 201, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: { processId: deployed.processId, version: 1 },
          messageStart: sharedMessageStartCapability,
        }),
      });
      assert.deepEqual(await requestJson(firstOrigin, messagePath, 200), published);

      assert.deepEqual(new Set(evidence.sourceDigests), new Set([evidence.sourceSha256]));
      assert.deepEqual(new Set(evidence.operations), new Set([
        "first:compile",
        "first:message-prepare",
        "first:schedule-create",
        "first:schedule-validate",
        "first:work-detail",
        "second:direct-prepare",
        "second:direct-start",
        "second:message-prepare",
        "second:message-start",
        "second:schedule-inspect",
      ]));
      assert.deepEqual(deployed.startCapabilities, {
        messageStarts: [sharedMessageStartCapability],
        timerStarts: [sharedTimerStartCapability],
      });
      context.diagnostic(JSON.stringify({
        evidence: "horizon-1-api-replicas",
        ...await databaseFacts(preparation),
        apiReplicas: 2,
        projectionMaxAgeMs: 5_000,
        wallTimeMs: Math.ceil(performance.now() - startedAt),
      }));
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  test("shared API readiness stays independent of a large retained Process population", async (context) => {
    const retainedPopulation = 5_000;
    await insertRetainedProcessPopulation(preparation, retainedPopulation, "api-readiness");
    let engineConnections = 0;
    const startedAt = performance.now();
    await checkSharedPlatformServerReadiness({
      runtime: preparation,
      engineRuntime: {
        ensureConnected: async () => { engineConnections += 1; },
      },
    });
    assert.equal(engineConnections, 1);
    context.diagnostic(JSON.stringify({
      evidence: "horizon-1-api-bounded-readiness",
      retainedPopulation,
      readinessQueries: 1,
      wallTimeMs: Math.ceil(performance.now() - startedAt),
    }));
  });
}

async function databaseFacts(runtime: PostgresqlRuntime): Promise<Readonly<{
  postgresqlMajor: number;
  schemaEpoch: number;
}>> {
  const result = await runtime.query<PostgresqlRow & Readonly<{
    postgresql_major: number;
    schema_epoch: number;
  }>>({
    text: `
      SELECT
        current_setting('server_version_num')::integer / 10000 AS postgresql_major,
        epoch::integer AS schema_epoch
      FROM bpmn_platform_meta.schema_epoch
      WHERE singleton = true
    `,
  });
  assert.deepEqual(result.rows, [{ postgresql_major: 18, schema_epoch: 10 }]);
  return {
    postgresqlMajor: result.rows[0]!.postgresql_major,
    schemaEpoch: result.rows[0]!.schema_epoch,
  };
}

async function insertRetainedProcessPopulation(
  runtime: PostgresqlRuntime,
  count: number,
  identityPrefix: string,
): Promise<void> {
  await runtime.query({
    text: `
      WITH retained_head AS (
        SELECT population_head
        FROM bpmn_platform.operate_incident_snapshot_control
        WHERE singleton = true
        FOR UPDATE
      ), inserted AS (
        INSERT INTO bpmn_platform.operate_process_instances (
          process_instance_id, process_id, definition_version, source_sha256,
          public_identity_json, process_locator, observation, population_ordinal
        )
        SELECT
          convert_to($2 || '-' || item::text, 'UTF8'),
          convert_to('large-retained-definition', 'UTF8'),
          1,
          repeat('0', 64),
          '{}',
          convert_to('retained-locator-' || item::text, 'UTF8'),
          'closed',
          retained_head.population_head + item
        FROM generate_series(1, $1::integer) AS item
        CROSS JOIN retained_head
        RETURNING population_ordinal
      )
      UPDATE bpmn_platform.operate_incident_snapshot_control
      SET population_head = population_head + (SELECT count(*) FROM inserted)
      WHERE singleton = true
    `,
    values: [count, identityPrefix],
  });
}

async function createReplica(port: number, engine: BpmnEngineGatewayRuntime) {
  const config = {
    storageMode: PlatformStorageMode.Shared,
    postgresqlRuntimeUrl: connectionString!,
    projectionMaxAgeMs: 5_000,
    host: "127.0.0.1",
    port,
    publicOrigin: `http://127.0.0.1:${port}`,
    dataDirectory: ".data/ignored-shared-test",
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5_000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers", "operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  } as const;
  return await createPlatformServer(config, {
    createSharedServer: async (validated) => await createSharedPlatformServer(
      validated,
      { createEngineRuntime: () => engine },
    ),
  });
}

async function expectJson(
  origin: string,
  path: string,
  status: number,
  expected: unknown,
): Promise<Response> {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), expected);
  return response;
}

function assertFresh(response: Response): void {
  assert.match(
    response.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms") ?? "",
    /^(?:0|[1-9][0-9]*)$/u,
  );
  assert.equal(response.headers.get("Bpmn-Projection-Max-Age-Ms"), "5000");
}

function fakeEngine() {
  const events: string[] = [];
  const noCalls = new Proxy({}, {
    get: (_target, property) => async () => {
      throw new Error(`unexpected Product 1 call ${String(property)}`);
    },
  });
  return {
    events,
    gateway: noCalls,
    scheduleHost: noCalls,
    messageStartHost: noCalls,
    processOperations: noCalls,
    processExecution: noCalls,
    processFlowNodeOccurrences: noCalls,
    processWork: noCalls,
    ensureConnected: async () => {
      events.push("ready");
    },
    close: async () => {
      events.push("close");
    },
  } as unknown as BpmnEngineGatewayRuntime & Readonly<{ events: string[] }>;
}

async function deploySharedDefinition(
  origin: string,
  sourceBytes: Uint8Array,
): Promise<Readonly<{
  processId: string;
  version: number;
  source: Readonly<{ sha256: string }>;
  startCapabilities: unknown;
}>> {
  const response = await requestJson(
    origin,
    "/api/v1/definitions?sourceId=shared-definition.bpmn&semanticProfile=bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
    201,
    {
      method: "POST",
      headers: { "content-type": "application/bpmn+xml" },
      body: sourceBytes.slice(),
    },
  ) as Readonly<{
    status: string;
    definition: Readonly<{
      processId: string;
      version: number;
      source: Readonly<{ sha256: string }>;
      startCapabilities: unknown;
    }>;
  }>;
  assert.equal(response.status, "deployed");
  return response.definition;
}

async function completeStructuredWorkSnapshot(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
  task: PublicWorkTask["task"],
): Promise<void> {
  const generation = new PostgresqlWorkSnapshotGeneration(runtime);
  const keys = await generation.listCandidateKeys(10, 5_000);
  assert.deepEqual(keys.map(decodeWorkSnapshotCandidateKey), [processInstanceId]);
  const definitions = new PostgresqlDefinitionRepository(runtime);
  const prepared = await new PostgresqlWorkSnapshotRecoveryStep({
    runtime,
    gateway: {
      observeOpenWork: async () => ({
        status: "open",
        openUserTasks: [structuredClone(task)],
      }),
    },
    catalogs: {
      readHumanTaskCatalog: async (identity) =>
        await definitions.getHumanTaskCatalog(identity),
    },
    maxTasks: 10,
  }).prepare(keys[0]!);
  assert.equal(prepared.kind, PostgresqlWorkSnapshotStepKind.Complete);
  if (prepared.kind !== PostgresqlWorkSnapshotStepKind.Complete) {
    assert.fail("structured Work snapshot was not prepared");
  }
  await runtime.transaction(prepared.apply);
}

async function requestJson(
  origin: string,
  path: string,
  expectedStatus: number,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, expectedStatus);
  return await response.json();
}

async function requestBytes(origin: string, path: string): Promise<Uint8Array> {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 200);
  return new Uint8Array(await response.arrayBuffer());
}

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("temporary server did not receive a TCP port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return address.port;
}

function migrationDirectories(): readonly string[] {
  return [
    "../../../../foundation/artifact-store/migrations",
    "../../../../modules/definitions/migrations",
    "../../../../modules/operate/migrations",
    "../../../../modules/work/migrations",
    "../../../../foundation/audit/migrations",
    "../../../../foundation/recovery-runtime/migrations",
  ].map((path) => fileURLToPath(new URL(path, import.meta.url)));
}
