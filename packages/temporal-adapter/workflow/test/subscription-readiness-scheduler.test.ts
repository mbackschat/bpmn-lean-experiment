import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, MessageChannelKind, REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  ScenarioStepKind, StimulusKind, VariableValueKind, advanceScenario, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import { timerFiringStimulus } from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  prepareSubscriptionTimerBinding, selectSubscriptionStimuli, subscriptionTimerRemainingMs,
} from "../dist/subscription-readiness-scheduler.js";

const emptyBinding = { protocol: "bpmn-lean.subscription-timer.v1", timer: null } as const;
const instanceId = "subscription-host-binding";
const occurrence = { processInstanceId: instanceId, elementId: "Reminder", activation: 1 };
const channel = { kind: MessageChannelKind.DirectMessage, messageId: "Reminder" } as const;
const completion = {
  kind: StimulusKind.CompleteUserTaskInstance, commandId: "z-completion",
  taskId: occurrence, submittedValues: [],
} as const;
const message = {
  kind: StimulusKind.DeliverMessage, commandId: "\u{10000}", subscriptionId: occurrence, channel,
} as const;
const payload = {
  ...message, kind: StimulusKind.DeliverPayloadMessage, commandId: "\uE000",
  payload: { kind: VariableValueKind.String, value: "unselected payload" },
} as const;
const incidentId = { effectId: occurrence, generation: 1 };
const retry = { kind: StimulusKind.RetryIncident, commandId: "a-incident", incidentId } as const;
const cancel = {
  kind: StimulusKind.CancelIncidentProcess, commandId: "z-incident", processInstanceId: instanceId, incidentId,
} as const;
const firing = timerFiringStimulus({ id: occurrence, deadlineMs: 1_000 });

test("subscription batches order complete command classes and canonical scalar identities", () => {
  const expected = [completion, payload, message, firing, retry, cancel];
  for (const batch of [expected, [...expected].reverse(), [cancel, message, retry, firing, completion, payload]]) {
    const before = structuredClone(batch);
    assert.deepEqual(selectSubscriptionStimuli(batch), expected);
    assert.deepEqual(batch, before);
  }
});

test("subscription batches retain distinct deliveries to the same subscription", () => {
  const second = { ...message, commandId: "a-second-delivery" };
  assert.deepEqual(selectSubscriptionStimuli([message, second]), [second, message]);
});

const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL(
    "../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-timer.bpmn", import.meta.url,
  )),
  sourceId: "subscription-host-binding", expectedSha256: undefined, sourceOverlay: null,
  semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("subscription fixture refused");
const program = compilation.semanticProcess;
test("correlated payload uses the Message class even when its profile rejects the command", () => {
  const correlated = {
    kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: "a-correlated",
    address: {
      definition: program.identity, processId: program.processId,
      channel: { kind: MessageChannelKind.OperationMessage, interfaceId: "Messages", interfaceOperationId: "Receive", messageId: "Reminder" },
      correlationKeyId: "key",
    },
    ingressOrdinal: 1, subscriptionId: occurrence, correlationPropertyId: "correlation",
    processPropertyId: "property", payload: { kind: VariableValueKind.String, value: "unselected" },
  } as const;
  assert.deepEqual(selectSubscriptionStimuli([retry, firing, message, correlated, completion]),
    [completion, correlated, message, firing, retry]);
});
const start = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
  instanceId, initialVariables: [],
} as const;
const started = committed(initialState, start);
const firstBinding = prepareSubscriptionTimerBinding(program, initialState, started, start, emptyBinding, 10_000, 0);
assert.ok(firstBinding.timer);

test("first committed Timer binds Workflow time before any native wait or rollover", () => {
  assert.deepEqual(firstBinding, {
    protocol: emptyBinding.protocol,
    timer: { id: started.state.timerWaits[0]?.id, logicalDeadlineMs: 1_000, dueTimeMs: 11_000 },
  });
  assert.equal(subscriptionTimerRemainingMs(firstBinding, 10_600), 400);
  assert.equal(subscriptionTimerRemainingMs(firstBinding, 11_000), 1);
  assert.equal(subscriptionTimerRemainingMs(firstBinding, 20_000), 1);
});

