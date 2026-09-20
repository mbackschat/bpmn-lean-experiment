import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { CalledProcessOccurrence, RuntimeState, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";

const { calledProcessAssociationsAreValid, deriveCalledProcessInstanceId, removeCalledProcessSubtreesForCallers } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { compareCalledProcessOccurrences, compareScopeOccurrenceIds } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

for (const selectedIndex of [0, 1]) {
  test(`Call cleanup removes nested branch ${selectedIndex} while preserving the other three-edge path`, () => {
    const { program, state, start } = regionalPairFixture(Kind.ReturnProcess, Kind.ReturnProcess);
    const originals = state.calledProcessOccurrences;
    assert.equal(originals.length, 2);
    const nested = (caller: ScopeOccurrenceId, prototype: CalledProcessOccurrence): CalledProcessOccurrence => ({
      ...prototype, caller, id: { ...prototype.id, processInstanceId: caller.processInstanceId },
      calledRoot: { ...prototype.calledRoot, processInstanceId: deriveCalledProcessInstanceId(
        caller.processInstanceId, prototype.id.elementId, prototype.id.activation,
      ) },
    });
    const branches = originals.map((record, index) => {
      const child = nested(record.calledRoot, originals[1 - index]!);
      return [child, nested(child.calledRoot, record)];
    });
    const added = branches.flat();
    const before: RuntimeState = { ...state,
      calledProcessOccurrences: [...originals, ...added].sort(compareCalledProcessOccurrences),
      scopeOccurrences: [...state.scopeOccurrences, ...added.map(({ calledRoot }) => ({ id: calledRoot, parent: null }))]
        .sort((left, right) => compareScopeOccurrenceIds(left.id, right.id)),
    };
    const valid = (candidate: RuntimeState) => {
      assert.deepEqual(runtimeStateDefects(program, start.instanceId, candidate), []);
      assert.equal(calledProcessAssociationsAreValid(candidate), true);
      assert.notEqual(projectCurrentControlPositions(program, candidate), null);
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    valid(before);
    const selectedCaller = originals[selectedIndex]!.calledRoot;
    const after = removeCalledProcessSubtreesForCallers(before, [selectedCaller]);
    valid(after);
    const removed = branches[selectedIndex]!;
    assert.deepEqual(after.calledProcessOccurrences, before.calledProcessOccurrences.filter((record) => !removed.includes(record)));
    assert.deepEqual(after.scopeOccurrences, before.scopeOccurrences.filter(({ id }) =>
      !removed.some(({ calledRoot }) => calledRoot.processInstanceId === id.processInstanceId)));
    assert.equal(after.calledProcessOccurrences.length, 4);
    assert.deepEqual(after.controlTokens, before.controlTokens);
    assert.deepEqual(after.control, before.control);
    assert.deepEqual(after.callActivations, before.callActivations);
    const retainedPath = branches[1 - selectedIndex]!;
    for (const record of retainedPath) {
      assert.equal(calledProcessAssociationsAreValid({ ...after,
        calledProcessOccurrences: after.calledProcessOccurrences.filter((candidate) => candidate !== record) }), false);
      assert.equal(projectCurrentControlPositions(program, { ...after,
        scopeOccurrences: after.scopeOccurrences.filter(({ id }) => id !== record.calledRoot) }), null);
    }
    assert.equal(calledProcessAssociationsAreValid({ ...after,
      calledProcessOccurrences: [...after.calledProcessOccurrences, after.calledProcessOccurrences[0]!] }), false);
    assert.equal(calledProcessAssociationsAreValid({ ...after, calledProcessOccurrences: before.calledProcessOccurrences }), false);
    assert.deepEqual(removeCalledProcessSubtreesForCallers(before,
      [{ ...selectedCaller, activation: selectedCaller.activation + 1 }]), before);
  });
}
