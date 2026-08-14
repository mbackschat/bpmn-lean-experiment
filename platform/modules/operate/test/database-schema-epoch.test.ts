import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  OperateSchemaResetRequiredError,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";

test("sets an independent epoch on a fresh Process-instance database", async () => {
  await withDatabaseFile(async (databaseFile) => {
    const repository = new SqliteProcessInstanceRepository(databaseFile);
    repository.close();

    const database = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 4);
      assert.deepEqual(
        database.prepare(`
          SELECT name FROM sqlite_schema
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `).all().map((row) => ({ name: row.name })),
        [
          { name: "execution_publication_batches" },
          { name: "execution_publication_records" },
          { name: "execution_publications" },
          { name: "flow_node_occurrence_batches" },
          { name: "flow_node_occurrence_publications" },
          { name: "flow_node_occurrences" },
          { name: "incident_action_audit_outbox" },
          { name: "incident_actions" },
          { name: "process_instances" },
        ],
      );
    } finally {
      database.close();
    }
  });
});

test("rejects prior, unknown, and corrupt schemas before reading rows", async () => {
  for (const initialize of [
    (database: DatabaseSync) => database.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE process_instances (legacy TEXT) STRICT;
    `),
    (database: DatabaseSync) => database.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE unknown_records (value TEXT) STRICT;
    `),
    (database: DatabaseSync) => database.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE process_instances (
        ordinal INTEGER PRIMARY KEY,
        process_instance_id TEXT NOT NULL
      ) STRICT;
    `),
    (database: DatabaseSync) => database.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE process_instances (
        ordinal INTEGER PRIMARY KEY,
        process_instance_id TEXT NOT NULL,
        process_id TEXT NOT NULL,
        definition_version INTEGER NOT NULL,
        source_sha256 TEXT NOT NULL,
        public_identity_json TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX process_instances_unique_identity
        ON process_instances (process_instance_id);
      CREATE INDEX process_instances_process_id_ordinal
        ON process_instances (process_id, ordinal DESC);
      CREATE INDEX process_instances_version_ordinal
        ON process_instances (definition_version, ordinal DESC);
      CREATE INDEX process_instances_source_sha256_ordinal
        ON process_instances (source_sha256, ordinal DESC);
    `),
  ]) {
    await withDatabaseFile(async (databaseFile) => {
      const database = new DatabaseSync(databaseFile);
      initialize(database);
      database.close();

      assert.throws(
        () => new SqliteProcessInstanceRepository(databaseFile),
        (error: unknown) =>
          error instanceof OperateSchemaResetRequiredError,
      );
    });
  }
});

async function withDatabaseFile(
  run: (databaseFile: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-operate-schema-"));
  try {
    await run(join(root, "process-instances.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
