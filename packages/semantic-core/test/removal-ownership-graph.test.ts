/**
 * The removal routes must delete exactly the records their owner closure names, in every collection.
 *
 * The oracle is behavioral: each real removal function runs over a state that holds, in every
 * owner-keyed collection, records inside the removed owner and records outside it. A pass-through
 * filter leaves the inside records; an inverted filter removes the outside ones; either is reported
 * against the collection it broke. [runtime-collection-removal-completeness](../../../scripts/runtime-collection-removal-completeness.test.ts)
 * only checks that each route assigns every collection, so this file owns the filtering claim.
 *
 * Historical facts are not owner-keyed and must survive every route: activation counters, the end
 * count (which only Terminate advances), logical time, control and the Process-scope bindings.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import { SemanticOperationKind, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation } from "@bpmn-lean/semantic-core";

import { labelOf, owners, ownershipGraphState } from "./removal-ownership-graph-fixture.ts";
import type { OwnerLabel } from "./removal-ownership-graph-fixture.ts";

const { removeScopeOccurrenceContents, removeScopeOccurrenceSubtree } = await import(
  new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-cancellation.ts");
const { removeCalledProcessSubtreesForCallers } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { terminateScope } = await import(
  new URL("../dist/semantic-process-termination-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-termination-runtime.ts");

const topLevelCollections = [
  "scopeOccurrences", "controlTokens", "userTaskWaits", "messageWaits",
  "eventSubProcessMessageSubscriptions", "timerWaits", "effectWaits", "effectIncidents",
  "selectedBranchSets", "eventRaces", "calledProcessOccurrences", "activityOccurrences",
  "sequentialMultiInstanceControllers", "sequentialScopeControllers", "parallelScopeControllers",
  "parallelMultiInstanceControllers", "compensationActivityRetentions",
  "compensationParentContextRetentions", "compensationTriggers", "compensationHandlerEffectWaits",
] as const;
const variableCollections = ["activities", "processInterfaces", "scopes"] as const;

/** Snapshot-owned data whose record for the attached root outlives a retained-root removal. */
const retainRootRecord = new Set([
  "scopeOccurrences", "compensationParentContextRetentions",
  "variables.processInterfaces", "variables.scopes",
]);

type Collection = Readonly<{
  name: string;
  read: (state: RuntimeState) => ReadonlyArray<object>;
  write: (state: RuntimeState, records: ReadonlyArray<object>) => RuntimeState;
}>;

function records(value: unknown): ReadonlyArray<object> {
  return Array.isArray(value) ? value : [];
}

// `write` replaces one collection with an arbitrary record list, which is exactly the shape of a
// pass-through or inverted mutant; the computed key is deliberately not checked against its field.
const collections: ReadonlyArray<Collection> = [
  ...topLevelCollections.map((key) => ({
    name: key,
    read: (state: RuntimeState) => records(state[key]),
    write: (state: RuntimeState, replacement: ReadonlyArray<object>): RuntimeState =>
      ({ ...state, [key]: replacement }),
  })),
  ...variableCollections.map((key) => ({
    name: `variables.${key}`,
    read: (state: RuntimeState) => records(state.variables[key]),
    write: (state: RuntimeState, replacement: ReadonlyArray<object>): RuntimeState =>
      ({ ...state, variables: { ...state.variables, [key]: replacement } }),
  })),
];

type Route = Readonly<{
  name: string;
  removed: ReadonlySet<OwnerLabel>;
  /** Whether the attached root keeps its snapshot-owned records. */
  retainsRoot: boolean;
  endOccurrenceDelta: number;
  run: (state: RuntimeState) => RuntimeState;
}>;

const regionClosure: ReadonlySet<OwnerLabel> = new Set(["region", "descendant", "calledIn", "calledNested"]);

const terminateOperation: Extract<SemanticOperation, { kind: SemanticOperationKind.TerminateScope }> = {
  id: "terminate-region",
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Terminate" },
  kind: SemanticOperationKind.TerminateScope,
  input: "place:in",
  scopeId: owners.region.definitionScopeId,
};

