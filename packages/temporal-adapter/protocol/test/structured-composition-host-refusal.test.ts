import assert from "node:assert/strict";
import test from "node:test";
import { StimulusKind, VariableValueKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { compositionProcessId, routedHandoff, serialHandoff } from "../../../semantic-core/test/structured-process-composition-fixture.ts";

for (const [name, program] of [["serial", serialHandoff], ["decision", routedHandoff()]] as const) {
  test(`the private ${name} composition remains refused despite passive waits`, () => {
    assert.equal(supportsSemanticProcessExecution({
      kind: StimulusKind.StartProcess, commandId: "start", processId: compositionProcessId, instanceId: "Invoice_1",
      initialVariables: [{ name: "Invoice", value: { kind: VariableValueKind.String, value: "invoice" } }],
    }, program), true);
    const result = assessTemporalHostCapability(program);
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
    if (result.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("private profile reached hosting");
    assert.equal(result.failure.code, "structuredCompositionQualificationUnavailable");
  });
}
