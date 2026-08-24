import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PostgresqlExactArtifactStore,
} from "@bpmn-lean/platform-artifact-store";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";

import {
  DefinitionPresentationIntegrityError,
  PostgresqlConfirmedProcessInstanceRepository,
  PostgresqlDefinitionPresentationRepository,
  PostgresqlDefinitionRepository,
  PostgresqlDefinitionScheduleRepository,
  PostgresqlMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import type { NewDefinitionMetadata } from "@bpmn-lean/platform-definitions";
import {
  catalog,
  registerDefinitionsRepositoryContract,
  sidecar,
  sourceBytes,
  sourceSha256,
} from "../support/definitions-repository-contract.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Definitions repositories require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl, "definitions-contract", 24);
  const artifacts = new PostgresqlExactArtifactStore(runtime);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      // The whole platform catalog. Migration ordinals are global and the loader requires them
      // contiguous, so any multi-package subset is invalid unless it happens to be a prefix.
      migrationDirectories: [
        fileURLToPath(
          new URL("../../../../foundation/artifact-store/migrations", import.meta.url),
        ),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
        fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
        fileURLToPath(
          new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url),
        ),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  registerDefinitionsRepositoryContract(
    "PostgreSQL Definitions repositories",
    async () => {
      await resetDatabase(runtime);
      await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
      return {
        definitions: new PostgresqlDefinitionRepository(runtime),
        presentations: new PostgresqlDefinitionPresentationRepository(runtime),
        confirmed: new PostgresqlConfirmedProcessInstanceRepository(runtime),
        schedules: new PostgresqlDefinitionScheduleRepository(runtime),
        messages: new PostgresqlMessageStartPublicationRepository(runtime),
        dispose: async () => undefined,
      };
    },
  );

  test("PostgreSQL refuses definition metadata before its exact artifact", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlDefinitionRepository(runtime);
    await assert.rejects(
      repository.allocateNext(metadata("Missing_Artifact", "f".repeat(64))),
      (error: unknown) => postgresqlCode(error) === "23503",
    );
    assert.deepEqual(await repository.listVersions("Missing_Artifact"), []);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    assert.equal(
      (await repository.allocateNext(metadata("Missing_Artifact"))).version,
      1,
    );
  });

  test("independent sessions allocate one gap-free process-local version order", async () => {
    await resetDatabase(runtime);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    const runtimes = Array.from(
      { length: 12 },
      (_, index) => createTestRuntime(baseUrl, `definition-allocator-${index}`, 2),
    );
    try {
      const versions = await Promise.all(
        runtimes.map(async (independent) =>
          await new PostgresqlDefinitionRepository(independent)
            .allocateNext(metadata("Concurrent_Process"))),
      );
      assert.deepEqual(
        versions.map(({ version }) => version).sort((left, right) => left - right),
        Array.from({ length: runtimes.length }, (_, index) => index + 1),
      );
    } finally {
      await Promise.all(runtimes.map(async (independent) => await independent.close()));
    }
  });

  test("rolled-back allocation consumes no process-local version", async () => {
    await resetDatabase(runtime);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    await assert.rejects(
      runtime.transaction(async (session) => {
        await session.query({
          text: `
            INSERT INTO bpmn_platform.definition_version_heads AS head (
              process_id, next_version
            ) VALUES ($1, 2)
            ON CONFLICT (process_id) DO UPDATE
              SET next_version = head.next_version + 1
            RETURNING next_version - 1 AS version
          `,
          values: [Buffer.from("Rollback_Process", "utf8")],
        });
        throw new Error("injected allocation rollback");
      }),
      /injected allocation rollback/u,
    );
    const stored = await new PostgresqlDefinitionRepository(runtime)
      .allocateNext(metadata("Rollback_Process"));
    assert.equal(stored.version, 1);
  });

  test("one locked process allocation does not block another process row", async () => {
    await resetDatabase(runtime);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    const repository = new PostgresqlDefinitionRepository(runtime);
    await repository.allocateNext(metadata("Locked_Process"));
    let releaseLock: (() => void) | undefined;
    let reportLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockOwner = runtime.withDedicatedSession(async (session) => {
      await session.query({ text: "BEGIN ISOLATION LEVEL READ COMMITTED" });
      try {
        await session.query({
          text: `
            UPDATE bpmn_platform.definition_version_heads
            SET next_version = next_version
            WHERE process_id = $1
          `,
          values: [Buffer.from("Locked_Process", "utf8")],
        });
        reportLocked?.();
        await release;
      } finally {
        await session.query({ text: "ROLLBACK" });
      }
    });
    await locked;
    try {
      const unrelated = await Promise.race([
        repository.allocateNext(metadata("Unrelated_Process")),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("unrelated allocation blocked")), 1_000);
        }),
      ]);
      assert.equal(unrelated.version, 1);
    } finally {
      releaseLock?.();
      await lockOwner;
    }
  });

  test("privileged retained-value corruption fails closed", async () => {
    await resetDatabase(runtime);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    const repository = new PostgresqlDefinitionRepository(runtime);
    await repository.allocateNext(
      metadata("Corrupt_Catalog"),
      catalog(metadata("Corrupt_Catalog")),
    );
    await runtime.query({
      text: `
        UPDATE bpmn_platform.definition_versions
        SET human_task_catalog_json = '{"not":"canonical"}'
        WHERE process_id = $1 AND version = 1
      `,
      values: [Buffer.from("Corrupt_Catalog", "utf8")],
    });
    await assert.rejects(
      repository.getHumanTaskCatalog({ processId: "Corrupt_Catalog", version: 1 }),
      /canonical Human Task catalog/u,
    );
  });

  test("privileged presentation XML corruption fails digest validation", async () => {
    await resetDatabase(runtime);
    await artifacts.put({ sha256: sourceSha256, bytes: sourceBytes });
    const repository = new PostgresqlDefinitionPresentationRepository(runtime);
    const exact = sidecar("<bpmndi:BPMNDiagram/>");
    await repository.insertOrCompare(exact);
    await runtime.query({
      text: `
        UPDATE bpmn_platform.definition_diagram_presentations
        SET diagram_interchange_xml = $1
        WHERE source_sha256 = $2 AND effective_generator_sha256 = $3
      `,
      values: [
        Buffer.from("<corrupt/>", "utf8"),
        sourceSha256,
        exact.provenance.effectiveGeneratorSha256,
      ],
    });
    await assert.rejects(
      repository.get({
        schemaEpoch: 1,
        sourceSha256,
        effectiveGeneratorSha256: exact.provenance.effectiveGeneratorSha256,
      }),
      DefinitionPresentationIntegrityError,
    );
  });

  test("migration 0011 backfills legacy direct starts and preserves non-direct nulls", async () => {
    await resetDatabase(runtime);
    const migrationSql = await readFile(
      new URL(
        "../../migrations/0011_definitions-start-command__681798219edab00a928b6289190b823aff6836027d40012d55707cb1ef332b8d.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await runtime.withDedicatedSession(async (session) => {
      await session.query({ text: "BEGIN" });
      try {
        await session.query({ text: `
          ALTER TABLE bpmn_platform.confirmed_process_instances
            DROP CONSTRAINT confirmed_process_instances_direct_start_command,
            DROP COLUMN direct_start_command
        ` });
        await session.query({ text: `
          ALTER TABLE bpmn_platform_meta.schema_epoch
            DROP CONSTRAINT schema_epoch_epoch_check
        ` });
        await session.query({ text: `
          UPDATE bpmn_platform_meta.schema_epoch SET epoch = 10
          WHERE singleton = true AND epoch = 11
        ` });
        await session.query({ text: `
          ALTER TABLE bpmn_platform_meta.schema_epoch
            ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 10)
        ` });
        await session.query({
          text: `
            INSERT INTO bpmn_platform.confirmed_process_instances (
              process_instance_id, public_instance_json, work_locator,
              direct_intent_json, state, operate_pending, work_pending
            ) VALUES
              ($1, '{}', $2, $3, 'reserved', false, false),
              ($4, '{}', $5, NULL, 'confirmed', true, true)
          `,
          values: [
            Buffer.from("legacy-direct", "utf8"),
            Buffer.from("legacy-direct-locator", "utf8"),
            JSON.stringify({
              protocol: "bpmn-direct-start-v1",
              intentSha256: "b".repeat(64),
            }),
            Buffer.from("legacy-confirmed", "utf8"),
            Buffer.from("legacy-confirmed-locator", "utf8"),
          ],
        });

        await session.query({ text: migrationSql });

        const rows = await session.query({
          text: `
            SELECT process_instance_id, direct_start_command
            FROM bpmn_platform.confirmed_process_instances
            ORDER BY process_instance_id ASC
          `,
        });
        assert.equal(
          Buffer.from(rows.rows[0]!.process_instance_id as Uint8Array).toString("utf8"),
          "legacy-confirmed",
        );
        assert.equal(rows.rows[0]!.direct_start_command, null);
        assert.equal(
          Buffer.from(rows.rows[1]!.process_instance_id as Uint8Array).toString("utf8"),
          "legacy-direct",
        );
        assert.equal(
          Buffer.from(rows.rows[1]!.direct_start_command as Uint8Array).toString("utf8"),
          '{"initialVariables":[]}',
        );
        const epoch = await session.query({
          text: `
            SELECT epoch FROM bpmn_platform_meta.schema_epoch
            WHERE singleton = true
          `,
        });
        assert.deepEqual(epoch.rows, [{ epoch: 11 }]);
      } finally {
        await session.query({ text: "ROLLBACK" });
      }
    });
  });
}

function createTestRuntime(
  connectionString: string,
  applicationName: string,
  maxConnections: number,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.message_start_publications,
        bpmn_platform.definition_schedules,
        bpmn_platform.confirmed_process_instances,
        bpmn_platform.definition_diagram_presentations,
        bpmn_platform.definition_versions,
        bpmn_platform.definition_version_heads,
        bpmn_platform.exact_artifacts
    `,
  });
}

function metadata(
  processId: string,
  sha256: string = sourceSha256,
): NewDefinitionMetadata {
  return {
    processId,
    source: {
      kind: "bpmnSource",
      id: "definition.bpmn",
      sha256,
      byteLength: sourceBytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile-v1",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}

function postgresqlCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
