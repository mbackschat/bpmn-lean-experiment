import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome, ControlStateKind, InternalSchedulingMode, StimulusKind,
  applyInternalOperationStep, applyStimulusWithScheduleAndTrace, evaluateScheduledStimulusWithSelectedSteps,
  initialState, interruptingMessageEventSubProcessStateIsValid, observeStableState,
} from "@bpmn-lean/semantic-core";
import type { AppliedInternalOperationStep, RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { channel, program } from "./interrupting-message-event-subprocess-fixture.ts";

const { isGateAdmissibleRuntimeState } = await import(new URL("../dist/runtime-state-well-formedness.js", import.meta.url).href) as typeof import("../src/runtime-state-well-formedness.ts");
const instanceId = "application-scheduling";
const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "MessageStart", activation: 1 }, channel } as const;
const complete = (elementId: string) => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `complete-${elementId}`, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const);

function valid(selected: SemanticProcessProgram, state: RuntimeState): void {
  assert.equal(interruptingMessageEventSubProcessStateIsValid(selected, state), true);
  assert.equal(isGateAdmissibleRuntimeState(selected, state.control.kind === ControlStateKind.NotStarted ? "" : instanceId, state), true);
}

function command(selected: SemanticProcessProgram, before: RuntimeState, stimulus: Stimulus, expectedSteps: readonly string[]): RuntimeState {
  const fuel = expectedSteps.length;
  const evaluation = evaluateScheduledStimulusWithSelectedSteps(selected, before, stimulus, [], fuel);
  assert.equal(evaluation.result.outcome, CommandOutcome.Committed);
  assert.equal(evaluation.result.scheduleFailure, null);
  assert.deepEqual(evaluation.selectedInternalSteps.map(({ operation }) => operation.id), expectedSteps);
  assert.ok(evaluation.admittedState);
  for (const prefix of [before, evaluation.admittedState, ...evaluation.selectedInternalSteps.map(({ successor }) => successor)]) valid(selected, prefix);
  const trace = applyStimulusWithScheduleAndTrace(selected, before, stimulus, [], fuel);
  assert.ok(trace.currentPositions);
  assert.equal(trace.committedTransitions.length, fuel + 1);
  assert.equal(trace.flowNodeOccurrenceLifecycles.length, fuel + 1);
  const insufficient = applyStimulusWithScheduleAndTrace(selected, before, stimulus, [], fuel - 1);
  assert.equal(insufficient.result.outcome, CommandOutcome.RolledBack);
  assert.equal(insufficient.result.internalStepBoundExceeded, true);
  assert.equal(insufficient.result.state, before);
  assert.deepEqual(insufficient.committedTransitions, []);
  assert.deepEqual(insufficient.flowNodeOccurrenceLifecycles, []);
  assert.equal(insufficient.currentPositions, null);
  return trace.result.state;
}

for (const mode of [InternalSchedulingMode.RejectObservableChoice, InternalSchedulingMode.RequireChoiceSchedule]) {
  const selected = { ...program, internalSchedulingMode: mode };
  for (const first of [null, "A", "B"] as const) {
    test(`${mode}: withdrawal after ${first ?? "neither task"} preserves validity at every internal prefix and exact fuel`, () => {
      let state = command(selected, initialState, start, ["op:start", "op:fork", "op:a", "op:b"]);
      if (first !== null) state = command(selected, state, complete(first), [first === "A" ? "op:end-a" : "op:end-b"]);
      state = command(selected, state, delivery, ["op:handler"]);
      state = command(selected, state, complete("WithdrawalTask"), ["op:handler-end", "op:handler-done", "op:done"]);
      assert.equal(state.control.kind, ControlStateKind.Completed);
    });
  }
  for (const order of [["A", "B"], ["B", "A"]] as const) {
    test(`${mode}: ordinary ${order.join(" then ")} completion wins the final Message race without a handler lifecycle`, () => {
      let state = command(selected, initialState, start, ["op:start", "op:fork", "op:a", "op:b"]);
      state = command(selected, state, complete(order[0]), [order[0] === "A" ? "op:end-a" : "op:end-b"]);
      const terminal = applyStimulusWithScheduleAndTrace(selected, state, complete(order[1]), [], 2);
      state = command(selected, state, complete(order[1]), [order[1] === "A" ? "op:end-a" : "op:end-b", "op:done"]);
      assert.equal(state.control.kind, ControlStateKind.Completed);
      assert.equal(terminal.flowNodeOccurrenceLifecycles.flatMap(({ started }) => started).some(({ elementId }) =>
        ["Withdrawal", "MessageStart", "WithdrawalTask"].includes(elementId)), false);
      const stale = applyStimulusWithScheduleAndTrace(selected, state, delivery, []);
      assert.equal(stale.result.outcome, CommandOutcome.Rejected);
      assert.equal(stale.result.state, state);
      assert.deepEqual(stale.committedTransitions, []);
      assert.deepEqual(stale.flowNodeOccurrenceLifecycles, []);
    });
  }
}

test("the complete initial two-offer frontier permits both arm orders with identical state and canonical E1/E2 publication", () => {
  const evaluation = evaluateScheduledStimulusWithSelectedSteps(program, initialState, start, [], 4);
  const forked = evaluation.selectedInternalSteps[1]?.successor;
  assert.ok(forked);
  const enabled = (state: RuntimeState) => program.operations.map((operation) => applyInternalOperationStep(program, operation, state))
    .filter((step): step is AppliedInternalOperationStep => step !== null);
  assert.deepEqual(enabled(forked).map(({ operation }) => operation.id).sort(), ["op:a", "op:b"]);
  for (const order of [["op:a", "op:b"], ["op:b", "op:a"]]) {
    let state: RuntimeState = forked;
    for (const id of order) {
      const step = enabled(state).find(({ operation }) => operation.id === id);
      assert.ok(step);
      state = step.successor;
      valid(program, state);
    }
    assert.deepEqual(enabled(state), []);
    assert.deepEqual(state, evaluation.result.state);
    assert.deepEqual(observeStableState(program, state), observeStableState(program, evaluation.result.state));
  }
  assert.deepEqual(
    applyStimulusWithScheduleAndTrace({ ...program, operations: [...program.operations].reverse() }, initialState, start, [], 4),
    applyStimulusWithScheduleAndTrace(program, initialState, start, [], 4),
  );
});
