import assert from "node:assert/strict";
import test from "node:test";
import type { ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import type { InternalTransitionStateAtom } from "../src/internal-transition-footprint.ts";

type Ordering = typeof import("../src/internal-transition-footprint-ordering.ts");
const { canonicalUniqueStateAtoms, stateSetsAreDisjoint } = await import(
  new URL("../dist/internal-transition-footprint-ordering.js", import.meta.url).href
) as Ordering;
const { InternalTransitionStateAtomKind: Kind } = await import(
  new URL("../dist/internal-transition-footprint-vocabulary.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint-vocabulary.ts");
const owner = { processInstanceId: "called", definitionScopeId: "scope:Called", activation: 2 };
const scope = (selected: ScopeOccurrenceId): InternalTransitionStateAtom => ({ kind: Kind.ProcessInterfaceScope, owner: selected });
const input = (selected: ScopeOccurrenceId, dataInputId = "input"): InternalTransitionStateAtom =>
  ({ kind: Kind.ProcessInterfaceInput, owner: selected, dataInputId });

function disjoint(left: InternalTransitionStateAtom, right: InternalTransitionStateAtom, expected: boolean): void {
  assert.equal(stateSetsAreDisjoint([left], [right]), expected);
  assert.equal(stateSetsAreDisjoint([right], [left]), expected);
}

test("interface membership conflicts with any selected port only at the complete owner", () => {
  disjoint(scope(owner), input(owner), false);
  disjoint(scope(owner), input(owner, "another-port"), false);
  disjoint(input(owner), input(owner), false);
  disjoint(input(owner), input(owner, "another-port"), true);
  for (const other of [
    { ...owner, processInstanceId: "other" },
    { ...owner, definitionScopeId: "scope:Other" },
    { ...owner, activation: 3 },
  ]) {
    disjoint(scope(owner), input(other), true);
    disjoint(input(owner), input(other), true);
  }
});

test("interface atoms conflict with a region exactly when it contains their full owner", () => {
  const region: InternalTransitionStateAtom = { kind: Kind.OccurrenceRegion, region: { root: owner, members: [owner] } };
  disjoint(region, scope(owner), false);
  disjoint(region, input(owner), false);
  disjoint(region, scope({ ...owner, activation: 3 }), true);
  disjoint(region, input({ ...owner, processInstanceId: "foreign" }), true);
});

test("interface atom ordering preserves numeric owner activations and detects exact duplicates", () => {
  const earlier = input(owner);
  const later = input({ ...owner, activation: 10 });
  assert.deepEqual(canonicalUniqueStateAtoms([later, earlier]), [earlier, later]);
  assert.equal(canonicalUniqueStateAtoms([earlier, earlier]), null);
});