test("late recurring firings advance the original due time once per fresh semantic occurrence", () => {
  let state = started.state;
  let binding = firstBinding;
  for (const dueTimeMs of [12_000, 13_000]) {
    const timer = state.timerWaits[0];
    assert.ok(timer);
    const stimulus = timerFiringStimulus(timer);
    const next = committed(state, stimulus);
    binding = prepareSubscriptionTimerBinding(program, state, next, stimulus, binding, 25_000, 1);
    assert.equal(binding.timer?.dueTimeMs, dueTimeMs);
    assert.deepEqual(binding.timer?.id, next.state.timerWaits[0]?.id);
    assert.equal(subscriptionTimerRemainingMs(binding, 25_000), 1);
    state = next.state;
  }
  assert.equal(state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length, 2);
});

test("host completion withdraws the bound Timer and a stale firing cannot replace it", () => {
  const stimulus = complete("UserTask_Sibling");
  const next = committed(started.state, stimulus);
  const binding = prepareSubscriptionTimerBinding(program, started.state, next, stimulus, firstBinding, 10_500, 1);
  assert.deepEqual(binding, emptyBinding);
  const old = started.state.timerWaits[0];
  assert.ok(old);
  const stale = timerFiringStimulus(old);
  const rejected = advanceScenario(program, next.state, stale);
  assert.equal(rejected.kind, ScenarioStepKind.Terminal);
  assert.deepEqual(prepareSubscriptionTimerBinding(program, next.state, rejected, stale, binding, 11_000, 2), emptyBinding);
});

test("a rejected firing whose exact Timer remains live retains its private cause", () => {
  const timer = started.state.timerWaits[0];
  assert.ok(timer);
  const stimulus = { ...timerFiringStimulus(timer), logicalTimeMs: 999 };
  const rejected = advanceScenario(program, started.state, stimulus);
  assert.equal(rejected.kind, ScenarioStepKind.Terminal);
  assert.throws(() => prepareSubscriptionTimerBinding(
    program, started.state, rejected, stimulus, firstBinding, 11_000, 7,
  ), (error: unknown) => {
    assert.ok(error instanceof ApplicationFailure);
    assert.equal(error.type, "BpmnHostCapabilityInvariantViolation");
    assert.equal(error.nonRetryable, true);
    assert.deepEqual(error.details, [{
      outcome: CommandOutcome.Rejected, commandId: stimulus.commandId,
      timerId: timer.id, logicalDeadlineMs: 999, publicationRevision: 7,
    }]);
    return true;
  });
  assert.deepEqual(started.state.timerWaits, [timer]);
  assert.equal(firstBinding.timer?.dueTimeMs, 11_000);
});

test("initial and recurring due-time overflow refuse before changing a committed binding", () => {
  assert.throws(() => prepareSubscriptionTimerBinding(
    program, initialState, started, start, emptyBinding, Number.MAX_SAFE_INTEGER, 0,
  ), isHostInvariant);
  const timer = started.state.timerWaits[0];
  assert.ok(timer && firstBinding.timer);
  const stimulus = timerFiringStimulus(timer);
  const next = committed(started.state, stimulus);
  const bound = { ...firstBinding, timer: { ...firstBinding.timer, dueTimeMs: Number.MAX_SAFE_INTEGER } };
  assert.throws(() => prepareSubscriptionTimerBinding(
    program, started.state, next, stimulus, bound, 11_000, 1,
  ), isHostInvariant);
  assert.equal(bound.timer.dueTimeMs, Number.MAX_SAFE_INTEGER);
});

function committed(before: RuntimeState, stimulus: Stimulus) {
  const step = advanceScenario(program, before, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) throw new Error("fixture command refused");
  return step;
}

function complete(elementId: string) {
  return { ...completion, commandId: `complete-${elementId}`, taskId: { ...occurrence, elementId } };
}

function isHostInvariant(error: unknown): boolean {
  return error instanceof ApplicationFailure && error.type === "BpmnHostCapabilityInvariantViolation";
}
