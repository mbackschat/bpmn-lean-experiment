import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CompensationParentContextRetentionKind,
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  canonicalCompensationExecutionStateUtf8Bytes,
  type CompensationTriggerExecution,
  type EffectOccurrenceId,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

test("moves a zero-subject global throw directly to its continuation without a tombstone", () => {
  const {
    compensationActivityRetention: _activityRetention,
    compensationEventSubProcessSnapshots: _snapshots,
    ...withoutSources
  } = compensationSemanticProgram;
  void _activityRetention;
  void _snapshots;
  const program = {
    ...withoutSources,
    compensationExecution: {
      ...withoutSources.compensationExecution,
      subjects: [],
      dependencies: [],
    },
  } as const satisfies SemanticProcessProgram;
  const ready = triggerReadyFixture(program);

  const result = applyStimulus(program, ready.state, ready.completion);

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.state.control.kind, "completed");
  assert.deepEqual(result.state.compensationTriggers, []);
  assert.deepEqual(result.state.compensationHandlerEffectWaits, []);
});

test("claims A/B/C atomically and starts the maximal B/C frontier from frozen context", () => {
  const ready = triggerReadyFixture();
  assert.equal(
    ready.state.compensationParentContextRetentions?.[0]?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );

  const result = applyStimulus(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  );

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.deepEqual(result.state.compensationActivityRetentions?.[0]?.records, []);
  assert.equal(result.state.compensationActivityRetentions?.[0]?.nextCompletionOrdinal, 3);
  assert.deepEqual(result.state.compensationParentContextRetentions, []);
  const trigger = result.state.compensationTriggers?.[0];
  assert.equal(trigger?.lifecycle, "active");
  assert.deepEqual(
    trigger?.handlers.map(({ handlerElementId, lifecycle }) => ({
      handlerElementId,
      lifecycle,
    })),
    [
      { handlerElementId: "Undo_A", lifecycle: "pending" },
      { handlerElementId: "Undo_B", lifecycle: "compensating" },
      { handlerElementId: "Undo_C", lifecycle: "compensating" },
    ],
  );
  const waits = result.state.compensationHandlerEffectWaits ?? [];
  assert.deepEqual(waits.map(({ id }) => id.elementId), ["Effect_Undo_B", "Undo_C"]);
  assert.deepEqual(waits.find(({ id }) => id.elementId === "Effect_Undo_B")?.arguments, [{
    name: "archivedContext",
    value: { kind: VariableValueKind.String, value: "frozen-at-b-completion" },
  }]);
  assert.equal(
    result.state.controlTokens.some(({ placeId }) => placeId === "place:Trigger_To_End"),
    false,
  );
});

test("rejects the enclosing completion byte-preservingly when first-frontier capacity is one byte short", () => {
  const ready = triggerReadyFixture();
  const unbounded = applyStimulus(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  );
  assert.equal(unbounded.state.compensationTriggers?.length, 1);
  const prospectiveBytes = canonicalCompensationExecutionStateUtf8Bytes(
    unbounded.state.compensationTriggers ?? [],
    unbounded.state.compensationHandlerEffectWaits ?? [],
  );
  const bounded = {
    ...compensationSemanticProgram,
    compensationExecution: {
      ...compensationSemanticProgram.compensationExecution,
      limits: {
        ...compensationSemanticProgram.compensationExecution.limits,
        maxCanonicalBytes: prospectiveBytes - 1,
      },
    },
  } satisfies SemanticProcessProgram;

  const result = applyStimulus(bounded, ready.state, ready.completion);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, ready.state);
});

test("retains a succeeded tombstone beside a later nonempty trigger below the retained-record limit", () => {
  const ready = triggerReadyFixture();
  const tombstone = succeededTombstone();
  const state = {
    ...ready.state,
    compensationTriggers: [tombstone],
    compensationHandlerEffectWaits: [],
  } satisfies RuntimeState;

  const result = applyStimulus(compensationSemanticProgram, state, ready.completion);

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    result.state.compensationTriggers?.map(({ lifecycle }) => lifecycle),
    ["succeeded", "active"],
  );
  assert.deepEqual(result.state.compensationTriggers?.[0], tombstone);
});

