import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";

import {
  createPlatformServer,
  createSharedPlatformServer,
  PlatformStorageMode,
} from "@bpmn-lean/platform-server";
import type { InternalFailureReport } from "@bpmn-lean/platform-contracts";
import type { BpmnEngineGatewayRuntime } from "@bpmn-lean/platform-engine-gateway";
import type {
  PostgresqlQuery,
  PostgresqlQueryResult,
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

test("shared startup performs one bounded readiness query and closes engine before PostgreSQL", async () => {
  const events: string[] = [];
  const statements: string[] = [];
  const database = fakeDatabase(statements, events);
  const engine = fakeEngine(events);
  const runtime = await createPlatformServer(sharedConfig(), {
    createSharedServer: (config) => createSharedPlatformServer(config, {
      createPostgresqlRuntime: () => database,
      createEngineRuntime: () => engine,
    }),
  });

  assert.equal(statements.length, 1);
  assert.match(statements[0]!, /server_version_num/u);
  assert.match(statements[0]!, /schema_epoch/u);
  assert.doesNotMatch(
    statements[0]!,
    /work_processes|operate_process_instances|recovery_leases|outbox|generation/iu,
  );
  assert.deepEqual(events, ["engine-ready"]);

  await Promise.all([runtime.close(), runtime.close()]);
  assert.deepEqual(events, ["engine-ready", "engine-close", "database-close"]);
});

test("shared composition reports an unexpected request failure through its reporter while answering the generic 500", async () => {
  const reports: InternalFailureReport[] = [];
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  // The fake database answers every query with the readiness row, which no definition read can decode.
  const runtime = await createPlatformServer(
    { ...sharedConfig(), port, publicOrigin: origin },
    {
      createSharedServer: (config) => createSharedPlatformServer(config, {
        createPostgresqlRuntime: () => fakeDatabase([], []),
        createEngineRuntime: () => fakeEngine([]),
        reportInternalFailure: (report) => reports.push(report),
      }),
    },
  );
  try {
    assert.equal(await runtime.listen(), origin);
    const response = await fetch(`${origin}/api/v1/definitions`, {
      signal: AbortSignal.timeout(2_000),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: "internalFailure",
        message: "The definition request could not be completed.",
      },
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0]!.route, "DefinitionHttpRoutes");
    assert.equal(reports[0]!.method, "GET");
    assert.equal(reports[0]!.path, "/api/v1/definitions");
  } finally {
    await runtime.close();
  }
});

test("shared composition contains no local owner, startup scan, or request-time delivery", async () => {
  const source = await readFile(
    new URL("../src/shared-composition.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "FileArtifactStore",
    "Sqlite",
    "IncidentAggregationService",
    "new WorkService",
    ".reconcileAll(",
    "mkdir(",
    "dataDirectory",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  for (const required of [
    "PostgresqlWorkSnapshotReader",
    "ExactCurrentWorkTaskReader",
    "PostgresqlIncidentSnapshotReader",
    "PostgresqlExecutionProjectionReader",
    "PostgresqlFlowNodeMetricsReader",
    "IncidentMutationDeliveryMode.BackgroundRecovery",
    "DefinitionCorrelatedMessageService",
    "DefinitionCorrelatedMessageHttpRoutes",
    "engine.correlatedMessageHost",
  ]) {
    assert.equal(source.includes(required), true, required);
  }
});

function fakeDatabase(statements: string[], events: string[]): PostgresqlRuntime {
  return {
    query: async <Row extends PostgresqlRow = PostgresqlRow>(
      { text }: PostgresqlQuery,
    ): Promise<PostgresqlQueryResult<Row>> => {
      statements.push(text);
      return {
        rows: [{
          server_major: 18,
          epoch_rows: 1,
          schema_epoch: 15,
        } as unknown as Row],
        rowCount: 1,
      };
    },
    transaction: async (run) => run(databaseSession()),
    withDedicatedSession: async (run) => run(databaseSession()),
    databaseClockEpochMs: async () => 8_388_001,
    close: async () => {
      events.push("database-close");
    },
  };
}

function databaseSession(): PostgresqlSession {
  return {
    query: async <Row extends PostgresqlRow = PostgresqlRow>(): Promise<
      PostgresqlQueryResult<Row>
    > => ({ rows: [], rowCount: 0 }),
  };
}

function fakeEngine(events: string[]): BpmnEngineGatewayRuntime {
  const noCalls = new Proxy({}, {
    get: (_target, property) => async () => {
      throw new Error(`unexpected Product 1 call ${String(property)}`);
    },
  });
  return {
    gateway: noCalls,
    scheduleHost: noCalls,
    messageStartHost: noCalls,
    processOperations: noCalls,
    processExecution: noCalls,
    processFlowNodeOccurrences: noCalls,
    processWork: noCalls,
    ensureConnected: async () => {
      events.push("engine-ready");
    },
    close: async () => {
      events.push("engine-close");
    },
  } as unknown as BpmnEngineGatewayRuntime;
}

function sharedConfig() {
  return {
    storageMode: PlatformStorageMode.Shared,
    postgresqlRuntimeUrl: "postgresql://runtime.example/platform",
    projectionMaxAgeMs: 5_000,
    host: "127.0.0.1",
    port: 3_000,
    publicOrigin: "http://127.0.0.1:3000",
    dataDirectory: ".data/ignored-in-shared-mode",
    maxSourceBytes: 1_024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5_000,
    engineDeployment: { profiles: {}, servedRequirements: { timers: true, messages: true, effects: true, userTasks: true, calls: true }, effectStartToCloseMs: 30_000 },
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers", "operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  } as const;
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
