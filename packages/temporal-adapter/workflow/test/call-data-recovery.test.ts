import assert from "node:assert/strict";
import test from "node:test";
import { CommandOutcome, ControlStateKind, StimulusKind, applyStimulusWithTrace, initialState } from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import { TemporalHostCapabilityResultKind, assessTemporalHostCapability, projectUserTaskDetail,
  requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";
import { scalar, supplierProgram as program, supplierStart } from "../../testkit/test/call-data-test-support.ts";

function commit(state: RuntimeState, command: Stimulus): RuntimeState {
  const result = applyStimulusWithTrace(program, state, command);
  assert.equal(result.result.outcome, CommandOutcome.Committed);
  return result.result.state;
}

for (const value of ["supplier-summary", null]) {
  test(`Call continuation retains isolated ${value === null ? "null" : "string"} interfaces until exact return`, () => {
    const start = supplierStart(`supplier-${value === null ? "null" : "string"}`, value);
    const opening = commit(initialState, start);
    const restored = requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(opening)), program, start.instanceId);
    assert.deepEqual(restored, opening);
    const task = restored.userTaskWaits[0]!;
    assert.notEqual(task.id.processInstanceId, start.instanceId);
    assert.deepEqual(restored.variables.process.bindings, start.initialVariables);
    assert.deepEqual(restored.variables.processInterfaces, [{ owner: task.owner,
      inputs: [scalar("Input_ProcessSummary", value)], outputs: [] }]);
    const detail = projectUserTaskDetail(restored, { taskId: task.id,
      inputVariableNames: ["Property_InternalNote", "Property_SupplierSummary"] });
    assert.deepEqual(detail?.inputVariables, []);
    assert.deepEqual(detail?.task.inputs, [scalar("Input_TaskSummary", value)]);
    const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "assess", taskId: task.id,
      submittedValues: [scalar("Output_TaskDecision", value)] } as const;
    for (const malformed of [[], [scalar("Output_ProcessDecision", value)]]) {
      const refused = applyStimulusWithTrace(program, restored, { ...command, submittedValues: malformed });
      assert.equal(refused.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(refused.result.state, restored);
      assert.deepEqual(refused.committedTransitions, []);
      assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
    }
    const expected = applyStimulusWithTrace(program, opening, command);
    const actual = applyStimulusWithTrace(program, restored, command);
    assert.deepEqual(actual, expected);
    assert.equal(actual.result.outcome, CommandOutcome.Committed);
    const returned = requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(actual.result.state)), program, start.instanceId);
    assert.deepEqual(returned.variables.processInterfaces, []);
    assert.deepEqual(returned.calledProcessOccurrences, []);
    assert.deepEqual(returned.variables.process.bindings.find(binding => binding.name === "Property_DueDiligenceDecision"),
      scalar("Property_DueDiligenceDecision", value));
    const stale = applyStimulusWithTrace(program, returned, { ...command, commandId: "stale-assess" });
    assert.equal(stale.result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.result.state, returned);
    const final = commit(returned, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "final-review",
      taskId: returned.userTaskWaits[0]!.id, submittedValues: [scalar("Output_FinalReviewReceipt", "onboarded")] });
    assert.equal(final.control.kind, ControlStateKind.Completed);
    assert.deepEqual(final.variables.process.bindings.find(binding => binding.name === "Property_OnboardingReceipt"),
      scalar("Property_OnboardingReceipt", "onboarded"));
  });
}

test("Call continuation rejects lost, aliased and prematurely completed interfaces", async t => {
  const start = supplierStart("supplier-corruption", "summary");
  const state = commit(initialState, start);
  const frame = state.variables.processInterfaces[0]!;
  const corruptions: [string, unknown][] = [
    ["lost interface", { ...state.variables, processInterfaces: [] }],
    ["duplicate interface", { ...state.variables, processInterfaces: [frame, frame] }],
    ["caller-owned interface", { ...state.variables, processInterfaces: [{ ...frame,
      owner: { ...frame.owner, processInstanceId: start.instanceId } }] }],
    ["wrong input port", { ...state.variables, processInterfaces: [{ ...frame, inputs: [scalar("Input_CallSummary", "summary")] }] }],
    ["premature output", { ...state.variables, processInterfaces: [{ ...frame, outputs: [scalar("Output_ProcessDecision", "early")] }] }],
    ["flattened caller data", { ...state.variables, process: { bindings: [...state.variables.process.bindings, ...frame.inputs] }, processInterfaces: [] }],
  ];
  for (const [name, variables] of corruptions) {
    await t.test(name, () => assert.throws(() => requireBpmnWorkflowContinuationStateV1({ ...state, variables }, program, start.instanceId)));
  }
});

test("Call restoration preserves the registered hosting capability", () => {
  assert.deepEqual(assessTemporalHostCapability(program), { kind: TemporalHostCapabilityResultKind.Admitted });
});
