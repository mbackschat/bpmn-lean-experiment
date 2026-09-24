import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome,
  SemanticOperationKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
  projectOpenFlowNodeOccurrences,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  boundedScopeProgram,
  childOccurrence,
  childScopeId,
  rootOccurrence,
  start,
} from "./bounded-scope-fixture.ts";

const { addToken } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { removeScopeOccurrenceContents, removeScopeOccurrenceSubtree } = await import(
  new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-cancellation.ts");
const { deriveInternalRegionalPreparation, applyPreparedInternalRegionalTransition } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveRegionalReferenceRetention } = await import(
  new URL("../dist/internal-transition-regional-ownership.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-ownership.ts");

function armed(): RuntimeState {
  const result = applyStimulus(boundedScopeProgram, initialState, start);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function assertProjectable(program: SemanticProcessProgram, state: RuntimeState): void {
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
}

// ESL-RETAIN-01 exercises the existing evaluator's ownership boundary. This constructed
// composition is not admitted by the predecessor profile; new-profile source evidence is separate.
function terminationReady() {
  const childEnd = boundedScopeProgram.operations.find(({ id }) => id === "operation:ChildEnd");
  assert.ok(childEnd?.kind === SemanticOperationKind.ReachNoneEnd);
  const terminate: Extract<SemanticOperation, { kind: SemanticOperationKind.TerminateScope }> = {
    ...childEnd, kind: SemanticOperationKind.TerminateScope, scopeId: childScopeId,
  };
  const program: SemanticProcessProgram = {
    ...boundedScopeProgram,
    operations: boundedScopeProgram.operations.map((operation) =>
      operation.id === childEnd.id ? terminate : operation),
  };
  const before = armed();
  const outside = program.operations.find(({ id }) => id === "operation:EscalationTask");
  assert.ok(outside?.kind === SemanticOperationKind.AwaitUserTask);
  const spawned = applyInternalOperationStep(program, outside, {
    ...before, controlTokens: addToken(before.controlTokens, outside.input, rootOccurrence),
  });
  assert.ok(spawned !== null);
  const state: RuntimeState = {
    ...spawned.successor,
    userTaskWaits: spawned.successor.userTaskWaits.filter(({ owner }) =>
      owner.definitionScopeId !== childScopeId),
    controlTokens: addToken(spawned.successor.controlTokens, terminate.input, childOccurrence),
  };
  assertProjectable(program, state);
  return { program, state, terminate };
}

test("retaining child contents preserves its parent-owned Activity and deadline while cancelling its work", () => {
  const state = armed();
  const child = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === childScopeId);
  assert.ok(child !== undefined);
  const after = removeScopeOccurrenceContents(state, child);
  assert.deepEqual(after.activityOccurrences, state.activityOccurrences);
  assert.deepEqual(after.timerWaits, state.timerWaits);
  assert.deepEqual(after.scopeOccurrences, state.scopeOccurrences);
  assert.deepEqual(after.userTaskWaits, []);
  assert.deepEqual(after.activityActivations, state.activityActivations);
  assert.deepEqual(after.timerActivations, state.timerActivations);
  assertProjectable(boundedScopeProgram, after);
});

test("inner Terminate retains the exact body pair until ordinary completion and preserves outside handlers", () => {
  const { program, state, terminate } = terminationReady();
  const terminated = applyInternalOperationStep(program, terminate, state);
  assert.ok(terminated !== null);
  const after = terminated.successor;
  assert.deepEqual(after.activityOccurrences, state.activityOccurrences);
  assert.deepEqual(after.timerWaits, state.timerWaits);
  assert.deepEqual(after.userTaskWaits, state.userTaskWaits);
  assert.deepEqual(after.scopeOccurrences, state.scopeOccurrences);
  assert.equal(after.endOccurrences, state.endOccurrences + 1);
  assertProjectable(program, after);

  const completion = program.operations.find((operation) =>
    operation.kind === SemanticOperationKind.CompleteScope && operation.scopeId === childScopeId);
  assert.ok(completion !== undefined);
  const completed = applyInternalOperationStep(program, completion, after);
  assert.ok(completed !== null);
  assert.deepEqual(completed.successor.activityOccurrences, []);
  assert.deepEqual(completed.successor.timerWaits, []);
  assert.deepEqual(completed.successor.userTaskWaits, state.userTaskWaits);
  assert.deepEqual(completed.successor.controlTokens, [
    { placeId: "place:Flow_Normal", owner: rootOccurrence, multiplicity: 1 },
  ]);
  assertProjectable(program, completed.successor);
});

test("prepared Terminate retains the same body and handlers as execution", () => {
  const { program, state, terminate } = terminationReady();
  const prepared = deriveInternalRegionalPreparation(program, state, terminate);
  assert.ok(prepared !== null);
  const keep = deriveRegionalReferenceRetention(state, prepared.selection);
  assert.ok(state.activityOccurrences.every(keep.activity));
  assert.ok(state.timerWaits.every(keep.timer));
  const after = applyPreparedInternalRegionalTransition(program, state, prepared);
  assert.ok(after !== null);
  assert.deepEqual(after.activityOccurrences, state.activityOccurrences);
  assert.deepEqual(after.timerWaits, state.timerWaits);
  assert.deepEqual(after, applyInternalOperationStep(program, terminate, state)?.successor);
  assertProjectable(program, after);
});

for (const removeRoot of [false, true]) {
  test(`${removeRoot ? "removing" : "retaining"} the containing root withdraws the child body and its attachment`, () => {
    const state = armed();
    const root = state.scopeOccurrences.find(({ parent }) => parent === null);
    assert.ok(root !== undefined);
    const after = removeRoot
      ? removeScopeOccurrenceSubtree(state, root)
      : removeScopeOccurrenceContents(state, root);
    assert.deepEqual(after.activityOccurrences, []);
    assert.deepEqual(after.timerWaits, []);
    assert.deepEqual(after.userTaskWaits, []);
    assert.deepEqual(after.scopeOccurrences, removeRoot ? [] : [root]);
    assert.deepEqual(after.scopeActivations, state.scopeActivations);
  });
}

test("removing the child itself still withdraws the parent-owned Activity and deadline", () => {
  const state = armed();
  const child = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === childScopeId);
  assert.ok(child !== undefined);
  const after = removeScopeOccurrenceSubtree(state, child);
  assert.deepEqual(after.activityOccurrences, []);
  assert.deepEqual(after.timerWaits, []);
  assert.deepEqual(after.userTaskWaits, []);
  assert.deepEqual(after.scopeOccurrences, state.scopeOccurrences.filter((scope) => scope !== child));
  assert.deepEqual(after.scopeActivations, state.scopeActivations);
  assertProjectable(boundedScopeProgram, after);
});
