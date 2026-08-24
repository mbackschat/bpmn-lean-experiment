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
      assert.equal(row?.user_version, 4);
    } finally {
      database.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migrates the exact epoch-3 confirmed-instance table with canonical legacy commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schema-epoch-three-"));
  const databaseFile = join(root, "definitions.sqlite");
  const publicInstance = (processInstanceId: string) => JSON.stringify({
    processInstanceId,
    definition: {
      processId: "Legacy_Process",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "legacy.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "legacy-profile",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  });
  try {
    const legacy = new DatabaseSync(databaseFile);
    legacy.exec(`
      PRAGMA user_version = 3;
      CREATE TABLE confirmed_process_instances (
        process_instance_id TEXT PRIMARY KEY NOT NULL,
        public_instance_json TEXT NOT NULL CHECK (length(public_instance_json) > 0),
        work_locator TEXT NOT NULL CHECK (length(work_locator) > 0),
        direct_intent_json TEXT,
        state TEXT NOT NULL CHECK (
          state IN ('reserved', 'starting', 'indeterminate', 'confirmed', 'integrityFailure')
        ),
        operate_pending INTEGER NOT NULL CHECK (operate_pending IN (0, 1)),
        work_pending INTEGER NOT NULL CHECK (work_pending IN (0, 1)),
        CHECK (
          (state = 'confirmed') OR (operate_pending = 0 AND work_pending = 0)
        )
      ) STRICT;
    `);
    const insert = legacy.prepare(`
      INSERT INTO confirmed_process_instances VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      "legacy-direct",
      publicInstance("legacy-direct"),
      "legacy-direct-locator",
      JSON.stringify({
        protocol: "bpmn-direct-start-v1",
        intentSha256: "b".repeat(64),
      }),
      "reserved",
      0,
      0,
    );
    insert.run(
      "legacy-confirmed",
      publicInstance("legacy-confirmed"),
      "legacy-confirmed-locator",
      null,
      "confirmed",
      1,
      1,
    );
    legacy.close();

    const repository = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    const direct = await repository.get("legacy-direct");
    const confirmed = await repository.get("legacy-confirmed");
    repository.close();

    assert.deepEqual(
      Array.from(Reflect.get(direct!, "startCommandBytes") as Uint8Array),
      Array.from(new TextEncoder().encode('{"initialVariables":[]}')),
    );
    assert.equal(Reflect.get(confirmed!, "startCommandBytes"), null);
    const migrated = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 4);
    } finally {
      migrated.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects and leaves untouched a structurally divergent epoch-3 confirmed store", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schema-epoch-divergent-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const divergent = new DatabaseSync(databaseFile);
    divergent.exec(`
      PRAGMA user_version = 3;
      CREATE TABLE confirmed_process_instances (
        process_instance_id TEXT PRIMARY KEY NOT NULL,
        unexpected_column TEXT NOT NULL
      ) STRICT;
      INSERT INTO confirmed_process_instances VALUES ('retained', 'unchanged');
    `);
    divergent.close();

    assert.throws(
      () => new SqliteConfirmedProcessInstanceRepository(databaseFile),
      (error: unknown) => error instanceof DefinitionSchemaResetRequiredError,
    );

    const retained = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      assert.equal(retained.prepare("PRAGMA user_version").get()?.user_version, 3);
      const row = retained.prepare("SELECT * FROM confirmed_process_instances").get();
      assert.equal(row?.process_instance_id, "retained");
      assert.equal(row?.unexpected_column, "unchanged");
    } finally {
      retained.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
