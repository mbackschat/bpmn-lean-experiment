import assert from "node:assert/strict";
import { test } from "node:test";
import { StimulusKind } from "@bpmn-lean/semantic-core";
import { parallelProgramCapacityCases } from "./parallel-scope-start-bound-fixture.ts";
const owner = await import(new URL("../../semantic-core/dist/parallel-scope-program-capacity.js", import.meta.url).href) as typeof import("../../semantic-core/src/parallel-scope-program-capacity.ts");
const { supportsSemanticProcessExecution } = await import(new URL("../../semantic-core/dist/semantic-process-admission.js", import.meta.url).href) as typeof import("../../semantic-core/src/semantic-process-admission.ts");

test("private raw IL capacity enforces shape, ownership, data and count limits without enabling execution", async () => {
  for (const [index, { program, bindings, expected }] of (await parallelProgramCapacityCases()).entries()) {
    const result = owner.parallelScopeProgramStartCapacity(program, bindings);
    assert.deepEqual(result ?? null, expected, `IL case ${index}`);
    if (expected !== null) {
      const typed = program as import("@bpmn-lean/semantic-core").SemanticProcessProgram;
      assert.equal(supportsSemanticProcessExecution({ kind: StimulusKind.StartProcess, commandId: "start", processId: typed.processId, instanceId: "batch", initialVariables: bindings }, typed), false);
    }
  }
});
