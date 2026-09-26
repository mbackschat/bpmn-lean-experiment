import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  SemanticOperationKind,
  StimulusKind,
  applyInternalOperationStep,
  applyStimulus,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import {
  admittedTransactionProgram,
  completeTransactionTask,
  startTransaction,
  transactionInstanceId,
} from "./transaction-cancellation-fixtures.ts";

const { deriveInternalRegionalPreparation } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");

for (const eligible of [false, true]) {
  test(`Transaction ${eligible ? "retained tombstone" : "empty join"} uses singleton completion outside regional batching`, () => {
    const program = admittedTransactionProgram();
    let state = startTransaction(program);
    if (eligible) state = completeTransactionTask(program, state, "Reserve").state;
    state = completeTransactionTask(program, state, "Withdraw").state;
    if (eligible) {
      const wait = state.compensationHandlerEffectWaits?.[0];
      assert.ok(wait);
      const joined = applyStimulus(program, state, {
        kind: StimulusKind.CompleteEffect,
        commandId: "join",
        effectId: wait.id,
        result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
      });
      assert.equal(joined.outcome, CommandOutcome.Committed);
      state = joined.state;
    }
    const completed = completeTransactionTask(program, state, "Acknowledge");
    assert.equal(completed.outcome, CommandOutcome.Committed);
    assert.equal(completed.state.control.kind, ControlStateKind.Completed);
    const before = {
      ...completed.state,
      control: { kind: ControlStateKind.Running, instanceId: transactionInstanceId } as const,
      scopeOccurrences: state.scopeOccurrences,
    };
    assert.deepEqual(runtimeStateDefects(program, transactionInstanceId, before), []);
    const operation = program.operations.find((candidate) =>
      candidate.kind === SemanticOperationKind.CompleteScope && candidate.parentOutput === null);
    assert.ok(operation?.kind === SemanticOperationKind.CompleteScope);
    assert.equal(deriveInternalRegionalPreparation(program, before, operation), null);
    const step = applyInternalOperationStep(program, operation, before);
    assert.ok(step);
    assert.deepEqual(step.successor, completed.state);
  });
}
