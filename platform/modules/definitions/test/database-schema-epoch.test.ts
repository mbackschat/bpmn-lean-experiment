import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  DefinitionSchemaResetRequiredError,
  SqliteConfirmedProcessInstanceRepository,
  SqliteDefinitionRepository,
  SqliteDefinitionScheduleRepository,
} from "@bpmn-lean/platform-definitions";

test("rejects a prior-epoch database before old definition or terminal schedule decoding", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schema-epoch-old-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const legacy = new DatabaseSync(databaseFile);
    legacy.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE definition_versions (
        process_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        start_capabilities_json TEXT NOT NULL,
        PRIMARY KEY (process_id, version)
      ) STRICT;
      INSERT INTO definition_versions VALUES (
        'Legacy_Process', 1, '{"timerStarts":[]}'
      );
      CREATE TABLE definition_schedules (
        process_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        schedule_id TEXT NOT NULL,
        start_capabilities_json TEXT NOT NULL,
        state TEXT NOT NULL,
        PRIMARY KEY (process_id, version, schedule_id)
      ) STRICT;
      INSERT INTO definition_schedules VALUES (
        'Legacy_Process', 1, 'legacy-terminal',
        '{"timerStarts":[{"startEventId":"TimerStart","durationMs":1000}]}',
        'started'
      );
    `);
    legacy.close();

    assert.throws(
      () => new SqliteConfirmedProcessInstanceRepository(databaseFile),
      (error: unknown) => error instanceof DefinitionSchemaResetRequiredError,
    );
    assert.throws(
      () => new SqliteDefinitionScheduleRepository(databaseFile),
      (error: unknown) => error instanceof DefinitionSchemaResetRequiredError,
    );
    assert.throws(
      () => new SqliteDefinitionRepository(databaseFile),
      (error: unknown) => error instanceof DefinitionSchemaResetRequiredError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sets one shared epoch on an empty database before either repository creates tables", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schema-epoch-fresh-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const schedules = new SqliteDefinitionScheduleRepository(databaseFile);
    schedules.close();
    const definitions = new SqliteDefinitionRepository(databaseFile);
    definitions.close();
    const confirmed = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    confirmed.close();

    const database = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      const row = database.prepare("PRAGMA user_version").get();
      assert.equal(row?.user_version, 2);
    } finally {
      database.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
