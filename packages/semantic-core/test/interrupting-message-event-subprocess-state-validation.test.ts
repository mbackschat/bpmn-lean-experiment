import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome, StimulusKind, VariableValueKind, applyStimulus, applyStimulusWithTrace, initialState,
  interruptingMessageEventSubProcessStateIsValid,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import { channel, handlerScopeId, program } from "./interrupting-message-event-subprocess-fixture.ts";
import { serialHandoff } from "./structured-process-composition-fixture.ts";
import { boundedTaskProgram, boundedTaskStart } from "./flow-node-occurrence-lifecycle-fixture.ts";
const { isGateAdmissibleRuntimeState, isWellFormedRuntimeState } = await import(
  new URL("../dist/runtime-state-well-formedness.js", import.meta.url).href
) as typeof import("../src/runtime-state-well-formedness.ts");

const instanceId = "application-invalid-state";
const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "MessageStart", activation: 1 }, channel } as const;
function phases() {
  const ordinary = applyStimulus(program, initialState, start);
  assert.equal(ordinary.outcome, CommandOutcome.Committed);
  const handler = applyStimulus(program, ordinary.state, delivery);
  assert.equal(handler.outcome, CommandOutcome.Committed);
  return { ordinary: ordinary.state, handler: handler.state };
}

test("foreign-profile declarations fail runtime admission before ordinary start", () => {
  const compositionStart = { ...start, processId: serialHandoff.processId,
    initialVariables: [{ name: "Invoice", value: { kind: VariableValueKind.Null } }] } as const;
  for (const [ordinary, ordinaryStart] of [[serialHandoff, compositionStart], [boundedTaskProgram, boundedTaskStart]] as const) {
    assert.equal(interruptingMessageEventSubProcessStateIsValid(ordinary, initialState), true);
    assert.equal(applyStimulus(ordinary, initialState, ordinaryStart).outcome, CommandOutcome.Committed);
    const malformed = { ...ordinary, interruptingMessageEventSubProcesses: [{
      ...program.interruptingMessageEventSubProcesses![0]!, parentScopeId: ordinary.definitionScopes[0]!.id,
    }] };
    assert.equal(interruptingMessageEventSubProcessStateIsValid(malformed, initialState), false);
    const result = applyStimulusWithTrace(malformed, initialState, ordinaryStart);
    assert.equal(result.result.outcome, CommandOutcome.Rejected);
    assert.equal(result.result.state, initialState);
    assert.deepEqual(result.committedTransitions, []);
    assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
  }
});

test("foreign listeners refuse ordinary and data-task completions without changing their valid predecessors", () => {
  const started = applyStimulus(serialHandoff, initialState, { ...start, processId: serialHandoff.processId,
    initialVariables: [{ name: "Invoice", value: { kind: VariableValueKind.Null } }] });
  assert.equal(started.outcome, CommandOutcome.Committed);
  let state = started.state;
  for (const elementId of ["Assess", "Archive", "Notify"]) {
    const wait = state.userTaskWaits[0]!;
    assert.equal(wait.id.elementId, elementId);
    const completion: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
      taskId: wait.id,
      submittedValues: elementId === "Notify" ? [] : [{ name: `${elementId}_Output`, value: { kind: VariableValueKind.Null } }],
    };
    const contaminated = { ...state, eventSubProcessMessageSubscriptions: [{
      id: { processInstanceId: wait.id.processInstanceId, elementId: "unselected-message", activation: 1 },
      owner: wait.owner, channel,
    }] };
    assert.equal(interruptingMessageEventSubProcessStateIsValid(serialHandoff, contaminated), false);
    const refused = applyStimulusWithTrace(serialHandoff, contaminated, completion);
    assert.equal(refused.result.outcome, CommandOutcome.Rejected);
    assert.equal(refused.result.state, contaminated);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
    const accepted = applyStimulus(serialHandoff, state, completion);
    assert.equal(accepted.outcome, CommandOutcome.Committed);
    state = accepted.state;
  }
});

test("aggregate runtime validators enforce the declaration-owned listener as well as command dispatch", () => {
  const { ordinary, handler } = phases();
  const subscription = ordinary.eventSubProcessMessageSubscriptions![0]!;
  const { eventSubProcessMessageSubscriptions: _, ...missing } = ordinary;
  const cases: readonly [string, RuntimeState][] = [
    ["absent collection", missing],
    ["premature expiry", { ...ordinary, eventSubProcessMessageSubscriptions: [] }],
    ["duplicate subscription", { ...ordinary, eventSubProcessMessageSubscriptions: [subscription, subscription] }],
    ["undeclared Start", { ...ordinary, eventSubProcessMessageSubscriptions: [{ ...subscription, id: { ...subscription.id, elementId: "foreign" } }] }],
    ["wrong channel", { ...ordinary, eventSubProcessMessageSubscriptions: [{ ...subscription, channel: { ...channel, messageId: "foreign" } }] }],
    ["child-owned dormant listener", { ...ordinary, eventSubProcessMessageSubscriptions: [{ ...subscription, owner: { ...subscription.owner, definitionScopeId: handlerScopeId } }] }],
    ["wrong activation", { ...ordinary, eventSubProcessMessageSubscriptions: [{ ...subscription, id: { ...subscription.id, activation: 2 } }] }],
    ["missing issuance counter", { ...ordinary, messageActivations: [] }],
    ["duplicate issuance counter", { ...ordinary, messageActivations: [...ordinary.messageActivations, ...ordinary.messageActivations] }],
    ["simultaneous listener and handler", { ...handler, eventSubProcessMessageSubscriptions: [subscription] }],
    ["ordinary work survives interruption", { ...handler, userTaskWaits: [...handler.userTaskWaits, ...ordinary.userTaskWaits] }],
    ["orphan handler", { ...handler, scopeOccurrences: handler.scopeOccurrences.filter(({ parent }) => parent !== null) }],
    ["duplicate handler", { ...handler, scopeOccurrences: [...handler.scopeOccurrences, handler.scopeOccurrences.find(({ parent }) => parent !== null)!] }],
    ["Message identity aliases an ordinary wait", { ...ordinary, messageWaits: [{ ...subscription, output: "p:handler" }] }],
  ];
  for (const [name, state] of cases) {
    assert.equal(interruptingMessageEventSubProcessStateIsValid(program, state), false, name);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), false, name);
    assert.equal(isGateAdmissibleRuntimeState(program, instanceId, state), false, name);
    const result = applyStimulusWithTrace(program, state, delivery);
    assert.equal(result.result.outcome, CommandOutcome.Rejected, name);
    assert.equal(result.result.state, state, name);
    assert.deepEqual(result.committedTransitions, [], name);
    assert.deepEqual(result.flowNodeOccurrenceLifecycles, [], name);
  }
});

test("every non-pristine start is rejected before listener registration", () => {
  for (const state of [
    { ...initialState, eventSubProcessMessageSubscriptions: [] },
    { ...initialState, logicalTimeMs: 1 },
    { ...initialState, endOccurrences: 1 },
    { ...initialState, messageActivations: [{ elementId: "MessageStart", count: 1 }] },
  ]) {
    assert.equal(isWellFormedRuntimeState(program, "", state), false);
    assert.equal(isGateAdmissibleRuntimeState(program, "", state), false);
    const result = applyStimulusWithTrace(program, state, start);
    assert.equal(result.result.outcome, CommandOutcome.Rejected);
    assert.equal(result.result.state, state);
    assert.deepEqual(result.committedTransitions, []);
  }
});
