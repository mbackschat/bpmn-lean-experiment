import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  PostgresqlIncidentSnapshotGeneration,
} from "@bpmn-lean/platform-operate";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  createPlatformServer,
  createSharedPlatformServer,
  PlatformStorageMode,
} from "@bpmn-lean/platform-server";
import {
  PostgresqlWorkSnapshotGeneration,
} from "@bpmn-lean/platform-work";

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
}

async function createReplica(port: number, engine: ReturnType<typeof fakeEngine>) {
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
  };
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
