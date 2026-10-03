import assert from "node:assert/strict";
import { test } from "node:test";
import { applyInternalOperation, CommandOutcome, initialState, SemanticOperationKind, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { callActivityStart, instanceId } from "./call-activity-fixture.ts";
import { data, program } from "./call-data-fixture.ts";

const { admit } = await import(new URL("../dist/semantic-command-admission.js", import.meta.url).href) as typeof import("../src/semantic-command-admission.ts");
const scalar = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const start = (bindings: readonly VariableBinding[]) => admit(program, initialState, callActivityStart(bindings));
const request = (value: VariableValue): VariableBinding => ({ name: "Request", value });
const initial = [request(scalar("supplier")), { name: "Result", value: scalar("previous") }, { name: "Unused", value: scalar("untouched") }];

function apply(state: RuntimeState, kind: SemanticOperationKind, elementId?: string): RuntimeState {
  const operation = program.operations.find((operation) => operation.kind === kind && (elementId === undefined || operation.origin.elementId === elementId));
  assert.ok(operation !== undefined);
  const next = applyInternalOperation(program, operation, state);
  assert.ok(next !== null, `missing raw ${kind}`);
  return next;
}
function calledWait(): RuntimeState {
  const started = start(initial);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const initiated = apply(started.state, SemanticOperationKind.Initiate);
  const invoked = apply(initiated, SemanticOperationKind.InvokeProcess);
  return apply(invoked, SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Called");
}
function completion(state: RuntimeState, submittedValues: readonly VariableBinding[], taskId = state.userTaskWaits[0]!.id) {
  const preserved = structuredClone(state);
  const result = admit(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete", taskId, submittedValues });
  assert.deepEqual(state, preserved);
  return result;
}

for (const value of [scalar("supplier"), { kind: VariableValueKind.Null }] as const) {
  test(`Call start requires and preserves its declared ${value.kind} request`, () => {
    const bindings = [request(value), ...initial.slice(1)];
    const accepted = start(bindings);
    assert.equal(accepted.outcome, CommandOutcome.Committed);
    assert.deepEqual(accepted.state.variables.process.bindings, bindings);
    assert.deepEqual(accepted.state.variables.processInterfaces, []);
  });
  test(`called completion fills only its Process output with ${value.kind}`, () => {
    const before = calledWait();
    const after = completion(before, [{ name: "Task_Called_output", value }]);
    assert.equal(after.outcome, CommandOutcome.Committed);
    assert.deepEqual(after.state.variables.process, before.variables.process);
    assert.deepEqual(after.state.variables.processInterfaces[0]?.outputs, [{ name: data.called.output.id, value }]);
    assert.equal(after.state.calledProcessOccurrences.length, 1);
    assert.deepEqual(after.state.userTaskWaits, []);
    assert.deepEqual(after.state.variables.activities, []);
  });
}

test("Call start refuses missing, undeclared, duplicate, unordered and non-scalar bindings", () => {
  for (const bindings of [[], initial.slice(1), [...initial, { name: "Unknown", value: scalar("injected") }],
    [initial[0]!, initial[0]!], [...initial].reverse(),
    [request({ kind: VariableValueKind.Boolean, value: true })],
    [request({ kind: VariableValueKind.Integer, value: 1 })],
    [request({ kind: VariableValueKind.StringList, value: ["supplier"] })],
  ]) assert.deepEqual(start(bindings), { outcome: CommandOutcome.Rejected, state: initialState });
});

test("removing or renaming an unused Property declaration changes start admission", () => {
  for (const callerProperties of [["Receipt", "Request", "Result"], ["Other", "Receipt", "Request", "Result"]]) {
    const changed = { ...program, operations: program.operations.map((operation): SemanticOperation =>
      operation.kind === SemanticOperationKind.InvokeProcess || operation.kind === SemanticOperationKind.ReturnProcess
        ? { ...operation, data: { ...data, callerProperties } } : operation) };
    assert.deepEqual(admit(changed, initialState, callActivityStart(initial)), { outcome: CommandOutcome.Rejected, state: initialState });
  }
});

test("called completion rejects the wrong field, value, cardinality and occurrence without mutation", () => {
  const before = calledWait();
  for (const values of [[], [{ name: data.called.output.id, value: scalar("wrong owner") }],
    [{ name: "Task_Called_output", value: { kind: VariableValueKind.Boolean, value: true } }],
    [{ name: "Task_Called_output", value: scalar("first") }, { name: "Task_Called_output", value: scalar("second") }],
  ] as const) assert.deepEqual(completion(before, values), { outcome: CommandOutcome.Rejected, state: before });
  for (const id of [{ ...before.userTaskWaits[0]!.id, processInstanceId: instanceId },
    { ...before.userTaskWaits[0]!.id, activation: 2 },
    { ...before.userTaskWaits[0]!.id, elementId: "Task_Caller" }]) {
    assert.deepEqual(completion(before, [{ name: "Task_Called_output", value: scalar("approved") }], id),
      { outcome: CommandOutcome.Rejected, state: before });
  }
  const completed = completion(before, [{ name: "Task_Called_output", value: scalar("approved") }]);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completion(completed.state, [{ name: "Task_Called_output", value: scalar("duplicate") }], before.userTaskWaits[0]!.id),
    { outcome: CommandOutcome.Rejected, state: completed.state });
});

for (const value of [scalar("approved"), { kind: VariableValueKind.Null }] as const) {
  test(`raw supplier command sequence copies ${value.kind} on return and records the caller receipt`, () => {
    const called = calledWait();
    const completed = completion(called, [{ name: "Task_Called_output", value }]);
    assert.equal(completed.outcome, CommandOutcome.Committed);
    const ended = apply(completed.state, SemanticOperationKind.ReachNoneEnd, "End_Called");
    const returned = apply(ended, SemanticOperationKind.ReturnProcess);
    assert.deepEqual(returned.variables.process.bindings, [initial[0]!, { name: "Result", value }, initial[2]!]);
    assert.deepEqual(returned.variables.processInterfaces, []);
    const caller = apply(returned, SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Caller");
    assert.deepEqual(caller.variables.activities[0]?.bindings, [{ name: "Task_Caller_input", value }]);
    const receipt = completion(caller, [{ name: "Task_Caller_output", value: scalar("receipt") }]);
    assert.equal(receipt.outcome, CommandOutcome.Committed);
    assert.deepEqual(receipt.state.variables.process.bindings, [{ name: "Receipt", value: scalar("receipt") }, initial[0]!, { name: "Result", value }, initial[2]!]);
    const final = apply(apply(receipt.state, SemanticOperationKind.ReachNoneEnd, "End_Caller"), SemanticOperationKind.CompleteScope);
    assert.equal(final.control.kind, "completed");
    assert.deepEqual(final.calledProcessOccurrences, []);
    assert.deepEqual(final.variables.processInterfaces, []);
  });
}
