import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationFailure,
} from "@temporalio/workflow";
import {
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  completeReview,
  deliverWithdrawal,
  program,
  start,
  subscriptionId,
  taskId,
  withdrawalChannel,
} from "../../../semantic-core/test/activity-boundary-message-fixture.ts";
import {
  bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
} from "../../protocol/dist/index.js";
import {
  classifyMessageBoundedActivityCallback,
  createMessageBoundedActivityReadinessScheduler,
  selectMessageBoundedActivityStimuli,
} from "../dist/index.js";

const started = applyStimulus(program, initialState, start);
assert.equal(started.outcome, CommandOutcome.Committed);
const armed = started.state;

test("fails closed when Message and completion share one activation", () => {
  const message = classifyMessageBoundedActivityCallback(
    program,
    armed,
    deliverWithdrawal,
    true,
  );
  const completion = classifyMessageBoundedActivityCallback(
    program,
    armed,
    completeReview,
  );
  assert.ok(message !== undefined);
  assert.ok(completion !== undefined);

  for (const batch of [[message, completion], [completion, message]]) {
    assert.throws(
      () => selectMessageBoundedActivityStimuli(batch),
      (error) =>
        error instanceof ApplicationFailure &&
        error.type ===
          bpmnMessageBoundedActivitySchedulerUnavailableFailureType &&
        error.nonRetryable === true,
    );
  }
});

test("preserves callback order and omits only a ledger-suppressed Message", () => {
  const secondDelivery = {
    ...deliverWithdrawal,
    commandId: "deliver-withdrawal-again",
  };
  const first = classifyMessageBoundedActivityCallback(
    program,
    armed,
    deliverWithdrawal,
    true,
  );
  const second = classifyMessageBoundedActivityCallback(
    program,
    armed,
    secondDelivery,
    true,
  );
  const suppressed = classifyMessageBoundedActivityCallback(
    program,
    armed,
    deliverWithdrawal,
    false,
  );
  assert.ok(first !== undefined);
  assert.ok(second !== undefined);
  assert.ok(suppressed !== undefined);

  assert.deepEqual(
    selectMessageBoundedActivityStimuli([second, first]),
    [secondDelivery, deliverWithdrawal],
  );
  assert.deepEqual(selectMessageBoundedActivityStimuli([suppressed]), []);
});

test("owns only exact payload-free Message and exact empty completion callbacks", () => {
  const wrongTask = { ...completeReview, taskId: { ...taskId, activation: 2 } };
  const nonEmpty = {
    ...completeReview,
    submittedValues: [{
      name: "decision",
      value: { kind: VariableValueKind.String, value: "approved" },
    }],
  };
  const wrongSubscription = {
    ...deliverWithdrawal,
    subscriptionId: { ...subscriptionId, activation: 2 },
  };
  const wrongChannel = {
    ...deliverWithdrawal,
    channel: { ...withdrawalChannel, messageId: "Message_Other" },
  };
  const payloadBearing = {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "deliver-withdrawal-with-payload",
    subscriptionId,
    channel: withdrawalChannel,
    payload: { kind: VariableValueKind.String, value: "withdrawn" },
  } as const;

  for (
    const stimulus of [
      wrongTask,
      nonEmpty,
      wrongSubscription,
      wrongChannel,
      payloadBearing,
    ] satisfies ReadonlyArray<Stimulus>
  ) {
    assert.equal(
      classifyMessageBoundedActivityCallback(program, armed, stimulus),
      undefined,
      stimulus.commandId,
    );
  }
});

test("owns no missing, duplicate, or malformed committed pair", () => {
  const [record] = armed.activityOccurrences;
  const [task] = armed.userTaskWaits;
  const [message] = armed.messageWaits;
  assert.ok(record !== undefined);
  assert.ok(task !== undefined);
  assert.ok(message !== undefined);

  const states: ReadonlyArray<RuntimeState> = [
    { ...armed, activityOccurrences: [] },
    { ...armed, activityOccurrences: [record, { ...record }] },
    { ...armed, userTaskWaits: [] },
    { ...armed, userTaskWaits: [task, { ...task }] },
    { ...armed, messageWaits: [] },
    { ...armed, messageWaits: [message, { ...message }] },
    {
      ...armed,
      activityOccurrences: [{
        ...record,
        operationId: "operation:NotTheBoundedActivity",
      }],
    },
  ];
  const operation = program.operations.find(({ id }) => id === record.operationId);
  assert.ok(operation !== undefined);
  const duplicateDefinition = {
    ...program,
    operations: [...program.operations, operation],
  } satisfies SemanticProcessProgram;

  for (const state of states) {
    const scheduler = createMessageBoundedActivityReadinessScheduler(program);
    assert.equal(scheduler.ownsCommittedPair(state), false);
    assert.equal(
      scheduler.recordMessageCallback(state, deliverWithdrawal, true),
      false,
    );
    assert.equal(
      scheduler.recordCompletionCallback(state, completeReview),
      false,
    );
  }
  assert.equal(
    createMessageBoundedActivityReadinessScheduler(duplicateDefinition)
      .ownsCommittedPair(armed),
    false,
  );
});

test("does not absorb Timer or ordinary runtime families", () => {
  const scheduler = createMessageBoundedActivityReadinessScheduler(program);
  const fireTimer = {
    kind: StimulusKind.FireTimer,
    commandId: "fire-unrelated",
    timerId: { processInstanceId: "instance", elementId: "Timer", activation: 1 },
    logicalTimeMs: 1_000,
  } as const;

  assert.equal(scheduler.ownsCommittedPair(armed), true);
  assert.deepEqual(Object.keys(scheduler).sort(), [
    "hasPendingCallbacks",
    "ownsCommittedPair",
    "recordCompletionCallback",
    "recordMessageCallback",
    "waitForReadiness",
  ]);
  assert.equal(
    classifyMessageBoundedActivityCallback(program, armed, fireTimer),
    undefined,
  );
  assert.equal(
    classifyMessageBoundedActivityCallback(program, armed, start),
    undefined,
  );
  assert.equal(
    classifyMessageBoundedActivityCallback(program, initialState, completeReview),
    undefined,
  );
});
