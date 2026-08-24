import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  SemanticProfileId,
  applyStimulus,
  initialState,
  profileAllowsProgramShape,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";

import {
  reviewData,
  reviewProgram,
  start,
  startWithCollection,
} from "./sequential-multi-instance-fixture.ts";

test("registers only the reviewed sequential Multi-Instance Program and start domain", () => {
  assert.equal(
    Object.values(SemanticProfileId).includes(
      SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID as never,
    ),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
      reviewProgram.operations,
      reviewProgram.definitionScopes.length,
    ),
    true,
  );
  assert.equal(supportsSemanticProcessExecution(start, reviewProgram), true);

  for (const oldProfileId of Object.values(SemanticProfileId).filter(
    (profileId) =>
      profileId !== SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  )) {
    const oldProfileProgram = {
      ...reviewProgram,
      identity: {
        ...reviewProgram.identity,
        semanticProfile: oldProfileId,
      },
    };
    assert.equal(
      profileAllowsProgramShape(
        oldProfileId,
        oldProfileProgram.operations,
        oldProfileProgram.definitionScopes.length,
      ),
      false,
      `${oldProfileId} must not admit the sequential Multi-Instance operation`,
    );
    assert.equal(
      supportsSemanticProcessExecution(start, oldProfileProgram),
      false,
      `${oldProfileId} must not execute the sequential Multi-Instance Program`,
    );
  }
});

test("refuses an extra operation under the registered profile", () => {
  assert.equal(
    profileAllowsProgramShape(
      SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
      [...reviewProgram.operations, reviewProgram.operations[0]!],
      reviewProgram.definitionScopes.length,
    ),
    false,
  );
});

test("keeps pre-host and initial-state runtime admission equivalent for exact start data", () => {
  const operation = reviewProgram.operations.find(({ kind }) =>
    kind === "awaitSequentialMultiInstanceUserTask"
  );
  assert.equal(operation?.kind, "awaitSequentialMultiInstanceUserTask");
  if (operation?.kind !== "awaitSequentialMultiInstanceUserTask") {
    throw new TypeError("sequential Multi-Instance operation is missing");
  }
  const duplicateBinding = start.initialVariables[0];
  assert.ok(duplicateBinding !== undefined);
  const candidates = [
    start,
    { ...start, commandId: "start-empty-bindings", initialVariables: [] },
    startWithCollection("start-wrong-name", ["alpha"], "Wrong_Input"),
    {
      ...start,
      commandId: "start-duplicate-binding",
      initialVariables: [duplicateBinding, duplicateBinding],
    },
    startWithCollection(
      "start-too-many-items",
      Array.from(
        { length: operation.limits.maximumItems + 1 },
        (_, index) => `item-${index}`,
      ),
    ),
    startWithCollection(
      "start-oversized-item",
      ["x".repeat(operation.limits.maximumItemUtf8Bytes + 1)],
      reviewData.input.dataObjectReferenceId,
    ),
  ] as const;

  for (const candidate of candidates) {
    const runtime = applyStimulus(reviewProgram, initialState, candidate);
    assert.equal(
      supportsSemanticProcessExecution(candidate, reviewProgram),
      runtime.outcome === CommandOutcome.Committed,
      candidate.commandId,
    );
  }
});
