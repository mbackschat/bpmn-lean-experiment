import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandOutcome, ControlStateKind, StimulusKind, WaitKind, applyStimulus, initialState, observeStableState } from "@bpmn-lean/semantic-core";
import type { CompleteUserTaskInstanceStimulus, RuntimeState } from "@bpmn-lean/semantic-core";
import { channel, handlerScopeId, program, rootScopeId } from "./interrupting-message-event-subprocess-fixture.ts";

const instanceId = "application-1";
const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
const root = { processInstanceId: instanceId, definitionScopeId: rootScopeId, activation: 1 };
const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "MessageStart", activation: 1 }, channel } as const;
const complete = (elementId: string): CompleteUserTaskInstanceStimulus => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `complete-${elementId}`, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] });

function started(): RuntimeState {
  const result = applyStimulus(program, initialState, start);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

test("Process start arms one parent listener while only the two ordinary tasks execute", () => {
  const state = started();
  assert.deepEqual(state.eventSubProcessMessageSubscriptions, [{ id: delivery.subscriptionId, owner: root, channel }]);
  assert.deepEqual(state.scopeOccurrences, [{ id: root, parent: null }]);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId).sort(), ["A", "B"]);
});

test("E1 publishes the dormant listener as a delivery interaction without an executing Message wait", () => {
  const state = started();
  const observation = observeStableState(program, state);
  assert.ok(observation);
  assert.deepEqual(observation.openMessageSubscriptions, [{ id: delivery.subscriptionId, channel }]);
  assert.deepEqual(observation.enabledInteractions, [
    { kind: StimulusKind.CompleteUserTaskInstance, taskId: complete("A").taskId },
    { kind: StimulusKind.CompleteUserTaskInstance, taskId: complete("B").taskId },
    { kind: StimulusKind.DeliverMessage, subscriptionId: delivery.subscriptionId, channel },
  ]);
  assert.deepEqual(observation.activeWaits, [
    { elementId: "A", kind: WaitKind.UserTask, multiplicity: 1 },
    { elementId: "B", kind: WaitKind.UserTask, multiplicity: 1 },
  ]);
});

test("E1 refuses missing, duplicate and wrongly owned dormant subscription storage", () => {
  const state = started();
  const subscription = state.eventSubProcessMessageSubscriptions![0]!;
  const { eventSubProcessMessageSubscriptions: _, ...missing } = state;
  for (const invalid of [missing,
    { ...state, eventSubProcessMessageSubscriptions: [] },
    { ...state, eventSubProcessMessageSubscriptions: [subscription, subscription] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, owner: { ...root, definitionScopeId: handlerScopeId } }] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, id: { ...subscription.id, activation: 2 } }] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, channel: { ...channel, messageId: "other" } }] },
  ]) assert.equal(observeStableState(program, invalid), null);
});

for (const first of [null, "A", "B"] as const) {
  test(`withdrawal interrupts all remaining ordinary work after ${first ?? "no completed task"}`, () => {
    let before = started();
    if (first !== null) {
      const done = applyStimulus(program, before, complete(first));
      assert.equal(done.outcome, CommandOutcome.Committed);
      before = done.state;
    }
    const result = applyStimulus(program, before, delivery);
    assert.equal(result.outcome, CommandOutcome.Committed);
    const state = result.state;
    const observation = observeStableState(program, state);
    assert.ok(observation);
    assert.deepEqual(observation.openMessageSubscriptions, []);
    assert.deepEqual(observation.enabledInteractions, [
      { kind: StimulusKind.CompleteUserTaskInstance, taskId: complete("WithdrawalTask").taskId },
    ]);
    assert.deepEqual(state.eventSubProcessMessageSubscriptions, []);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["WithdrawalTask"]);
    assert.equal(state.endOccurrences, before.endOccurrences);
    assert.deepEqual(state.controlTokens, []);
    assert.deepEqual(state.scopeOccurrences, [
      { id: root, parent: null },
      { id: { ...root, definitionScopeId: handlerScopeId }, parent: root },
    ]);
    for (const stimulus of [delivery, complete("A"), complete("B")]) {
      const refused = applyStimulus(program, state, stimulus);
      assert.equal(refused.outcome, CommandOutcome.Rejected);
      assert.deepEqual(refused.state, state);
    }
    const terminal = applyStimulus(program, state, complete("WithdrawalTask"));
    assert.equal(terminal.outcome, CommandOutcome.Committed);
    assert.equal(terminal.state.control.kind, ControlStateKind.Completed);
    assert.deepEqual(terminal.state.scopeOccurrences, []);
    assert.deepEqual(terminal.state.controlTokens, []);
    assert.deepEqual(terminal.state.eventSubProcessMessageSubscriptions, []);
    assert.deepEqual(observeStableState(program, terminal.state)?.enabledInteractions, []);
  });
}

for (const order of [["A", "B"], ["B", "A"]] as const) {
  test(`ordinary completion ${order.join(" then ")} expires the listener without creating a handler`, () => {
    let state = started();
    for (const elementId of order) {
      const result = applyStimulus(program, state, complete(elementId));
      assert.equal(result.outcome, CommandOutcome.Committed);
      state = result.state;
    }
    assert.equal(state.control.kind, ControlStateKind.Completed);
    assert.deepEqual(state.eventSubProcessMessageSubscriptions, []);
    assert.deepEqual(observeStableState(program, state)?.openMessageSubscriptions, []);
    assert.deepEqual(observeStableState(program, state)?.enabledInteractions, []);
    assert.equal(state.scopeActivations.some(({ elementId }) => elementId === handlerScopeId), false);
    const stale = applyStimulus(program, state, delivery);
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, state);
  });
}