const routes: ReadonlyArray<Route> = [
  {
    name: "regional cancellation (subtree)", removed: regionClosure, retainsRoot: false, endOccurrenceDelta: 0,
    run: (state) => removeScopeOccurrenceSubtree(state, { id: owners.region, parent: owners.root }),
  },
  {
    name: "retained-root contents removal", removed: regionClosure, retainsRoot: true, endOccurrenceDelta: 0,
    run: (state) => removeScopeOccurrenceContents(state, { id: owners.region, parent: owners.root }),
  },
  {
    name: "Terminate End", removed: regionClosure, retainsRoot: true, endOccurrenceDelta: 1,
    run: (state) => {
      const terminated = terminateScope(terminateOperation, state, owners.region);
      assert.ok(terminated !== null, "the fixture must satisfy Terminate's selection");
      return terminated;
    },
  },
  {
    name: "called-instance removal", removed: new Set(["calledIn", "calledNested"]), retainsRoot: false,
    endOccurrenceDelta: 0,
    run: (state) => removeCalledProcessSubtreesForCallers(state, [owners.descendant]),
  },
];

const historicalFacts = [
  "control", "initiationPending", "logicalTimeMs", "taskActivations", "messageActivations",
  "timerActivations", "eventRaceActivations", "callActivations", "effectActivations",
  "scopeActivations", "activityActivations",
] as const;

function labels(list: ReadonlyArray<object>): string {
  return list.map(labelOf).join(",");
}

function survivors(route: Route, collection: Collection, before: RuntimeState): ReadonlyArray<object> {
  return collection.read(before).filter((record) => {
    const label = labelOf(record);
    return label === "?" || !route.removed.has(label) ||
      (route.retainsRoot && label === "region" && retainRootRecord.has(collection.name));
  });
}

/** One finding per collection whose survivors differ from the route's owner closure, plus history. */
function removalFindings(route: Route, before: RuntimeState, after: RuntimeState): ReadonlyArray<string> {
  const findings: string[] = [];
  for (const collection of collections) {
    const expected = survivors(route, collection, before);
    const actual = collection.read(after);
    if (actual.length !== expected.length || actual.some((record, index) => record !== expected[index])) {
      findings.push(`${collection.name}: kept [${labels(actual)}], expected [${labels(expected)}]`);
    }
  }
  for (const fact of historicalFacts) {
    if (!isDeepStrictEqual(after[fact], before[fact])) findings.push(`${fact}: changed`);
  }
  if (!isDeepStrictEqual(after.variables.process, before.variables.process)) {
    findings.push("variables.process: changed");
  }
  if (after.endOccurrences !== before.endOccurrences + route.endOccurrenceDelta) {
    findings.push(`endOccurrences: ${after.endOccurrences}, expected ${before.endOccurrences + route.endOccurrenceDelta}`);
  }
  return findings;
}

for (const route of routes) {
  test(`${route.name} removes exactly its owner closure from every collection`, () => {
    const before = ownershipGraphState();
    const snapshot = structuredClone(before);
    const after = route.run(before);
    assert.deepEqual(removalFindings(route, before, after), []);
    assert.deepEqual(before, snapshot, "the removal must not mutate its input state");
  });
}

test("the fixture populates every collection and gives every route a removed and a surviving record", () => {
  const before = ownershipGraphState();
  const arrayFields = (value: object) =>
    Object.entries(value).filter(([, field]) => Array.isArray(field)).map(([key]) => key).sort();
  assert.deepEqual(
    arrayFields(before).filter((key) => !key.endsWith("Activations")),
    [...topLevelCollections].sort(),
    "every array-valued RuntimeState field must be a catalogued collection",
  );
  assert.deepEqual(arrayFields(before.variables), [...variableCollections].sort());
  for (const route of routes) {
    for (const collection of collections) {
      const all = collection.read(before);
      const kept = survivors(route, collection, before);
      assert.ok(kept.length > 0, `${route.name}: ${collection.name} has no surviving record`);
      assert.ok(kept.length < all.length, `${route.name}: ${collection.name} has no removed record`);
    }
  }
});

test("the census rejects a pass-through and an inverted result for each collection in each route", () => {
  for (const route of routes) {
    const before = ownershipGraphState();
    const after = route.run(before);
    assert.deepEqual(removalFindings(route, before, after), [], route.name);
    for (const collection of collections) {
      const everything = collection.read(before);
      const kept = collection.read(after);
      const passThrough = collection.write(after, everything);
      const inverted = collection.write(after, everything.filter((record) => !kept.includes(record)));
      for (const [mutant, state] of [["pass-through", passThrough], ["inverted", inverted]] as const) {
        const findings = removalFindings(route, before, state);
        assert.equal(findings.length, 1, `${route.name} ${mutant} ${collection.name}: ${findings.join("; ")}`);
        assert.ok(findings[0]?.startsWith(`${collection.name}:`), `${route.name} ${mutant} ${collection.name}`);
      }
    }
  }
});
