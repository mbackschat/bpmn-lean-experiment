import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import { StimulusKind, VariableValueKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { compile, source } from "../../../bpmn-source/test/mixed-task-business-error-fixture.ts";

test("business Error execution remains unavailable to Temporal until recovery and replay qualify", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected business Error fixture");
  const program = compiled.semanticProcess;
  assert.equal(supportsSemanticProcessExecution({ kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "invoice", initialVariables: [
      { name: "request", value: { kind: VariableValueKind.String, value: "ready" } }],
  }, program), true);
  for (const candidate of [program, { ...program, operations: [] }]) {
    const result = assessTemporalHostCapability(candidate);
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
    if (result.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("Unqualified business Error reached hosting");
    assert.equal(result.failure.code, "mixedTaskControlFlowQualificationUnavailable");
  }
});
