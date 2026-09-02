import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  canonicalCompensationExecutionStateUtf8Bytes,
  type EffectOccurrenceId,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

test("completes B, unlocks A while C remains active, and releases one continuation after all succeed", () => {
  let state = triggeredState();
  const b = compensationEffect(state, "Effect_Undo_B");
  const c = compensationEffect(state, "Undo_C");

  const afterB = completeSuccess(compensationSemanticProgram, state, b, "complete-b");
  assert.equal(afterB.outcome, CommandOutcome.Committed);
  state = afterB.state;
  assert.deepEqual(handlerLifecycles(state), [
    ["Undo_A", "compensating"],
    ["Undo_B", "compensated"],
    ["Undo_C", "compensating"],
  ]);
  assert.deepEqual(
    state.compensationHandlerEffectWaits?.map(({ id }) => id.elementId),
    ["Undo_A", "Undo_C"],
  );

  const a = compensationEffect(state, "Undo_A");
  state = completeSuccess(compensationSemanticProgram, state, a, "complete-a").state;
  const completed = completeSuccess(compensationSemanticProgram, state, c, "complete-c");
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
  assert.equal(completed.state.compensationTriggers?.[0]?.lifecycle, "succeeded");
  assert.deepEqual(completed.state.compensationHandlerEffectWaits, []);
});

test("commits one typed Process failure, terminates siblings, and rejects the stale B result byte-preservingly", () => {
  const state = triggeredState();
  const b = compensationEffect(state, "Effect_Undo_B");
  const c = compensationEffect(state, "Undo_C");
  const failed = applyStimulus(compensationSemanticProgram, state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "fail-c",
    effectId: c,
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "compensation-rejected",
      message: "downstream rejected the reversal",
      localPatch: [],
    },
  });

  assert.equal(failed.outcome, CommandOutcome.Committed);
  assert.equal(failed.state.control.kind, ControlStateKind.Failed);
  assert.deepEqual(handlerLifecycles(failed.state), [
    ["Undo_A", "terminated"],
    ["Undo_B", "terminated"],
    ["Undo_C", "failed"],
  ]);
  assert.deepEqual(failed.state.compensationHandlerEffectWaits, []);
  assert.deepEqual(failed.state.scopeOccurrences, []);
  assert.deepEqual(failed.state.controlTokens, []);
  assert.deepEqual(failed.state.activityOccurrences, []);
  assert.deepEqual(failed.state.variables.activities, []);

  const stale = completeSuccess(compensationSemanticProgram, failed.state, b, "late-b");
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.strictEqual(stale.state, failed.state);
});

test("rejects nonempty handler patches and keeps the live wait byte-identical", () => {
  const state = triggeredState();
  const b = compensationEffect(state, "Effect_Undo_B");
  const result = applyStimulus(compensationSemanticProgram, state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "patch-b",
    effectId: b,
    result: {
      kind: EffectExecutionResultKind.Success,
      localPatch: [{
        name: "forbidden",
        value: { kind: VariableValueKind.String, value: "mutation" },
      }],
    },
  });
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, state);
});

test("rejects incident reporting for a compensation handler effect", () => {
  const state = triggeredState();
  const b = compensationEffect(state, "Effect_Undo_B");
  const result = applyStimulus(compensationSemanticProgram, state, {
    kind: StimulusKind.ReportEffectFailure,
    commandId: "report-compensation-incident",
    effectId: b,
    generation: 1,
  });
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, state);
});

test("keeps A pending when independent C finishes first, then unlocks A only after B", () => {
  let state = triggeredState();
  const c = compensationEffect(state, "Undo_C");
  state = completeSuccess(compensationSemanticProgram, state, c, "complete-c-first").state;
  assert.deepEqual(handlerLifecycles(state), [
    ["Undo_A", "pending"],
    ["Undo_B", "compensating"],
    ["Undo_C", "compensated"],
  ]);
  assert.deepEqual(
    state.compensationHandlerEffectWaits?.map(({ id }) => id.elementId),
    ["Effect_Undo_B"],
  );
  const b = compensationEffect(state, "Effect_Undo_B");
  state = completeSuccess(compensationSemanticProgram, state, b, "complete-b-second").state;
  assert.equal(
    state.compensationHandlerEffectWaits?.some(({ id }) => id.elementId === "Undo_A"),
    true,
  );
});

