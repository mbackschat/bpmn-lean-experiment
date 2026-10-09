import { DefinitionStartDescriptionStatus } from "@bpmn-lean/platform-engine-gateway";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SqliteDefinitionRepository, SqliteConfirmedProcessInstanceRepository, ConfirmedProcessInstancePublicationService, DefinitionStartService } from "@bpmn-lean/platform-definitions";
import { SqliteWorkRepository } from "@bpmn-lean/platform-work";
import { SqliteProcessInstanceRepository } from "@bpmn-lean/platform-operate";
import type { DefinitionVersionStarter } from "@bpmn-lean/platform-engine-gateway";

const bytes = new TextEncoder().encode("retained old public source");
const source = { kind: "bpmnSource", id: "old-🚀\u0000.bpmn", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, declaredEncoding: null, decodedAs: "UTF-8" } as const;
const metadata = { processId: "Process-🚀\u0000", source, semanticProfile: "old-profile", startCapabilities: { messageStarts: [], timerStarts: [] }, sourceOverlay: null } as const;
const command = new TextEncoder().encode('{"initialVariables":[]}');
const intent = { protocol: "bpmn-direct-start-v1", intentSha256: "d".repeat(64) } as const;

test("populated previous SQLite schemas upgrade to strict current Definitions, start, Work and Operations readers", async () => {
  const root = await mkdtemp(join(tmpdir(), "overlay-previous-schema-"));
  const definitionsFile = join(root, "definitions.sqlite");
  const workFile = join(root, "work.sqlite");
  const operateFile = join(root, "operate.sqlite");
  try {
    let definitions = new SqliteDefinitionRepository(definitionsFile);
    const definition = await definitions.allocateNext(metadata);
    definitions.close();
    let confirmed = new SqliteConfirmedProcessInstanceRepository(definitionsFile);
    for (const processInstanceId of ["reserved-🚀\u0000", "uncertain-🚀\u0000"]) {
      await confirmed.reserveDirect({ instance: { processInstanceId, definition }, locator: "opaque-" + processInstanceId, intent, startCommandBytes: command });
    }
    await confirmed.compareAndSetState("uncertain-🚀\u0000", "reserved", "starting");
    await confirmed.compareAndSetState("uncertain-🚀\u0000", "starting", "indeterminate");
    confirmed.close();
    const publicInstance = { processInstanceId: "retained-🚀\u0000", definition };
    let work = new SqliteWorkRepository(workFile);
    await work.recordConfirmedProcessInstance({ instance: publicInstance, locator: "opaque" }); work.close();
    let operate = new SqliteProcessInstanceRepository(operateFile);
    await operate.recordConfirmed({ instance: publicInstance, locator: "opaque" }); operate.close();

    const oldDefinitions = new DatabaseSync(definitionsFile);
    oldDefinitions.exec("ALTER TABLE definition_versions DROP COLUMN source_overlay_id; ALTER TABLE definition_versions DROP COLUMN source_overlay_sha256; UPDATE confirmed_process_instances SET public_instance_json = json_remove(public_instance_json, '$.definition.sourceOverlay'); PRAGMA user_version = 4");
    const priorPrivate = oldDefinitions.prepare("SELECT direct_intent_json, direct_start_command FROM confirmed_process_instances ORDER BY process_instance_id").all(); oldDefinitions.close();
    for (const [file, table, field, epoch] of [[workFile, "work_processes", "public_instance_json", 3], [operateFile, "process_instances", "public_identity_json", 4]] as const) {
      const previous = new DatabaseSync(file);
      previous.exec(`UPDATE ${table} SET ${field} = json_remove(${field}, '$.definition.sourceOverlay'); PRAGMA user_version = ${epoch}`); previous.close();
    }
    definitions = new SqliteDefinitionRepository(definitionsFile);
    confirmed = new SqliteConfirmedProcessInstanceRepository(definitionsFile);
    work = new SqliteWorkRepository(workFile);
    operate = new SqliteProcessInstanceRepository(operateFile);
    try {
      assert.equal((await definitions.get(definition))?.sourceOverlay, null);
      assert.equal((await confirmed.get("reserved-🚀\u0000"))?.instance.definition.sourceOverlay, null);
      assert.equal((await work.listProcessRegistrations())[0]?.instance.definition.sourceOverlay, null);
      assert.equal((await operate.getRegistration(publicInstance.processInstanceId))?.instance.definition.sourceOverlay, null);
      const readback = new DatabaseSync(definitionsFile, { readOnly: true });
      assert.deepEqual(readback.prepare("SELECT direct_intent_json, direct_start_command FROM confirmed_process_instances ORDER BY process_instance_id").all(), priorPrivate); readback.close();
      const dispatched: string[] = []; const described: string[] = [];
      const starter: DefinitionVersionStarter = {
        prepareDefinitionVersion: async () => { throw new Error("recovery cannot reprepare"); },
        startDefinitionVersion: async () => { throw new Error("recovery cannot unconditionally start"); },
        startPreparedDefinitionVersion: async (request) => { dispatched.push(request.processInstanceId); return { status: "started", processInstanceId: request.processInstanceId, source, definition: { processId: metadata.processId, semanticProfile: metadata.semanticProfile, sourceOverlay: null } }; },
        describeDefinitionVersionStart: async (request) => { described.push(request.processInstanceId); return { status: DefinitionStartDescriptionStatus.Matching }; },
      };
      const publication = new ConfirmedProcessInstancePublicationService({ repository: confirmed, operate: { recordConfirmedProcessInstance: async () => {} }, work: { recordConfirmedProcessInstance: async () => {} } });
      const service = new DefinitionStartService(starter, { get: async () => Uint8Array.from(bytes), put: async () => ({ status: "stored" }) }, definitions, () => { throw new Error("recovery cannot allocate identity"); }, publication);
      await service.reconcileAll();
      assert.deepEqual(dispatched, ["reserved-🚀\u0000"]);
      assert.deepEqual(described, ["uncertain-🚀\u0000"]);
      assert.equal((await confirmed.get("reserved-🚀\u0000"))?.state, "confirmed");
      assert.equal((await confirmed.get("uncertain-🚀\u0000"))?.state, "confirmed");
    } finally { definitions.close(); confirmed.close(); work.close(); operate.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
