import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";

const { returnCalledProcess } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { completeScope, onlyTokenOwner } = await import(
  new URL("../dist/semantic-process-scope-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-runtime.ts");
const { deriveInternalRegionalPreparation: prepare } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { throwError } = await import(
  new URL("../dist/semantic-process-error-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-error-runtime.ts");
const { sameScopeOccurrence } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

for (const kind of [Kind.ReturnProcess, Kind.CompleteScope] as const) {
  test(`${kind} continuation requires a declared output owned by its surviving caller or parent`, () => {
    const { program, state, start, branches } = regionalPairFixture(kind, Kind.CompleteScope);
    const operation = branches[0]!.selected;
    assert.ok(operation.kind === Kind.ReturnProcess || operation.kind === Kind.CompleteScope);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
    const before = structuredClone(state);
    const evaluate = (output: string) => operation.kind === Kind.ReturnProcess
      ? returnCalledProcess({ ...operation, callerOutput: output }, state)
      : completeScope({ ...operation, parentOutput: output }, state);
    const output = operation.kind === Kind.ReturnProcess ? operation.callerOutput : operation.parentOutput;
    assert.ok(output !== null);
    const after = evaluate(output);
    assert.ok(after !== null);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, after), []);
    assert.notEqual(projectCurrentControlPositions(program, after), null);
    assert.notEqual(prepare(program, state, operation), null);
    const continuation = after.controlTokens.find(({ placeId }) => placeId === output);
    assert.ok(continuation !== undefined);
    assert.ok(after.scopeOccurrences.some(({ id }) =>
      id.processInstanceId === continuation.owner.processInstanceId &&
      id.definitionScopeId === continuation.owner.definitionScopeId && id.activation === continuation.owner.activation));
    const other = branches[1]!.selected;
    assert.ok(other.kind === Kind.CompleteScope);
    const foreign = program.controlPlaceScopes.find(({ scopeId }) => scopeId === other.scopeId);
    assert.ok(foreign !== undefined);
    for (const wrong of [foreign.controlPlaceId, "undeclared:continuation"]) {
      const invalid = evaluate(wrong);
      assert.ok(invalid !== null, "the raw helper cannot validate a Program it does not receive");
      assert.deepEqual(runtimeStateDefects(program, start.instanceId, invalid), [],
        "this documented subset validator excludes token and scope binding");
      assert.equal(projectCurrentControlPositions(program, invalid), null);
      assert.deepEqual(invalid.scopeOccurrences, after.scopeOccurrences);
      assert.deepEqual(invalid.calledProcessOccurrences, after.calledProcessOccurrences);
      const rewritten: Extract<SemanticOperation, { kind: Kind.ReturnProcess | Kind.CompleteScope }> = operation.kind === Kind.ReturnProcess
        ? { ...operation, callerOutput: wrong } : { ...operation, parentOutput: wrong };
      assert.equal(prepare(program, state, rewritten), null, "operation identity does not admit a substituted payload");
      const changedProgram: SemanticProcessProgram = { ...program,
        operations: program.operations.map((candidate) => candidate.id === operation.id ? rewritten : candidate) };
      assert.equal(prepare(changedProgram, state, rewritten), null,
        "a declared operation still requires a valid continuation place binding");
    }
    assert.deepEqual(state, before);
  });
}

test("root completion requires the selected parentless scope to belong to the hosting Process", () => {
  const { program, state, start, branches } = regionalPairFixture(Kind.ReturnProcess, Kind.ReturnProcess);
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
  const rootCompletion = program.operations.find((operation) =>
    operation.kind === Kind.CompleteScope && operation.parentOutput === null);
  assert.ok(rootCompletion !== undefined && rootCompletion.kind === Kind.CompleteScope);
  for (const branch of branches) {
    assert.ok(branch.selected.kind === Kind.ReturnProcess);
    const invalid = completeScope({ ...rootCompletion, scopeId: branch.selected.calledRootScopeId }, state);
    assert.ok(invalid !== null, "the raw selector has no Program binding for the substituted scope");
    assert.equal(invalid.control.kind, "completed");
    assert.deepEqual(invalid.scopeOccurrences, []);
    assert.deepEqual(invalid.controlTokens, state.controlTokens);
    assert.deepEqual(invalid.calledProcessOccurrences, state.calledProcessOccurrences);
    assert.equal(projectCurrentControlPositions(program, invalid), null);
    assert.equal(prepare(program, state, { ...rootCompletion, scopeId: branch.selected.calledRootScopeId }), null);
  }
});

for (const otherKind of [Kind.ReturnProcess, Kind.CompleteScope] as const) {
  test(`Error continuation preserves its parent beside ${otherKind} and rejects a foreign output`, () => {
    const { program, state, start, branches } = regionalPairFixture(Kind.ThrowError, otherKind);
    const operation = branches[0]!.selected;
    assert.ok(operation.kind === Kind.ThrowError);
    const owner = onlyTokenOwner(state, operation.input);
    assert.ok(owner !== undefined);
    const root = state.scopeOccurrences.find(({ id }) => sameScopeOccurrence(id, owner));
    assert.ok(root !== undefined && root.parent !== null);
    const parent = root.parent;
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
    const predecessor = structuredClone(state);
    const after = throwError(operation, state, owner);
    assert.ok(after !== null);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, after), []);
    assert.notEqual(projectCurrentControlPositions(program, after), null);
    assert.notEqual(prepare(program, state, operation), null);
    assert.equal(after.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, root.id)), false);
    assert.ok(after.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, parent)));
    assert.deepEqual(after.controlTokens.find(({ placeId }) => placeId === operation.handler.output)?.owner, parent);
    assert.deepEqual(after.calledProcessOccurrences, state.calledProcessOccurrences);
    const foreign = program.controlPlaceScopes.find(({ scopeId }) => scopeId === branches[1]!.scopeId);
    assert.ok(foreign !== undefined);
    for (const wrong of [foreign.controlPlaceId, "undeclared:error-continuation"]) {
      const rewritten: Extract<SemanticOperation, { kind: Kind.ThrowError }> = {
        ...operation, handler: { ...operation.handler, output: wrong },
      };
      const invalid = throwError(rewritten, state, owner);
      assert.ok(invalid !== null);
      assert.deepEqual(invalid.scopeOccurrences, after.scopeOccurrences);
      assert.deepEqual(invalid.calledProcessOccurrences, after.calledProcessOccurrences);
      assert.equal(projectCurrentControlPositions(program, invalid), null);
      assert.equal(prepare(program, state, rewritten), null);
      const changedProgram: SemanticProcessProgram = { ...program,
        operations: program.operations.map((candidate) => candidate.id === operation.id ? rewritten : candidate) };
      assert.equal(prepare(changedProgram, state, rewritten), null);
    }
    assert.equal(throwError({ ...operation, handler: { ...operation.handler,
      attachedScopeId: root.parent.definitionScopeId } }, state, owner), null);
    assert.deepEqual(state, predecessor);
  });
}
