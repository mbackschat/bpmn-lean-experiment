import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome, FlowNodeOccurrenceTerminalKind, SemanticFlowNodeOccurrenceAnchorKind,
  StimulusKind, applyStimulusWithTrace, foldFlowNodeOccurrenceLifecycleDelta, initialState,
  projectOpenFlowNodeOccurrences, requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type { RetainedFlowNodeOccurrence, TracedCommandResult } from "@bpmn-lean/semantic-core";
import { channel, handlerScopeId, program, rootScopeId } from "./interrupting-message-event-subprocess-fixture.ts";

const instanceId = "application-publication";
const root = { processInstanceId: instanceId, definitionScopeId: rootScopeId, activation: 1 };
const child = { ...root, definitionScopeId: handlerScopeId };
const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "MessageStart", activation: 1 }, channel } as const;
const complete = (elementId: string) => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `complete-${elementId}`, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const);

function checkAndFold(retained: readonly RetainedFlowNodeOccurrence[], commandId: string, traced: TracedCommandResult): RetainedFlowNodeOccurrence[] {
  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  assert.ok(traced.currentPositions);
  assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length);
  requireCompleteFlowNodeOccurrenceLifecycles(program, retained, commandId, traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
  let open = retained.map(({ attachedHandlers: _, ...entry }) => entry);
  for (const delta of traced.flowNodeOccurrenceLifecycles) {
    const next = foldFlowNodeOccurrenceLifecycleDelta(open, delta);
    assert.ok(next);
    open = next;
  }
  assert.deepEqual(open, projectOpenFlowNodeOccurrences(program, traced.result.state));
  return open.map((entry) => ({ ...entry, attachedHandlers: [] }));
}

test("dormant registration publishes no handler scope or Message Start occurrence", () => {
  const traced = applyStimulusWithTrace(program, initialState, start);
  const retained = checkAndFold([], start.commandId, traced);
  assert.deepEqual(retained.map(({ elementId }) => elementId), ["A", "B"]);
  assert.deepEqual(traced.flowNodeOccurrenceLifecycles.flatMap(({ started }) => started.map(({ elementId }) => elementId)).sort(),
    ["A", "B", "Fork", "Start"]);
});

for (const first of [null, "A", "B"] as const) {
  test(`E2 interrupts exactly live ordinary occurrences after ${first ?? "neither task"} and completes the handler`, () => {
    const started = applyStimulusWithTrace(program, initialState, start);
    let retained = checkAndFold([], start.commandId, started);
    let state = started.result.state;
    if (first !== null) {
      const completed = applyStimulusWithTrace(program, state, complete(first));
      retained = checkAndFold(retained, complete(first).commandId, completed);
      state = completed.result.state;
    }
    const withdrawn = applyStimulusWithTrace(program, state, delivery);
    const handlerOpen = checkAndFold(retained, delivery.commandId, withdrawn);
    assert.deepEqual(handlerOpen.map(({ elementId }) => elementId), ["WithdrawalTask", "Withdrawal"]);
    const trigger = withdrawn.flowNodeOccurrenceLifecycles[0]!;
    assert.deepEqual(trigger.started, [
      { anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: child }, processId: program.processId, elementId: "Withdrawal", owner: root },
      { anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Transition, commandId: delivery.commandId, transitionIndex: 0, localIndex: 0 },
        processId: program.processId, elementId: "MessageStart", owner: child },
    ]);
    assert.deepEqual(trigger.ended.filter(({ terminal }) => terminal === FlowNodeOccurrenceTerminalKind.Cancelled),
      ["A", "B"].filter((elementId) => elementId !== first).map((elementId) => ({
        anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id: complete(elementId).taskId },
        terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
      })));
    for (const mutated of [
      { ...trigger, ended: trigger.ended.filter(({ terminal }) => terminal !== FlowNodeOccurrenceTerminalKind.Cancelled) },
      { ...trigger, started: trigger.started.filter(({ elementId }) => elementId !== "MessageStart") },
      { ...trigger, ended: trigger.ended.map((end) => ({ ...end, terminal: FlowNodeOccurrenceTerminalKind.Completed })) },
    ]) assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained, delivery.commandId,
      withdrawn.committedTransitions, [mutated, ...withdrawn.flowNodeOccurrenceLifecycles.slice(1)]));
    const terminal = applyStimulusWithTrace(program, withdrawn.result.state, complete("WithdrawalTask"));
    assert.deepEqual(checkAndFold(handlerOpen, complete("WithdrawalTask").commandId, terminal), []);
    for (const stale of [delivery, complete("A"), complete("B")]) {
      const rejected = applyStimulusWithTrace(program, withdrawn.result.state, stale);
      assert.equal(rejected.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(rejected.result.state, withdrawn.result.state);
      assert.deepEqual(rejected.committedTransitions, []);
      assert.deepEqual(rejected.flowNodeOccurrenceLifecycles, []);
    }
  });
}
