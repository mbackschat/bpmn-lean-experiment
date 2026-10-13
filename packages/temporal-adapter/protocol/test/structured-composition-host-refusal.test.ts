import assert from "node:assert/strict";
import test from "node:test";
import { StimulusKind, VariableValueKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { compositionProcessId, routedHandoff, serialHandoff } from "../../../semantic-core/test/structured-process-composition-fixture.ts";

for (const [name, program] of [["serial", serialHandoff], ["decision", routedHandoff()]] as const) {
  test(`the registered ${name} composition admits passive task hosting and rejects malformed definitions`, () => {
    const start = {
      kind: StimulusKind.StartProcess, commandId: "start", processId: compositionProcessId, instanceId: "Invoice_1",
      initialVariables: [{ name: "Invoice", value: { kind: VariableValueKind.String, value: "invoice" } }],
    } as const;
    assert.equal(supportsSemanticProcessExecution(start, program), true);
    assert.deepEqual(assessTemporalHostCapability(program), { kind: TemporalHostCapabilityResultKind.Admitted });
    for (const malformed of [
      { ...program, operations: [] },
      { ...program, controlPlaces: [] },
      { ...program, identity: { ...program.identity, semanticProfile: "bpmn-2.0.2-activity-data-input-output-user-task-draft" } },
    ]) {
      assert.equal(supportsSemanticProcessExecution(start, malformed), false);
    }
    assert.equal(supportsSemanticProcessExecution({ ...start, initialVariables: [] }, program), false);
  });
}
