import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome,
  EffectExecutionResultKind,
  SemanticTransitionKind,
  StimulusKind,
  applyStimulusWithTrace,
  type RuntimeState,
  type Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  admittedTransactionProgram,
  completeTransactionTask,
  startTransaction,
  transactionChildScope,
  transactionRootScope,
} from "../../../semantic-core/test/transaction-cancellation-fixtures.ts";
import {
  programOccurrenceFactIsValid,
  programOccurrenceStartMatchesTransition,
} from "../dist/flow-node-occurrence-publication-program-validation.js";
import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-protocol";

const program = admittedTransactionProgram();

test("manual Transaction programs retain typed pre-start host refusal", () => {
  const result = assessTemporalHostCapability(program);
  assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
  if (result.kind !== TemporalHostCapabilityResultKind.Rejected) throw new Error("Unexpected admission");
  assert.equal(result.failure.code, TemporalHostAdmissionFailureCode.CompensationSchedulerUnavailable);
});

for (const eligible of [false, true]) {
  test(`strict Program readers bind ${eligible ? "compensated" : "empty"} cancellation publications`, () => {
    let state = startTransaction(program);
    if (eligible) state = completeTransactionTask(program, state, "Reserve").state;
    const wait = state.userTaskWaits.find(({ id }) => id.elementId === "Withdraw");
    assert.ok(wait);
    state = publish(state, {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "cancel",
      taskId: wait.id,
      submittedValues: [],
    });
    if (eligible) {
      const handler = state.compensationHandlerEffectWaits?.[0];
      assert.ok(handler);
      publish(state, {
        kind: StimulusKind.CompleteEffect,
        commandId: "join",
        effectId: handler.id,
        result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
      });
    }
  });
}

function publish(state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const traced = applyStimulusWithTrace(program, state, stimulus);
  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  assert.ok(traced.committedTransitions.length > 0);
  for (const [index, delta] of traced.flowNodeOccurrenceLifecycles.entries()) {
    const record = { ...traced.committedTransitions[index]!, revision: index + 1 };
    for (const started of delta.started) {
      assert.equal(programOccurrenceFactIsValid(started, program), true, started.elementId);
      assert.equal(programOccurrenceStartMatchesTransition(started, program, record), true, started.elementId);
      const otherOwner = { ...started, owner: {
        ...started.owner,
        definitionScopeId: started.owner.definitionScopeId === transactionChildScope
          ? transactionRootScope : transactionChildScope,
      } };
      assert.equal(programOccurrenceStartMatchesTransition(otherOwner, program, record), false);
      assert.equal(programOccurrenceStartMatchesTransition({ ...started, owner: {
        ...started.owner, processInstanceId: "another-instance",
      } }, program, record), false);
      if (started.elementId === "Boundary_Cancel" &&
        record.transition.kind === SemanticTransitionKind.ExternalStimulus &&
        record.transition.stimulus.kind === StimulusKind.CompleteEffect) {
        const completion = record.transition.stimulus;
        for (const substituted of [
          { ...completion, effectId: { ...completion.effectId, elementId: "unrelated-effect" } },
          { ...completion, result: {
            kind: EffectExecutionResultKind.BpmnError,
            code: "release-failed", message: null, localPatch: [],
          } } as const,
        ]) {
          assert.equal(programOccurrenceStartMatchesTransition(started, program, {
            ...record, transition: { ...record.transition, stimulus: substituted },
          }), false);
        }
      }
    }
  }
  return traced.result.state;
}
