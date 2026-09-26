import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CompensationCompletionFactKind,
  CompensationRetentionResultKind,
  ControlStateKind,
  EffectExecutionResultKind,
  SemanticOperationKind,
  StimulusKind,
  applyStimulus,
  canonicalCompensationExecutionStateUtf8Bytes,
  compensationExecutionStateDefects,
  isWellFormedSemanticProcessProgram,
  retainCompletedCompensableActivity,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";
import {
  admittedTransactionProgram,
  completeTransactionTask,
  startTransaction,
} from "./transaction-cancellation-fixtures.ts";

for (const endId of ["Cancel", "Renamed_Cancel"]) {
  test(`Transaction admission keeps the ${endId} End distinct from its Cancel Boundary`, () => {
    const program = admittedTransactionProgram();
    const withBoundary = (boundaryEventElementId: string) => ({
      ...program,
      operations: program.operations.map((operation) =>
        operation.kind === SemanticOperationKind.CancelTransaction
          ? { ...operation, origin: { ...operation.origin, elementId: endId }, boundaryEventElementId }
          : operation),
    });
    assert.equal(isWellFormedSemanticProcessProgram(withBoundary(`${endId}_Boundary`)), true);
    assert.equal(isWellFormedSemanticProcessProgram(withBoundary(endId)), false);
  });
}

function cancelledTransaction() {
  const program = admittedTransactionProgram();
  const reserved = completeTransactionTask(program, startTransaction(program), "Reserve");
  assert.equal(reserved.outcome, CommandOutcome.Committed);
  const cancelled = completeTransactionTask(program, reserved.state, "Withdraw");
  assert.equal(cancelled.outcome, CommandOutcome.Committed);
  const wait = cancelled.state.compensationHandlerEffectWaits?.[0];
  assert.ok(wait);
  const stimulus = {
    kind: StimulusKind.CompleteEffect,
    commandId: "join",
    effectId: wait.id,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  } as const;
  return { program, reserved: reserved.state, state: cancelled.state, stimulus };
}

test("an active child trigger cannot repopulate its consumed register from a forged live wait", () => {
  const { program, state } = cancelledTransaction();
  const wait = startTransaction(program).userTaskWaits.find(({ id }) => id.elementId === "Reserve");
  assert.ok(wait);
  const forged = { ...state, userTaskWaits: [wait] };
  const retained = retainCompletedCompensableActivity(program, forged, {
    kind: CompensationCompletionFactKind.OrdinaryUserTask,
    activity: {
      processInstanceId: wait.id.processInstanceId,
      activityElementId: wait.id.elementId,
      activation: wait.id.activation,
    },
  });
  assert.equal(retained.kind, CompensationRetentionResultKind.Refused);
  assert.strictEqual(retained.state, forged);
});

test("a disposed Transaction tombstone still requires issued child identity and Process provenance", () => {
  const { program, state, stimulus } = cancelledTransaction();
  const joined = applyStimulus(program, state, stimulus);
  assert.equal(joined.outcome, CommandOutcome.Committed);
  const trigger = joined.state.compensationTriggers?.[0];
  assert.ok(trigger);
  const mutations: RuntimeState[] = [
    { ...joined.state, compensationTriggers: [{ ...trigger, owner: { ...trigger.owner, activation: 999 } }] },
    { ...joined.state, scopeActivations: [] },
    { ...joined.state, control: { kind: ControlStateKind.Running, instanceId: "unrelated-process" } },
    { ...joined.state, compensationTriggers: [{ ...trigger, handlers: trigger.handlers.map((handler) => {
      assert.equal(handler.subject.kind, "boundaryActivity");
      if (handler.subject.kind !== "boundaryActivity") throw new Error("expected Activity subject");
      return { ...handler, subject: { ...handler.subject, activity: { ...handler.subject.activity, processInstanceId: "unrelated-process" } } };
    }) }] },
    { ...joined.state, taskActivations: [] },
  ];
  for (const mutation of mutations) {
    assert.notDeepEqual(compensationExecutionStateDefects(program, mutation), []);
    const result = completeTransactionTask(program, mutation, "Acknowledge");
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.strictEqual(result.state, mutation);
  }
});

test("forged effect results preserve the pinned Transaction and its unreleased continuation", () => {
  const { program, state, stimulus } = cancelledTransaction();
  for (const effectId of [
    { ...stimulus.effectId, activation: stimulus.effectId.activation + 1 },
    { ...stimulus.effectId, processInstanceId: "unrelated-process" },
    { ...stimulus.effectId, elementId: "another-handler" },
  ]) {
    const result = applyStimulus(program, state, { ...stimulus, effectId });
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.strictEqual(result.state, state);
  }
});

test("cancellation capacity is checked before any cleanup and admits the exact canonical byte boundary", () => {
  const { program, reserved, state } = cancelledTransaction();
  const declaration = program.compensationExecution;
  assert.ok(declaration);
  const bytes = canonicalCompensationExecutionStateUtf8Bytes(
    state.compensationTriggers ?? [], state.compensationHandlerEffectWaits ?? [],
  );
  for (const [maxCanonicalBytes, outcome] of [
    [bytes - 1, CommandOutcome.Rejected], [bytes, CommandOutcome.Committed],
  ] as const) {
    const bounded = { ...program, compensationExecution: {
      ...declaration, limits: { ...declaration.limits, maxCanonicalBytes },
    } };
    const result = completeTransactionTask(bounded, reserved, "Withdraw");
    assert.equal(result.outcome, outcome);
    if (outcome === CommandOutcome.Rejected) assert.strictEqual(result.state, reserved);
    else assert.deepEqual(result.state, state);
  }
});
