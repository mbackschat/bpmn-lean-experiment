import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createPostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { registerExactArtifactStoreContract } from "../support/artifact-store-contract.ts";
import type { StoredArtifactRecord } from "../support/artifact-store-contract.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgresqlExactArtifactStore requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../migrations", import.meta.url)),
      ],
    });
    const epoch = await runtime.query<
      Readonly<Record<string, unknown>> & Readonly<{ epoch: number }>
    >({ text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch" });
    assert.deepEqual(epoch.rows, [{ epoch: 1 }]);
  });

  after(async () => {
    await runtime.close();
  });

  registerExactArtifactStoreContract(
    "PostgresqlExactArtifactStore",
    async (run) => {
      await runtime.query({ text: "TRUNCATE bpmn_platform.exact_artifacts" });
      try {
        await run({
          store: new PostgresqlExactArtifactStore(runtime),
          corruptStoredContent: async (sha256) => {
            const result = await runtime.query({
              text: `
                UPDATE bpmn_platform.exact_artifacts
                SET bytes = set_byte(bytes, 0, get_byte(bytes, 0) # 255)
                WHERE sha256 = $1
              `,
              values: [sha256],
            });
            assert.equal(result.rowCount, 1);
          },
          readStoredRecord: async (sha256) =>
            await readStoredRecord(runtime, sha256),
        });
      } finally {
        await runtime.query({ text: "TRUNCATE bpmn_platform.exact_artifacts" });
      }
    },
  );
}

function createTestRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "bpmn-platform-artifact-store-test",
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 2_000,
    statementTimeoutMs: 2_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 2_000,
  });
}

async function readStoredRecord(
  runtime: PostgresqlRuntime,
  sha256: string,
): Promise<StoredArtifactRecord> {
  const result = await runtime.query<
    Readonly<Record<string, unknown>> &
      Readonly<{ sha256: string; byte_length: string; bytes: Uint8Array }>
  >({
    text: `
      SELECT sha256, byte_length::text AS byte_length, bytes
      FROM bpmn_platform.exact_artifacts
      WHERE sha256 = $1
    `,
    values: [sha256],
  });
  const row = result.rows[0];
  assert.ok(row !== undefined);
  return {
    sha256: row.sha256,
    byteLength: Number(row.byte_length),
    bytes: Uint8Array.from(row.bytes),
  };
}
