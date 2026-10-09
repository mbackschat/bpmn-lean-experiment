import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import { StimulusKind, VariableValueKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { compile, source } from "../../../bpmn-source/test/mixed-task-business-error-fixture.ts";

test("business Error hosting admits the qualified account without relaxing semantic admission", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected business Error fixture");
  const program = compiled.semanticProcess;
  assert.equal(supportsSemanticProcessExecution({ kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "invoice", initialVariables: [
      { name: "request", value: { kind: VariableValueKind.String, value: "ready" } }],
  }, program), true);
  assert.equal(assessTemporalHostCapability(program).kind, TemporalHostCapabilityResultKind.Admitted);
  assert.equal(supportsSemanticProcessExecution({ kind: StimulusKind.StartProcess, commandId: "invalid-program",
    processId: program.processId, instanceId: "invoice", initialVariables: [
      { name: "request", value: { kind: VariableValueKind.String, value: "ready" } }],
  }, { ...program, operations: [] }), false);
});
