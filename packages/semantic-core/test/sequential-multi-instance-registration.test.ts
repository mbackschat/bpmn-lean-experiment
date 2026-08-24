import assert from "node:assert/strict";
import test from "node:test";

import {
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  SemanticProfileId,
  profileAllowsProgramShape,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";

import {
  reviewProgram,
  start,
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
