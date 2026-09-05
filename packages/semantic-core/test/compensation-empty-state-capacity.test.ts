import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CompensationExecutionStateDefect,
  canonicalCompensationExecutionStateUtf8Bytes,
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  canonicalCompensationRecordsUtf8Bytes,
  compensationExecutionStateDefects,
  initialState,
  initializeCompensationExecutionState,
  isCompensationExecutionDeclaration,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  compensationHandlerBScopeId,
  compensationSemanticProgram,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

test("charges seven bytes for the canonical pair of empty execution collections", () => {
  const independentlyEncoded = Buffer.from(JSON.stringify([[], []]), "utf8");
  assert.equal(independentlyEncoded.toString("utf8"), "[[],[]]");
  assert.equal(independentlyEncoded.byteLength, 7);
  assert.equal(
    canonicalCompensationExecutionStateUtf8Bytes([], []),
    independentlyEncoded.byteLength,
  );
});

for (const maxCanonicalBytes of [2, 6]) {
  test(`rejects a ${maxCanonicalBytes}-byte declaration that cannot contain its empty execution state`, () => {
    const program = zeroSubjectProgram(maxCanonicalBytes);
    const state = initializeCompensationExecutionState(program, initialState);
    assert.deepEqual(compensationExecutionStateDefects(program, state), [
      CompensationExecutionStateDefect.CapacityExceeded,
    ]);
    assert.equal(isWellFormedSemanticProcessProgram(program), false);
    assert.equal(isCompensationExecutionDeclaration(program.compensationExecution), false);
  });
}

for (const maxCanonicalBytes of [7, 65_536]) {
  test(`admits a ${maxCanonicalBytes}-byte zero-subject Program and its empty initial state`, () => {
    const program = zeroSubjectProgram(maxCanonicalBytes);
    assert.equal(isCompensationExecutionDeclaration(program.compensationExecution), true);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    const state = initializeCompensationExecutionState(program, initialState);
    assert.deepEqual(state.compensationTriggers, []);
    assert.deepEqual(state.compensationHandlerEffectWaits, []);
    assert.deepEqual(compensationExecutionStateDefects(program, state), []);
    assert.equal(isWellFormedRuntimeState(program, "", state), true);
  });
}

test("rejects execution byte limits outside the safe integer range seven through 65536", () => {
  for (const limit of [0, -1, 3, 4, 5, 6.5, 65_537, Number.MAX_SAFE_INTEGER + 1]) {
    const program = zeroSubjectProgram(limit);
    assert.equal(isCompensationExecutionDeclaration(program.compensationExecution), false, `${limit}`);
    assert.equal(isWellFormedSemanticProcessProgram(program), false, `${limit}`);
  }
});

test("preserves the two-byte minimum for the separate retention and snapshot arrays", () => {
  const program = {
    ...compensationSemanticProgram,
    compensationActivityRetention: {
      ...compensationSemanticProgram.compensationActivityRetention,
      limits: { maxRecords: 1, maxCanonicalBytes: 2 },
    },
    compensationEventSubProcessSnapshots: {
      ...compensationSemanticProgram.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 1, maxCanonicalBytes: 2 },
    },
  } satisfies SemanticProcessProgram;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const independentlyEncoded = Buffer.byteLength(JSON.stringify([]), "utf8");
  assert.equal(independentlyEncoded, 2);
  assert.equal(canonicalCompensationRecordsUtf8Bytes([]), independentlyEncoded);
  assert.equal(canonicalCompensationParentContextRetentionsUtf8Bytes([]), independentlyEncoded);
});

function zeroSubjectProgram(maxCanonicalBytes: number): SemanticProcessProgram {
  const {
    compensationActivityRetention: _retention,
    compensationEventSubProcessSnapshots: _snapshots,
    ...withoutSources
  } = compensationSemanticProgram;
  void _retention;
  void _snapshots;
  return {
    ...withoutSources,
    definitionScopes: withoutSources.definitionScopes.filter(
      ({ id }) => id !== compensationHandlerBScopeId,
    ),
    compensationExecution: {
      ...withoutSources.compensationExecution,
      subjects: [],
      dependencies: [],
      limits: { maxTriggers: 1, maxHandlers: 1, maxCanonicalBytes },
    },
  };
}
