import assert from "node:assert/strict";
import test from "node:test";
import { supportsSemanticProcessExecution, VariableValueKind } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { callActivityProgram, callActivityStart } from "../../../semantic-core/test/call-activity-fixture.ts";
import { program } from "../../../semantic-core/test/call-data-fixture.ts";

for (const value of [{ kind: VariableValueKind.String, value: "supplier" }, { kind: VariableValueKind.Null }] as const) {
  test(`private scalar Call execution with ${value.kind} remains refused before hosting`, () => {
    assert.equal(supportsSemanticProcessExecution(callActivityStart([{ name: "Request", value }]), program), true);
    const result = assessTemporalHostCapability(program);
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
    if (result.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("private profile reached hosting");
    assert.equal(result.failure.code, "callDataQualificationUnavailable");
  });
}

test("private Call qualification cannot be bypassed by dropping the passive operations", () => {
  const result = assessTemporalHostCapability({ ...program, operations: [] });
  assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
  if (result.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("private profile reached hosting");
  assert.equal(result.failure.code, "callDataQualificationUnavailable");
  assert.deepEqual(assessTemporalHostCapability(callActivityProgram), { kind: TemporalHostCapabilityResultKind.Admitted });
});
