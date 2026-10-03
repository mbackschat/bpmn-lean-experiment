import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandOutcome, InternalSchedulingMode, ScenarioStepKind, SemanticTransitionKind, StimulusKind, advanceScenario, applyStimulus, applyStimulusWithTrace, initialState } from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, requireBpmnWorkflowContinuationStateV1, requireExecutionPublicationPage, TemporalHostCapabilityResultKind } from "../dist/index.js";
import { channel, program } from "../../../semantic-core/test/interrupting-message-event-subprocess-fixture.ts";
import { programOccurrenceFactIsValid, programOccurrenceStartMatchesTransition } from "../dist/flow-node-occurrence-publication-program-validation.js";

const instanceId = "application-restore";
const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "MessageStart", activation: 1 }, channel } as const;
const complete = (elementId: string) => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `complete-${elementId}`, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const);
function started(): RuntimeState {
  const result = applyStimulus(program, initialState, start);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

test("continuation preserves the exact dormant listener and consumed-listener handler phases", () => {
  const ordinary = started();
  const afterA = applyStimulus(program, ordinary, complete("A"));
  assert.equal(afterA.outcome, CommandOutcome.Committed);
  const handler = applyStimulus(program, afterA.state, delivery);
  assert.equal(handler.outcome, CommandOutcome.Committed);
  for (const state of [ordinary, afterA.state, handler.state]) {
    const wire: unknown = JSON.parse(JSON.stringify(state));
    assert.deepEqual(requireBpmnWorkflowContinuationStateV1(wire, program, instanceId), state);
  }
});

test("continuation refuses missing or contradictory listener lifetime and unknown nested storage", () => {
  const state = started();
  const subscription = state.eventSubProcessMessageSubscriptions![0]!;
  const { eventSubProcessMessageSubscriptions: _, ...missing } = state;
  const handler = applyStimulus(program, state, delivery).state;
  for (const invalid of [missing,
    { ...state, eventSubProcessMessageSubscriptions: [] },
    { ...state, eventSubProcessMessageSubscriptions: null },
    { ...state, eventSubProcessMessageSubscriptions: [subscription, subscription] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, output: "invented-flow" }] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, owner: { ...subscription.owner, activation: 2 } }] },
    { ...state, eventSubProcessMessageSubscriptions: [{ ...subscription, channel: { ...channel, messageId: "other" } }] },
    { ...handler, eventSubProcessMessageSubscriptions: [subscription] },
    { ...handler, userTaskWaits: [...handler.userTaskWaits, ...state.userTaskWaits] },
  ]) assert.throws(() => requireBpmnWorkflowContinuationStateV1(invalid, program, instanceId));
});

test("private Message handler hosting stays explicitly unavailable before classification, even for erased operations or private scheduling", () => {
  for (const candidate of [program, { ...program, operations: [] },
    { ...program, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule }]) {
    const result = assessTemporalHostCapability(candidate);
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
    assert.ok(result.kind === TemporalHostCapabilityResultKind.Rejected);
    assert.equal(result.failure.code, "interruptingMessageEventSubProcessQualificationUnavailable");
  }
});

test("published handler and Message Start facts bind to the exact declaration and triggering Message", () => {
  const traced = applyStimulusWithTrace(program, started(), delivery);
  const trigger = traced.committedTransitions[0]!;
  const record = { ...trigger, revision: 1 };
  const starts = traced.flowNodeOccurrenceLifecycles[0]!.started;
  assert.equal(starts.length, 2);
  for (const fact of starts) {
    assert.equal(programOccurrenceFactIsValid(fact, program), true);
    assert.equal(programOccurrenceStartMatchesTransition(fact, program, record), true);
    assert.equal(programOccurrenceStartMatchesTransition({ ...fact, owner: { ...fact.owner, processInstanceId: "other" } }, program, record), false);
    for (const stimulus of [{ ...delivery, channel: { ...channel, messageId: "other" } },
      { ...delivery, subscriptionId: { ...delivery.subscriptionId, activation: 2 } }]) {
      assert.equal(programOccurrenceStartMatchesTransition(fact, program,
        { ...record, transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus } }), false);
    }
  }
});

for (const tail of [[delivery, complete("WithdrawalTask")], [complete("A"), complete("B")], [complete("B"), complete("A")]]) {
  test(`strict E1 reader retains declaration-owned interactions through ${tail.map(({ commandId }) => commandId).join(" then ")}`, () => {
    let state = initialState;
    let revision = 0;
    for (const stimulus of [start, ...tail] as readonly Stimulus[]) {
      const step = advanceScenario(program, state, stimulus);
      assert.ok(step.kind === ScenarioStepKind.Committed && step.publication !== null);
      const throughRevision = revision + step.publication.transitions.length;
      const transitions = step.publication.transitions.map((record, index) => ({ ...record, revision: revision + index + 1 }));
      const page = {
        definition: program.identity, processId: program.processId, processInstanceId: instanceId,
        requestedAfterRevision: revision, pageThroughRevision: throughRevision, headRevision: throughRevision,
        batches: [{ commandId: stimulus.commandId, fromRevision: revision, throughRevision, transitions }],
        current: { revision: throughRevision, ...step.publication.current },
      };
      assert.deepEqual(requireExecutionPublicationPage(page, { program, processInstanceId: instanceId, afterRevision: revision, limit: 1 }), page);
      state = step.state;
      revision = throughRevision;
    }
  });
}
