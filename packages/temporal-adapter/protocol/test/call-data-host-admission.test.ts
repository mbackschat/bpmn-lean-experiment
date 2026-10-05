import assert from "node:assert/strict";
import test from "node:test";
import { supportsSemanticProcessExecution, VariableValueKind } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { callActivityProgram, callActivityStart } from "../../../semantic-core/test/call-activity-fixture.ts";
import { program } from "../../../semantic-core/test/call-data-fixture.ts";

for (const value of [{ kind: VariableValueKind.String, value: "supplier" }, { kind: VariableValueKind.Null }] as const) {
  test(`registered scalar Call execution with ${value.kind} is admitted for hosting`, () => {
    assert.equal(supportsSemanticProcessExecution(callActivityStart([{ name: "Request", value }]), program), true);
    const result = assessTemporalHostCapability(program);
    assert.deepEqual(result, { kind: TemporalHostCapabilityResultKind.Admitted });
  });
}

test("Call execution still rejects missing operations and preserves empty-data hosting", () => {
  assert.equal(supportsSemanticProcessExecution(callActivityStart([{ name: "Request",
    value: { kind: VariableValueKind.String, value: "supplier" } }]), { ...program, operations: [] }), false);
  assert.deepEqual(assessTemporalHostCapability(callActivityProgram), { kind: TemporalHostCapabilityResultKind.Admitted });
});
