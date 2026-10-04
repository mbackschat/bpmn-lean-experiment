import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import { StimulusKind, VariableValueKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { compile, source } from "../../../bpmn-source/test/mixed-task-control-flow-fixture.ts";

test("mixed-task semantics cannot bypass the pending hosting qualification", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected serial business fixture");
  const program = compiled.semanticProcess;
  assert.equal(supportsSemanticProcessExecution({
    kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "invoice",
    initialVariables: ["request"].map(name => ({ name, value: { kind: VariableValueKind.String, value: "ready" } })),
  }, program), true);
  const result = assessTemporalHostCapability(program);
  assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
  if (result.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("Unqualified business handlers reached hosting");
  assert.equal(result.failure.code, "mixedTaskControlFlowQualificationUnavailable");
});
