import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind,
  applyStimulus, initialState, isWellFormedSemanticProcessProgram, observeStableState,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState, SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding,
} from "@bpmn-lean/semantic-core";
import { compositionProcessId, routedHandoff, serialHandoff } from "./structured-process-composition-fixture.ts";

const instanceId = "Invoice_1";
const binding = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value },
});
const start = (initialVariables: readonly VariableBinding[]): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: compositionProcessId,
  instanceId, initialVariables,
});
const complete = (elementId: string, submittedValues: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues,
});
function committed(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.equal(result.ambiguousInternalChoice, false);
  return result.state;
}

test("structured admission accepts serial data handoff without widening the predecessor profile", () => {
  assert.equal(isWellFormedSemanticProcessProgram(serialHandoff), true);
  assert.equal(supportsSemanticProcessExecution(start([binding("Invoice", "invoice-4711")]), { ...serialHandoff,
    identity: { ...serialHandoff.identity, semanticProfile: SemanticProfileId.ActivityDataInputOutputUserTask },
  }), false);
});

test("serial handoff requires only the input not produced by a preceding task", () => {
  assert.equal(supportsSemanticProcessExecution(start([binding("Invoice", "invoice-4711")]), serialHandoff), true);
  for (const missing of [[], [binding("Decision", "approved")]]) {
    assert.equal(supportsSemanticProcessExecution(start(missing), serialHandoff), false);
    const rejected = applyStimulus(serialHandoff, initialState, start(missing));
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, initialState);
  }
});

for (const decision of ["approved", null]) {
  test(`serial completion copies ${decision === null ? "explicit null" : "the routed output"} into the next occurrence`, () => {
    let state = committed(serialHandoff, initialState, start([binding("Invoice", "invoice-4711")]));
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Assess"]);
    assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("Assess_Input", "invoice-4711")]]);
    const firstOwner = state.variables.activities[0]?.owner;
    const firstCompletion = complete("Assess", [binding("Assess_Output", decision)]);
    state = committed(serialHandoff, state, firstCompletion);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Archive"]);
    assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("Archive_Input", decision)]]);
    assert.notDeepEqual(state.variables.activities[0]?.owner, firstOwner);
    assert.deepEqual(state.variables.process.bindings, [binding("Decision", decision), binding("Invoice", "invoice-4711")]);
    for (const wrong of [firstCompletion, complete("Archive", [binding("Receipt", "saved")])]) {
      const rejected = applyStimulus(serialHandoff, state, wrong);
      assert.equal(rejected.outcome, CommandOutcome.Rejected);
      assert.deepEqual(rejected.state, state);
    }
    state = committed(serialHandoff, state, complete("Archive", [binding("Archive_Output", "saved")]));
    assert.deepEqual(state.variables.activities, []);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Notify"]);
    const arbitraryWrite = applyStimulus(serialHandoff, state, complete("Notify", [binding("Decision", "changed")]));
    assert.equal(arbitraryWrite.outcome, CommandOutcome.Rejected);
    assert.deepEqual(arbitraryWrite.state, state);
    state = committed(serialHandoff, state, complete("Notify", []));
    assert.equal(observeStableState(serialHandoff, state)?.status, ProcessStatus.Completed);
    assert.deepEqual(state.variables.process.bindings, [binding("Decision", decision), binding("Invoice", "invoice-4711"), binding("Receipt", "saved")]);
  });
}

for (const [decision, selected] of [["approved", "Approve"], ["rejected", "Reject"], [null, "Manual"]] as const) {
  test(`associated output selects only ${selected} and the merge resumes archive`, () => {
    const program = routedHandoff();
    assert.equal(supportsSemanticProcessExecution(start([binding("Invoice", "invoice")]), program), true);
    let state = committed(program, initialState, start([binding("Invoice", "invoice")]));
    state = committed(program, state, complete("Assess", [binding("Assess_Output", decision)]));
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), [selected]);
    assert.deepEqual(state.variables.activities, []);
    state = committed(program, state, complete(selected, []));
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Archive"]);
    assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("Archive_Input", decision)]]);
    state = committed(program, state, complete("Archive", [binding("Archive_Output", "saved")]));
    assert.equal(observeStableState(program, state)?.status, ProcessStatus.Completed);
  });
}

test("one writing branch cannot satisfy a post-merge input for the non-writing branches", () => {
  const program = routedHandoff([true, false, false]);
  const invoiceOnly = start([binding("Invoice", "invoice")]);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(invoiceOnly, program), false);
  const refused = applyStimulus(program, initialState, invoiceOnly);
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, initialState);
  let state = committed(program, initialState, start([binding("Decision", null), binding("Invoice", "invoice")]));
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Manual"]);
  state = committed(program, state, complete("Manual", []));
  assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("Archive_Input", null)]]);
});

test("every branch writing a Property removes its initial-input obligation", () => {
  const program = routedHandoff([true, true, true]);
  assert.equal(supportsSemanticProcessExecution(start([binding("Invoice", "invoice")]), program), true);
  let state = committed(program, initialState, start([binding("Invoice", "invoice")]));
  state = committed(program, state, complete("Manual", [binding("Manual_Output", "manual-decision")]));
  assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("Archive_Input", "manual-decision")]]);
});
