/**
 * A Task carrying the project's `bpmnLean:taskDefinition` extension under each profile (`ConfiguredTask`, CIB-LIM-0011).
 * The standards profile runs it as an extended Task type that waits for the external work its handler type names. CIB
 * Seven `2.2.0` ignores the extension and passes the Task through as an Abstract Task, so the cibseven profiles refuse it
 * at admission. The retained `configured-task` source is read under each profile's own relations, so the selection, not
 * a hand-set option, is under test.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";

import { kernelAdmission, readCaseSource } from "./kernel-program.ts";

const relativePath = "scenarios/configured-task/process.bpmn";

async function read(profile: string) {
  const bytes = new Uint8Array(await readFile(new URL(`../../../${relativePath}`, import.meta.url)));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return readCaseSource({ relativePath, bytes, sha256, overlay: null }, profile);
}

for (const profile of ["cibseven-2.2.0", "cibseven-2.2.0-scope-chain"]) {
  test(`a Task with the task-definition extension is refused under ${profile}`, async () => {
    assert.deepEqual(kernelAdmission(await read(profile)), { status: "rejected", refusal: "work.configuredTask" });
  });
}

test("a Task with the task-definition extension opens its configured work under bpmn-2.0.2", async () => {
  const program = await read("bpmn-2.0.2");
  assert.deepEqual(kernelAdmission(program), { status: "accepted" });
  assert.equal(program.kind, "read");
  const decoded = decodeProgram((program as Extract<typeof program, { kind: "read" }>).program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({ kind: "start", commandId: "s01", instanceId: "Instance_1", variables: [] });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  const outcome = step(hooks, decoded.value, null, stimulus.value[1]);
  assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome.failure));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["ConfiguredTask_Probe"]);
});
