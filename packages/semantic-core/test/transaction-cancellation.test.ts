import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
  applyStimulus,
  compensationRetentionStateDefects,
} from "@bpmn-lean/semantic-core";

import {
  admittedTransactionProgram,
  completeTransactionTask,
  startTransaction,
  transactionChildScope,
} from "./transaction-cancellation-fixtures.ts";

test("enters the Transaction with an empty child-owned register and two live Tasks", () => {
  const program = admittedTransactionProgram();
  const state = startTransaction(program);

  assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Reserve", "Withdraw"]);
  assert.equal(state.compensationActivityRetentions?.length, 1);
  assert.equal(state.compensationActivityRetentions?.[0]?.owner.definitionScopeId, transactionChildScope);
  assert.deepEqual(state.compensationActivityRetentions?.[0]?.records, []);
  assert.deepEqual(compensationRetentionStateDefects(program, state), []);
});

test("cancels unfinished work without compensation and releases only the parent Cancel route", () => {
  const program = admittedTransactionProgram();
  const cancelled = completeTransactionTask(program, startTransaction(program), "Withdraw");

  assert.equal(cancelled.outcome, CommandOutcome.Committed);
  assert.deepEqual(cancelled.state.userTaskWaits.map(({ id }) => id.elementId), ["Acknowledge"]);
  assert.deepEqual(cancelled.state.compensationActivityRetentions, []);
  assert.deepEqual(cancelled.state.compensationTriggers, []);
  assert.equal(cancelled.state.scopeOccurrences.length, 1);
  assert.deepEqual(compensationRetentionStateDefects(program, cancelled.state), []);
  assert.equal(completeTransactionTask(program, cancelled.state, "Acknowledge").state.control.kind, "completed");
});

test("pins the cancelled Transaction until compensation succeeds and rejects a repeated result", () => {
  const program = admittedTransactionProgram();
  const reserved = completeTransactionTask(program, startTransaction(program), "Reserve");
  assert.equal(reserved.outcome, CommandOutcome.Committed);
  assert.deepEqual(reserved.state.userTaskWaits.map(({ id }) => id.elementId), ["Prepare", "Withdraw"]);
  const cancelled = completeTransactionTask(program, reserved.state, "Withdraw");
  assert.equal(cancelled.outcome, CommandOutcome.Committed);
  assert.deepEqual(cancelled.state.userTaskWaits, []);
  assert.deepEqual(cancelled.state.controlTokens, []);
  assert.equal(cancelled.state.scopeOccurrences.length, 2);
  assert.equal(cancelled.state.compensationTriggers?.[0]?.lifecycle, "active");
  assert.deepEqual(cancelled.state.compensationActivityRetentions?.[0]?.records, []);
  const wait = cancelled.state.compensationHandlerEffectWaits?.[0];
  assert.ok(wait);
  assert.equal(wait.id.elementId, "Release_Reservation");

  const stimulus = {
    kind: StimulusKind.CompleteEffect,
    commandId: "release-reservation",
    effectId: wait.id,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  } as const;
  const joined = applyStimulus(program, cancelled.state, stimulus);
  assert.equal(joined.outcome, CommandOutcome.Committed);
  assert.deepEqual(joined.state.userTaskWaits.map(({ id }) => id.elementId), ["Acknowledge"]);
  assert.equal(joined.state.scopeOccurrences.length, 1);
  assert.deepEqual(joined.state.compensationActivityRetentions, []);
  assert.equal(joined.state.compensationTriggers?.[0]?.lifecycle, "succeeded");
  assert.deepEqual(compensationRetentionStateDefects(program, joined.state), []);
  const stale = applyStimulus(program, joined.state, { ...stimulus, commandId: "late-release" });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.strictEqual(stale.state, joined.state);
});

test("fails the Process on a typed child-handler error without releasing either continuation", () => {
  const program = admittedTransactionProgram();
  const reserved = completeTransactionTask(program, startTransaction(program), "Reserve");
  assert.equal(reserved.outcome, CommandOutcome.Committed);
  const cancelled = completeTransactionTask(program, reserved.state, "Withdraw");
  assert.equal(cancelled.outcome, CommandOutcome.Committed);
  const wait = cancelled.state.compensationHandlerEffectWaits?.[0];
  assert.ok(wait);
  const failed = applyStimulus(program, cancelled.state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "fail-release",
    effectId: wait.id,
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "release-refused",
      message: "Reservation release refused",
      localPatch: [],
    },
  });
  assert.equal(failed.outcome, CommandOutcome.Committed);
  assert.equal(failed.state.control.kind, "failed");
  assert.deepEqual(failed.state.scopeOccurrences, []);
  assert.deepEqual(failed.state.controlTokens, []);
  assert.deepEqual(failed.state.userTaskWaits, []);
  assert.deepEqual(failed.state.compensationActivityRetentions, []);
  assert.deepEqual(failed.state.compensationHandlerEffectWaits, []);
  assert.equal(failed.state.compensationTriggers?.[0]?.lifecycle, "failed");
});