test("rejects a later nonempty trigger byte-preservingly at the retained-record limit", () => {
  const ready = triggerReadyFixture();
  const tombstone = succeededTombstone();
  const state = {
    ...ready.state,
    compensationTriggers: [tombstone],
    compensationHandlerEffectWaits: [],
  } satisfies RuntimeState;
  const bounded = {
    ...compensationSemanticProgram,
    compensationExecution: {
      ...compensationSemanticProgram.compensationExecution,
      limits: {
        ...compensationSemanticProgram.compensationExecution.limits,
        maxTriggers: 1,
      },
    },
  } satisfies SemanticProcessProgram;

  const result = applyStimulus(bounded, state, ready.completion);

  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, state);
});

test("moves a zero-subject throw at retained-record capacity without adding a tombstone", () => {
  const program = zeroSubjectProgram(1);
  const ready = triggerReadyFixture(program);
  const owner = ready.state.scopeOccurrences.find(({ parent }) => parent === null)?.id;
  assert.ok(owner);
  const tombstone = {
    id: {
      processInstanceId: owner.processInstanceId,
      elementId: "operation:Trigger",
      activation: 1,
    },
    owner,
    output: "place:Trigger_To_End",
    lifecycle: "succeeded",
    handlers: [],
    dependencies: [],
  } as const satisfies CompensationTriggerExecution;
  const state = {
    ...ready.state,
    compensationTriggers: [tombstone],
    compensationHandlerEffectWaits: [],
  } satisfies RuntimeState;

  const result = applyStimulus(program, state, ready.completion);

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.state.control.kind, "completed");
  assert.deepEqual(result.state.compensationTriggers, [tombstone]);
});

test("rejects a zero-subject retrigger when the root already owns an active trigger", () => {
  const state = triggeredStateWithInput();
  const b = compensationEffect(state, "Effect_Undo_B");

  const result = completeSuccess(state, b, "complete-b-with-second-trigger-input");

  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.strictEqual(result.state, state);
});

function zeroSubjectProgram(maxTriggers: number): SemanticProcessProgram {
  const {
    compensationActivityRetention: _activityRetention,
    compensationEventSubProcessSnapshots: _snapshots,
    ...withoutSources
  } = compensationSemanticProgram;
  void _activityRetention;
  void _snapshots;
  return {
    ...withoutSources,
    compensationExecution: {
      ...withoutSources.compensationExecution,
      subjects: [],
      dependencies: [],
      limits: {
        ...withoutSources.compensationExecution.limits,
        maxTriggers,
      },
    },
  };
}

function succeededTombstone(): CompensationTriggerExecution {
  const trigger = triggeredState().compensationTriggers?.[0];
  if (trigger === undefined) throw new TypeError("missing trigger tombstone fixture");
  return {
    ...trigger,
    lifecycle: "succeeded",
    handlers: trigger.handlers.map(({ id, subject, handlerElementId }) => ({
      id,
      subject,
      handlerElementId,
      lifecycle: "compensated",
    })),
  };
}

function triggeredState(): RuntimeState {
  const ready = triggerReadyFixture();
  return applyStimulus(compensationSemanticProgram, ready.state, ready.completion).state;
}

function triggeredStateWithInput(): RuntimeState {
  const state = triggeredState();
  const owner = state.compensationTriggers?.[0]?.owner;
  if (owner === undefined) throw new TypeError("missing active trigger owner");
  return {
    ...state,
    controlTokens: [{
      placeId: "place:C_To_Trigger",
      owner,
      multiplicity: 1,
    }],
  };
}

function compensationEffect(state: RuntimeState, elementId: string): EffectOccurrenceId {
  const wait = state.compensationHandlerEffectWaits?.find(({ id }) =>
    id.elementId === elementId
  );
  if (wait === undefined) throw new TypeError(`missing compensation effect ${elementId}`);
  return wait.id;
}

function completeSuccess(
  state: RuntimeState,
  effectId: EffectOccurrenceId,
  commandId: string,
) {
  return applyStimulus(compensationSemanticProgram, state, {
    kind: StimulusKind.CompleteEffect,
    commandId,
    effectId,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  });
}
