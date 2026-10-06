import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parallelAdmissionCases } from "../../bpmn-source/test/parallel-scope-admission-fixture.ts";
import { parallelStartBoundCases } from "../../bpmn-source/test/parallel-scope-start-bound-fixture.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
const { parallelScopeCheckedSourceAdmitted } = await import(new URL("../../bpmn-source/dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../../bpmn-source/src/multi-instance-scope-source-compiler.ts");
const { parallelScopeStartClosureBound } = await import(new URL("../../bpmn-source/dist/parallel-scope-start-bound.js", import.meta.url).href) as typeof import("../../bpmn-source/src/parallel-scope-start-bound.ts");

test("Lean independently admits or refuses the same private parallel checked-source inputs", async () => {
  const cases = await parallelAdmissionCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-source-admission-"));
  try {
    const files: string[] = [];
    for (const [index, { source, expected }] of cases.entries()) {
      assert.equal(parallelScopeCheckedSourceAdmitted(source), expected, `admission case ${index}`);
      const file = path.join(directory, `${index}.json`);
      await writeFile(file, JSON.stringify(source));
      files.push(file);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeAdmissionMain.lean", files, cases.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), cases.map(({ expected }) => expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Lean and TypeScript derive the same model-bound closure fuel from validated Start inputs", async () => {
  const cases = await parallelStartBoundCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-start-bound-"));
  try {
    const files: string[] = [];
    for (const [index, { source, bindings, expected }] of cases.entries()) {
      assert.equal(parallelScopeStartClosureBound(source, bindings) ?? null, expected, `Start bound case ${index}`);
      const sourcePath = path.join(directory, `${index}.source.json`);
      const stimulusPath = path.join(directory, `${index}.start.json`);
      await writeFile(sourcePath, JSON.stringify(source));
      await writeFile(stimulusPath, JSON.stringify({ kind: "startProcess", commandId: "start", processId: source.processId,
        instanceId: "batch", initialVariables: bindings }));
      files.push(sourcePath, stimulusPath);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeStartAdmissionMain.lean", files, cases.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), cases.map(({ expected }) => expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
