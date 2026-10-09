import { DefinitionStartDescriptionStatus } from "@bpmn-lean/platform-engine-gateway";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createPostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";
import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import { PostgresqlDefinitionRepository, PostgresqlConfirmedProcessInstanceRepository, ConfirmedProcessInstancePublicationService, DefinitionStartService } from "@bpmn-lean/platform-definitions";
import { PostgresqlWorkRepository, PostgresqlWorkSnapshotReader } from "@bpmn-lean/platform-work";
import { PostgresqlProcessInstanceRepository, PostgresqlIncidentSnapshotReader } from "@bpmn-lean/platform-operate";
import type { DefinitionVersionStarter } from "@bpmn-lean/platform-engine-gateway";

const baseConnectionString = process.env.BPMN_TEST_POSTGRES_URL;
const migrationDirectories = ["foundation/artifact-store", "modules/definitions", "modules/operate", "modules/work", "foundation/audit", "foundation/recovery-runtime"].map((owner) => fileURLToPath(new URL(`../../../../${owner}/migrations`, import.meta.url)));

if (baseConnectionString === undefined) {
  test("retained source-overlay upgrade requires an explicit real PostgreSQL database", { skip: "BPMN_TEST_POSTGRES_URL is not set" });
} else {
  const databaseName = `bpmn_overlay_upgrade_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = new URL(baseConnectionString);
  databaseUrl.pathname = `/${databaseName}`;
  const connectionString = databaseUrl.toString();
  const admin = createPostgresqlRuntime({ connectionString: baseConnectionString, applicationName: "source-overlay-upgrade-admin", maxConnections: 1, connectionTimeoutMs: 2000, idleTimeoutMs: 2000, queryTimeoutMs: 5000, statementTimeoutMs: 5000, lockTimeoutMs: 2000, idleInTransactionSessionTimeoutMs: 5000 });
  const runtime = createPostgresqlRuntime({ connectionString, applicationName: "source-overlay-upgrade", maxConnections: 2, connectionTimeoutMs: 2000, idleTimeoutMs: 2000, queryTimeoutMs: 5000, statementTimeoutMs: 5000, lockTimeoutMs: 2000, idleInTransactionSessionTimeoutMs: 5000 });
  before(async () => {
    // The suite runner isolates packages; this prefix witness must leave sibling server tests' database untouched.
    await admin.query({ text: `CREATE DATABASE "${databaseName}"` });
    const prefix = await mkdtemp(join(tmpdir(), "overlay-migration-prefix-"));
    try {
      for (const directory of migrationDirectories) for (const name of await readdir(directory)) {
        if (Number(name.slice(0, 4)) <= 12) await copyFile(join(directory, name), join(prefix, name));
      }
      await runPostgresqlMigrations({ connectionString, migrationDirectories: [prefix] });
    } finally { await rm(prefix, { recursive: true, force: true }); }
  });
  after(async () => {
    try { await runtime.close(); } finally {
      try { await admin.query({ text: `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)` }); }
      finally { await admin.close(); }
    }
  });

  test("upgrades populated epoch 12 and reads retained definitions, starts and completed Work/Operations generations", async () => {
    const bytes = new TextEncoder().encode("prior public deployment");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const source = { kind: "bpmnSource", id: 'source-🚀\u0000\\literal\\u0000"', sha256, byteLength: bytes.length, declaredEncoding: null, decodedAs: "UTF-8" } as const;
    const artifacts = new PostgresqlExactArtifactStore(runtime);
    await artifacts.put({ sha256, bytes });
    const definitions = new PostgresqlDefinitionRepository(runtime);
    const oldDefinition = { processId: "Process-🚀\u0000", version: 1, source, semanticProfile: "retained-profile", startCapabilities: { messageStarts: [], timerStarts: [] } };
    const definition = { ...oldDefinition, sourceOverlay: null };
    for (const prior of [
      { processInstanceId: "top-level-\u0000", definition: { ...oldDefinition, processId: "plain", source: { ...source, id: "plain" } } },
      { processInstanceId: "plain", definition: oldDefinition },
    ] as const) {
      await assert.rejects(runtime.query({ text: "SELECT $1::json -> 'definition'", values: [JSON.stringify(prior)] }), { code: "22P05" });
    }
    await runtime.query({ text: "INSERT INTO bpmn_platform.definition_version_heads VALUES ($1, 2);", values: [Buffer.from(definition.processId)] });
    await runtime.query({ text: "INSERT INTO bpmn_platform.definition_versions (process_id, version, source_kind, source_id, source_sha256, source_byte_length, source_declared_encoding, source_decoded_as, semantic_profile, start_capabilities_json) VALUES ($1, 1, 'bpmnSource', $2, $3, $4, NULL, 'UTF-8', $5, $6)", values: [Buffer.from(definition.processId), Buffer.from(source.id), sha256, bytes.length, Buffer.from(definition.semanticProfile), JSON.stringify(definition.startCapabilities)] });
    const confirmed = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const intent = { protocol: "bpmn-direct-start-v1", intentSha256: "d".repeat(64) } as const;
    const priorSnapshots = new Map<string, string>();
    for (const [processInstanceId, state] of [["nested-control", "confirmed"], ["reserved-🚀\u0000", "reserved"], ["uncertain-🚀\u0000", "indeterminate"]] as const) {
      const publicInstanceJson = JSON.stringify({ processInstanceId, definition: oldDefinition });
      priorSnapshots.set(processInstanceId, publicInstanceJson);
      await runtime.query({ text: "INSERT INTO bpmn_platform.confirmed_process_instances (process_instance_id, public_instance_json, work_locator, direct_intent_json, direct_start_command, state, operate_pending, work_pending) VALUES ($1, $2, $3, $4, $5, $6, false, false)", values: [Buffer.from(processInstanceId), JSON.stringify({ processInstanceId, definition: oldDefinition }), Buffer.from("opaque-" + processInstanceId), JSON.stringify(intent), Buffer.from('{"initialVariables":[]}'), state] });
    }
    const instance = { processInstanceId: "retained-🚀\u0000", definition };
    const oldInstanceJson = JSON.stringify({ processInstanceId: instance.processInstanceId, definition: oldDefinition });
    const work = new PostgresqlWorkRepository(runtime);
    const operate = new PostgresqlProcessInstanceRepository(runtime);
    await runtime.query({ text: "INSERT INTO bpmn_platform.work_processes (process_instance_id, public_instance_json, work_locator, observation, population_ordinal) VALUES ($1, $2, $3, 'active', 1)", values: [Buffer.from(instance.processInstanceId), oldInstanceJson, Buffer.from("opaque")] });
    await runtime.query({ text: "INSERT INTO bpmn_platform.operate_process_instances (process_instance_id, process_id, definition_version, source_sha256, public_identity_json, process_locator, observation, population_ordinal) VALUES ($1, $2, 1, $3, $4, $5, 'active', 1)", values: [Buffer.from(instance.processInstanceId), Buffer.from(definition.processId), sha256, oldInstanceJson, Buffer.from("opaque")] });
    await runtime.query({ text: `
      INSERT INTO bpmn_platform.work_snapshot_generations VALUES (1, 1, 1, 1, 'completed', clock_timestamp(), clock_timestamp());
      UPDATE bpmn_platform.work_snapshot_control SET population_head = 1, next_generation = 2, completed_generation = 1;
      INSERT INTO bpmn_platform.work_snapshot_generation_items SELECT 1, population_ordinal, process_instance_id, public_instance_json, work_locator, observation, 'succeeded', clock_timestamp() FROM bpmn_platform.work_processes;
      UPDATE bpmn_platform.work_snapshot_generations SET observed_after_at = (SELECT min(observed_at) FROM bpmn_platform.work_snapshot_generation_items), completed_at = clock_timestamp();
      INSERT INTO bpmn_platform.operate_incident_snapshot_generations VALUES (1, 1, 1, 1, 'completed', clock_timestamp(), clock_timestamp());
      UPDATE bpmn_platform.operate_incident_snapshot_control SET population_head = 1, next_generation = 2, completed_generation = 1;
      INSERT INTO bpmn_platform.operate_incident_snapshot_generation_items SELECT 1, population_ordinal, process_instance_id, ordinal, process_id, definition_version, source_sha256, public_identity_json, process_locator, observation, 'succeeded', clock_timestamp() FROM bpmn_platform.operate_process_instances;
      UPDATE bpmn_platform.operate_incident_snapshot_generations SET observed_after_at = (SELECT min(observed_at) FROM bpmn_platform.operate_incident_snapshot_generation_items), completed_at = clock_timestamp();
    ` });
    const workReader = new PostgresqlWorkSnapshotReader({ runtime, maxAgeMs: 60000, maxProcesses: 10, maxTasks: 10 });
    const operateReader = new PostgresqlIncidentSnapshotReader({ runtime, maxAgeMs: 60000, maxProcesses: 10, maxIncidentsPerProcess: 10, maxIncidents: 10 });
    const privateBefore = (await runtime.query({ text: "SELECT direct_intent_json, direct_start_command FROM bpmn_platform.confirmed_process_instances ORDER BY process_instance_id" })).rows;
    await runtime.query({ text: "INSERT INTO bpmn_platform.work_actions (action_id, action_kind, actor_id, hosting_process_instance_id, task_process_instance_id, element_id, activation, input_generation, result_json) VALUES (decode('01','hex'), 'claim', decode('02','hex'), $1, $1, decode('03','hex'), 1, 0, '{\"retained\" : \"historical outcome\"}')", values: [Buffer.from(instance.processInstanceId)] });
    const historyBefore = (await runtime.query({ text: "SELECT * FROM bpmn_platform.work_actions" })).rows;
    await assert.rejects(definitions.get(definition));
    await assert.rejects(workReader.read());
    await assert.rejects(operateReader.read());
    for (const [mutated, code] of [
      [oldInstanceJson.replace('"processId":', '"processId":"duplicate","processId":'), "P0001"],
      [oldInstanceJson.replace('"processId":', '"\\u0070rocessId":'), "P0001"],
      [oldInstanceJson.slice(0, -1), "22P02"],
    ] as const) {
      await runtime.query({ text: "UPDATE bpmn_platform.work_snapshot_generation_items SET expected_public_instance_json = $1", values: [mutated] });
      await assert.rejects(runPostgresqlMigrations({ connectionString, migrationDirectories }), { code });
      assert.deepEqual((await runtime.query({ text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch" })).rows, [{ epoch: 12 }]);
      assert.deepEqual((await runtime.query({ text: "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = 'bpmn_platform' AND table_name IN ('definition_versions', 'definition_schedules', 'message_start_publications') AND column_name IN ('source_overlay_id', 'source_overlay_sha256')" })).rows, [{ count: 0 }]);
      assert.deepEqual((await runtime.query({ text: "SELECT expected_public_instance_json FROM bpmn_platform.work_snapshot_generation_items" })).rows, [{ expected_public_instance_json: mutated }]);
      assert.deepEqual((await runtime.query({ text: "SELECT public_instance_json FROM bpmn_platform.confirmed_process_instances WHERE process_instance_id = $1", values: [Buffer.from("nested-control")] })).rows, [{ public_instance_json: priorSnapshots.get("nested-control") }]);
      await runtime.query({ text: "UPDATE bpmn_platform.work_snapshot_generation_items SET expected_public_instance_json = $1", values: [oldInstanceJson] });
    }
    const applied = await runPostgresqlMigrations({ connectionString, migrationDirectories });
    assert.equal(applied.appliedNames.length, 13);
    assert.match(applied.appliedNames[12] ?? "", /^0013_definitions-source-overlay__/u);
    assert.deepEqual((await runtime.query({ text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch" })).rows, [{ epoch: 13 }]);
    assert.equal((await definitions.get(definition))?.sourceOverlay, null);
    assert.equal((await confirmed.get("reserved-🚀\u0000"))?.instance.definition.sourceOverlay, null);
    for (const [processInstanceId, prior] of priorSnapshots) {
      assert.deepEqual((await runtime.query({ text: "SELECT public_instance_json FROM bpmn_platform.confirmed_process_instances WHERE process_instance_id = $1", values: [Buffer.from(processInstanceId)] })).rows, [{ public_instance_json: prior.slice(0, -2) + ',"sourceOverlay":null}}' }]);
      assert.deepEqual((await confirmed.get(processInstanceId))?.instance, { processInstanceId, definition });
    }
    assert.equal((await work.listProcessRegistrations())[0]?.instance.definition.sourceOverlay, null);
    assert.equal((await operate.getRegistration(instance.processInstanceId))?.instance.definition.sourceOverlay, null);
    assert.deepEqual((await workReader.read()).value, []);
    assert.deepEqual((await operateReader.read()).value, { incidents: [] });
    assert.deepEqual((await runtime.query({ text: "SELECT direct_intent_json, direct_start_command FROM bpmn_platform.confirmed_process_instances ORDER BY process_instance_id" })).rows, privateBefore);
    assert.deepEqual((await runtime.query({ text: "SELECT * FROM bpmn_platform.work_actions" })).rows, historyBefore);
    const dispatched: string[] = []; const described: string[] = [];
    const starter: DefinitionVersionStarter = {
      prepareDefinitionVersion: async () => { throw new Error("recovery cannot reprepare"); }, startDefinitionVersion: async () => { throw new Error("recovery cannot allocate a new start"); },
      startPreparedDefinitionVersion: async (request) => { dispatched.push(request.processInstanceId); return { status: "started", processInstanceId: request.processInstanceId, source, definition: { processId: definition.processId, semanticProfile: definition.semanticProfile, sourceOverlay: null } }; },
      describeDefinitionVersionStart: async (request) => { described.push(request.processInstanceId); return { status: DefinitionStartDescriptionStatus.Matching }; },
    };
    const publication = new ConfirmedProcessInstancePublicationService({ repository: confirmed, operate: { recordConfirmedProcessInstance: async () => {} }, work: { recordConfirmedProcessInstance: async () => {} } });
    await new DefinitionStartService(starter, artifacts, definitions, () => { throw new Error("recovery cannot allocate identity"); }, publication).reconcileAll();
    assert.deepEqual(dispatched, ["reserved-🚀\u0000"]); assert.deepEqual(described, ["uncertain-🚀\u0000"]);
    const retainedExpected = (await runtime.query({ text: "SELECT expected_public_instance_json FROM bpmn_platform.work_snapshot_generation_items" })).rows;
    await runtime.query({ text: "UPDATE bpmn_platform.work_snapshot_generation_items SET expected_public_instance_json = regexp_replace(expected_public_instance_json, ',\"sourceOverlay\":null}}$', '}}')" });
    await assert.rejects(workReader.read());
    await runtime.query({ text: "UPDATE bpmn_platform.work_snapshot_generation_items SET expected_public_instance_json = $1", values: [retainedExpected[0]?.expected_public_instance_json] });
    assert.deepEqual((await workReader.read()).value, []);
  });
}
