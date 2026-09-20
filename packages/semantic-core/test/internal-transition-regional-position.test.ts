import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";

const { removeScopeOccurrenceContents, removeScopeOccurrenceSubtree } = await import(
  new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-cancellation.ts");

for (const other of [Kind.ReturnProcess, Kind.ThrowError] as const) {
  for (const retain of [false, true]) {
    test(`child cancellation ${retain ? "retains" : "removes"} its root beside ${other} without orphaning position`, () => {
      const { program, state: before, start, branches } = regionalPairFixture(Kind.ThrowError, other);
      const selected = before.scopeOccurrences.find(({ id }) => id.definitionScopeId === branches[0]!.scopeId)!;
      const roots = before.scopeOccurrences.filter(({ parent }) => parent === null);
      assert.ok(selected.parent !== null);
      assert.equal(isWellFormedSemanticProcessProgram(program), true);
      assert.equal(supportsSemanticProcessExecution(start, program), false);
      const valid = (state: RuntimeState) => {
        assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
        assert.notEqual(projectCurrentControlPositions(program, state), null);
      };
      valid(before);
      const after = retain ? removeScopeOccurrenceContents(before, selected)
        : removeScopeOccurrenceSubtree(before, selected);
      valid(after);
      assert.deepEqual(after.scopeOccurrences.filter(({ parent }) => parent === null), roots);
      assert.deepEqual(after.calledProcessOccurrences, before.calledProcessOccurrences);
      assert.deepEqual(after.control, before.control);
      assert.equal(after.scopeOccurrences.includes(selected), retain);
      assert.ok(after.controlTokens.length > 0);

      const rejects = (state: RuntimeState) => assert.equal(projectCurrentControlPositions(program, state), null);
      for (const root of roots) {
        rejects({ ...after, scopeOccurrences: after.scopeOccurrences.filter((scope) => scope !== root) });
      }
      const token = after.controlTokens[0]!;
      rejects({ ...after, controlTokens: [{ ...token,
        owner: { ...token.owner, activation: token.owner.activation + 1000 } }, ...after.controlTokens.slice(1)] });
      rejects({ ...after, scopeOccurrences: [...after.scopeOccurrences, roots[0]!] });
      if (retain) {
        rejects({ ...after, scopeOccurrences: after.scopeOccurrences.map((scope) => scope === selected
          ? { ...scope, parent: { ...selected.parent!, activation: selected.parent!.activation + 1000 } }
          : scope) });
      }
      if (after.calledProcessOccurrences.length > 0) rejects({ ...after, calledProcessOccurrences: [] });
      const hostingRoot = roots.find(({ id }) => id.processInstanceId === start.instanceId)!;
      assert.ok(hostingRoot !== undefined);
      rejects(removeScopeOccurrenceSubtree(before, hostingRoot));
    });
  }
}
