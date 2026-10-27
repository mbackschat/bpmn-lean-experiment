import assert from "node:assert/strict";
import { test } from "node:test";
import { VariableValueKind as Value } from "@bpmn-lean/semantic-core";
import type { RuntimeScopeOccurrence, ScopedVariables, ScopeOccurrenceId, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { SemanticProfileId } from "../src/semantic-profile-catalog.ts";
const { readNestedScopeVariable, writeNestedScopeVariables } =
  await import(new URL("../dist/nested-scope-data.js", import.meta.url).href) as typeof import("../src/nested-scope-data.ts");

/**
 * CSD-CHAIN-01 and CSD-ISOLATE-01 of the concurrent scope data proposal: resolution walks the performing occurrence's
 * live parent chain and selects each frame by exact owner, so two live occurrences of one declaring definition are
 * separate owners. The definition-chain account refused this state because one definition had two live frames.
 */
const instance = "claim";
const occurrence = (definitionScopeId: string, activation: number): ScopeOccurrenceId =>
  ({ processInstanceId: instance, definitionScopeId, activation });
const root = occurrence("root", 1);
const handle = occurrence("handle", 1);
const firstPrice = occurrence("price", 1);
const secondPrice = occurrence("price", 2);
const occurrences: readonly RuntimeScopeOccurrence[] = [
  { id: root, parent: null }, { id: handle, parent: root },
  { id: firstPrice, parent: handle }, { id: secondPrice, parent: handle },
];
const program = {
  identity: { semanticProfile: SemanticProfileId.NestedEmbeddedScopeData },
  definitionScopes: [
    { id: "root", parentScopeId: null }, { id: "handle", parentScopeId: "root" }, { id: "price", parentScopeId: "handle" },
  ],
  scopeLocalData: [{ scopeId: "price", localInputs: [], localOutputs: [] }],
  operations: [],
} as unknown as SemanticProcessProgram;
const string = (value: string) => ({ kind: Value.String, value } as const);
const variables: ScopedVariables = {
  process: { bindings: [{ name: "adjuster", value: string("desk") }] },
  scopes: [
    { owner: firstPrice, bindings: [{ name: "adjuster", value: { kind: Value.Null } }, { name: "estimate", value: string("pending") }] },
    { owner: secondPrice, bindings: [{ name: "adjuster", value: { kind: Value.Null } }, { name: "estimate", value: string("4200") }] },
  ],
  activities: [],
};

test("each live occurrence of one definition reads its own frame", () => {
  assert.deepEqual(readNestedScopeVariable(program, occurrences, variables, firstPrice, "estimate"), string("pending"));
  assert.deepEqual(readNestedScopeVariable(program, occurrences, variables, secondPrice, "estimate"), string("4200"));
  assert.deepEqual(readNestedScopeVariable(program, occurrences, variables, secondPrice, "adjuster"), { kind: Value.Null });
  assert.deepEqual(readNestedScopeVariable(program, occurrences, variables, handle, "adjuster"), string("desk"));
});

test("a write changes only the frame on the writer's chain, never a sibling occurrence", () => {
  const written = writeNestedScopeVariables(program, occurrences, variables, secondPrice, [{ name: "estimate", value: string("4300") }]);
  assert.ok(written);
  assert.deepEqual(readNestedScopeVariable(program, occurrences, written, secondPrice, "estimate"), string("4300"));
  assert.deepEqual(written.scopes[0], variables.scopes[0]);
  assert.deepEqual(written.process, variables.process);
});

test("a chain through an occurrence that is not live refuses instead of skipping it", () => {
  const orphaned = occurrences.filter(({ id }) => id !== handle);
  assert.equal(readNestedScopeVariable(program, orphaned, variables, secondPrice, "adjuster"), undefined);
});