test("rejects a completion byte-preservingly when its newly unlocked Event Sub-Process frontier is one byte too large", () => {
  const delayedProgram = {
    ...compensationSemanticProgram,
    compensationExecution: {
      ...compensationSemanticProgram.compensationExecution,
      dependencies: [{
        predecessorElementId: "B",
        successorElementId: "C",
        reason: "sequenceFlow",
      }],
    },
  } as const satisfies SemanticProcessProgram;
  const current = triggeredState(delayedProgram);
  const pendingB = current.compensationTriggers?.[0]?.handlers.find(({ handlerElementId }) =>
    handlerElementId === "Undo_B"
  );
  assert.equal(pendingB?.lifecycle, "pending");
  const restoredValue = pendingB?.lifecycle === "pending"
    ? pendingB.restoredContext?.frames[0]?.bindings[0]?.value
    : undefined;
  assert.equal(restoredValue?.kind, VariableValueKind.String);
  assert.equal(
    restoredValue?.kind === VariableValueKind.String
      ? restoredValue.value
      : null,
    "frozen-at-b-completion",
  );
  assert.deepEqual(current.compensationParentContextRetentions, []);
  const c = compensationEffect(current, "Undo_C");
  const successor = completeSuccess(delayedProgram, current, c, "complete-c-unbounded");
  assert.equal(successor.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    successor.state.compensationHandlerEffectWaits?.find(({ id }) =>
      id.elementId === "Effect_Undo_B"
    )?.arguments,
    [{
      name: "archivedContext",
      value: { kind: VariableValueKind.String, value: "frozen-at-b-completion" },
    }],
  );
  const currentBytes = executionBytes(current);
  const successorBytes = executionBytes(successor.state);
  assert.ok(successorBytes > currentBytes);
  const boundedProgram = {
    ...delayedProgram,
    compensationExecution: {
      ...delayedProgram.compensationExecution,
      limits: {
        ...delayedProgram.compensationExecution.limits,
        maxCanonicalBytes: successorBytes - 1,
      },
    },
  } satisfies SemanticProcessProgram;

  const rejected = completeSuccess(boundedProgram, current, c, "complete-c-bounded");
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.strictEqual(rejected.state, current);
});

test("drops a still-pending Event Sub-Process context when an active sibling fails", () => {
  const delayedProgram = {
    ...compensationSemanticProgram,
    compensationExecution: {
      ...compensationSemanticProgram.compensationExecution,
      dependencies: [{
        predecessorElementId: "B",
        successorElementId: "C",
        reason: "sequenceFlow",
      }],
    },
  } as const satisfies SemanticProcessProgram;
  const state = triggeredState(delayedProgram);
  const c = compensationEffect(state, "Undo_C");
  const failed = applyStimulus(delayedProgram, state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "fail-c-before-b",
    effectId: c,
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "compensation-rejected",
      message: null,
      localPatch: [],
    },
  });
  const b = failed.state.compensationTriggers?.[0]?.handlers.find(({ handlerElementId }) =>
    handlerElementId === "Undo_B"
  );
  assert.deepEqual(b, {
    id: b?.id,
    subject: b?.subject,
    handlerElementId: "Undo_B",
    lifecycle: "terminated",
  });
});

function triggeredState(
  program: SemanticProcessProgram = compensationSemanticProgram,
): RuntimeState {
  const ready = triggerReadyFixture(program);
  const result = applyStimulus(program, ready.state, ready.completion);
  if (result.state.compensationTriggers?.[0]?.lifecycle !== "active") {
    throw new TypeError("fixture did not create an active trigger");
  }
  return result.state;
}

function compensationEffect(state: RuntimeState, elementId: string): EffectOccurrenceId {
  const wait = state.compensationHandlerEffectWaits?.find(({ id }) =>
    id.elementId === elementId
  );
  if (wait === undefined) throw new TypeError(`missing compensation effect ${elementId}`);
  return wait.id;
}

function completeSuccess(
  program: SemanticProcessProgram,
  state: RuntimeState,
  effectId: EffectOccurrenceId,
  commandId: string,
) {
  return applyStimulus(program, state, {
    kind: StimulusKind.CompleteEffect,
    commandId,
    effectId,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  });
}

function handlerLifecycles(state: RuntimeState): Array<[string, string]> {
  return state.compensationTriggers?.[0]?.handlers.map(({ handlerElementId, lifecycle }) =>
    [handlerElementId, lifecycle]
  ) ?? [];
}

function executionBytes(state: RuntimeState): number {
  return canonicalCompensationExecutionStateUtf8Bytes(
    state.compensationTriggers ?? [],
    state.compensationHandlerEffectWaits ?? [],
  );
}
