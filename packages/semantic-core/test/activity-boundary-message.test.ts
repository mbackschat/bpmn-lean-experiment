import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  RuntimeStateDefect,
  RuntimeStateRegression,
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  profileAllowsProgramShape,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";

import {
  completeReview,
  deliverWithdrawal,
  instanceId,
  owner,
  program,
  start,
  subscriptionId,
  taskId,
  withdrawalChannel,
} from "./activity-boundary-message-fixture.ts";

test("profile admission refuses a program that arms the Message handler late", () => {
  const lateArmingOperations = program.operations.map((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.AwaitMessageBoundedUserTask:
        return {
          ...operation,
          input: "place:Flow_Normal",
          task: { ...operation.task, output: "place:Flow_Normal_End" },
        };
      case SemanticOperationKind.AwaitUserTask:
        return operation.task.elementId === "RecordReviewCompletion"
          ? {
            ...operation,
            input: "place:Flow_Start",
            output: "place:Flow_Normal",
          }
          : operation;
      default:
        return operation;
    }
  });

  assert.equal(profileAllowsProgramShape(
    program.identity.semanticProfile,
    program.operations,
    program.definitionScopes.length,
  ), true);
  assert.equal(profileAllowsProgramShape(
    program.identity.semanticProfile,
    lateArmingOperations,
    program.definitionScopes.length,
  ), false);
});

function armed() {
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

test("arming atomically creates the Activity body and its Message handler", () => {
  const state = armed();

  assert.deepEqual(state.control, { kind: ControlStateKind.Running, instanceId });
  assert.deepEqual(state.controlTokens, []);
  assert.deepEqual(state.userTaskWaits, [{
    id: taskId,
    owner,
    name: "Review application",
    output: "place:Flow_Normal",
  }]);
  assert.deepEqual(state.messageWaits, [{
    id: subscriptionId,
    owner,
    channel: withdrawalChannel,
    output: "place:Flow_Boundary",
  }]);
  assert.deepEqual(state.activityOccurrences, [{
    id: {
      processInstanceId: instanceId,
      activityElementId: "ReviewApplication",
      activation: 1,
    },
    owner,
    operationId: "operation:ReviewApplication",
    body: { kind: ActivityBodyKind.UserTask, task: taskId },
    attachedHandlers: [{
      kind: ActivityHandlerKind.Message,
      occurrence: subscriptionId,
    }],
  }]);
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.equal(
    runtimeStateDefects(program, instanceId, state).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "Message-bounded User Task arming inserts a disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(initialState, state).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the Message-bounded evaluator issues above the predecessor Activity mark",
  );
});

test("runtime well-formedness requires the tagged Message handler to resolve exactly", () => {
  const state = armed();
  const withoutSubscription = { ...state, messageWaits: [] };
  assert.equal(
    runtimeStateDefects(program, instanceId, withoutSubscription).includes(
      RuntimeStateDefect.ActivityOccurrenceBodyAbsent,
    ),
    true,
  );

  const wrongFamily = {
    ...state,
    activityOccurrences: state.activityOccurrences.map((record) => ({
      ...record,
      attachedHandlers: record.attachedHandlers.map((handler) => ({
        kind: ActivityHandlerKind.Timer,
        occurrence: handler.occurrence,
      })),
    })),
  };
  assert.equal(
    runtimeStateDefects(program, instanceId, wrongFamily).includes(
      RuntimeStateDefect.ActivityOccurrenceBodyAbsent,
    ),
    true,
  );
  const refused = applyStimulus(program, wrongFamily, deliverWithdrawal);
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, wrongFamily);

  const record = state.activityOccurrences[0];
  assert.ok(record !== undefined);
  const duplicateClaim = {
    ...state,
    activityOccurrences: [
      record,
      {
        ...record,
        id: { ...record.id, activation: 2 },
      },
    ],
  };
  assert.equal(
    runtimeStateDefects(program, instanceId, duplicateClaim).includes(
      RuntimeStateDefect.UnownedAttachedWait,
    ),
    true,
  );
});

test("empty task completion withdraws the Message handler and takes only the normal route", () => {
  const won = applyStimulus(program, armed(), completeReview);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.messageWaits, []);
  assert.deepEqual(won.state.activityOccurrences, []);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["RecordReviewCompletion"],
  );
});

test("payload-free Message delivery cancels the task and takes only the boundary route", () => {
  const won = applyStimulus(program, armed(), deliverWithdrawal);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.messageWaits, []);
  assert.deepEqual(won.state.activityOccurrences, []);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["HandleWithdrawal"],
  );
});

test("wrong, premature, non-empty, and payload-bearing stimuli preserve exact state", () => {
  const state = armed();
  const rejectedStimuli = [
    {
      ...deliverWithdrawal,
      commandId: "wrong-subscription",
      subscriptionId: { ...subscriptionId, activation: 2 },
    },
    {
      ...deliverWithdrawal,
      commandId: "wrong-channel",
      channel: {
        ...withdrawalChannel,
        messageId: "Message_Other",
      },
    },
    {
      ...completeReview,
      commandId: "non-empty-completion",
      submittedValues: [{
        name: "decision",
        value: { kind: VariableValueKind.String, value: "approved" },
      }],
    },
    {
      kind: StimulusKind.DeliverPayloadMessage,
      commandId: "payload-bearing-delivery",
      subscriptionId,
      channel: withdrawalChannel,
      payload: { kind: VariableValueKind.String, value: "withdrawn" },
    },
  ] as const;

  for (const stimulus of rejectedStimuli) {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, state);
  }

  const premature = applyStimulus(program, initialState, deliverWithdrawal);
  assert.equal(premature.outcome, CommandOutcome.Rejected);
  assert.deepEqual(premature.state, initialState);
});

test("each victory makes the losing stimulus stale with exact state preservation", () => {
  const normal = applyStimulus(program, armed(), completeReview);
  assert.equal(normal.outcome, CommandOutcome.Committed);
  const staleMessage = applyStimulus(program, normal.state, deliverWithdrawal);
  assert.equal(staleMessage.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleMessage.state, normal.state);

  const boundary = applyStimulus(program, armed(), deliverWithdrawal);
  assert.equal(boundary.outcome, CommandOutcome.Committed);
  const staleCompletion = applyStimulus(program, boundary.state, completeReview);
  assert.equal(staleCompletion.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleCompletion.state, boundary.state);
});

test("the profile remains operation-addressed rather than accepting another channel kind", () => {
  const state = armed();
  const rejected = applyStimulus(program, state, {
    ...deliverWithdrawal,
    commandId: "direct-message-channel",
    channel: {
      kind: MessageChannelKind.DirectMessage,
      messageId: withdrawalChannel.messageId,
    },
  });

  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, state);
});
