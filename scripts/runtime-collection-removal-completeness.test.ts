import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Both removal routes must assign every live owner-keyed runtime collection: a structural census.
 *
 * Two routes remove a live owner by rebuilding every collection, and they classify by different keys.
 * Regional cancellation selects a scope occurrence and its descendants; called-instance removal
 * selects a process-instance closure, because a called root has no runtime parent and is therefore in
 * no subtree. A collection assigned by one route and forgotten by the other is not a partial fix: it
 * is a state whose entries name owners that no longer exist, reachable only through the route that
 * forgot it, which is why such an omission survives every schedule the other route covers.
 *
 * The census reads the keys each route's returned literal assigns, never the value assigned. A
 * collection passed through unchanged, or filtered by the wrong owner, therefore still counts as
 * covered; the "still passes the census" tests keep that limit executable. Whether a route removes the
 * records its owner closure names and keeps the others is owned by the behavioral
 * packages/semantic-core/test/removal-ownership-graph.test.ts, which runs the real functions.
 *
 * `completeScope` also removes a scope occurrence and is deliberately not a third route here. It
 * removes only a quiescent occurrence, and quiescence excludes every owned wait, so there is nothing
 * for it to rebuild; a record that nonetheless survived would name a missing owner and trip the already
 * gated `DanglingWaitOwner`. Its withdrawal path refuses outright when the record is absent rather
 * than rebuilding collections, so this guard's shape does not describe it.
 *
 * The census is source-derived because neither route is on the package surface and no registered
 * program composes regional cancellation with a Call Activity, so no executable schedule reaches the
 * called-instance route. Deriving the required set from `RuntimeState` rather than listing it makes
 * this cover the class: a collection added to the state without an assignment in both routes fails
 * here, and so does deleting an existing assignment from either.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const runtimeStateOwner = "packages/semantic-core/src/semantic-process-state.ts";
const regionOwner = "packages/semantic-core/src/semantic-process-scope-cancellation.ts";
const calledOwner = "packages/semantic-core/src/semantic-process-call-runtime.ts";

const runtimeStateDeclaration = "export type RuntimeState = DeepReadonly<{";
const calledRemoval = "function removeCalledProcessTree(";
const regionRemoval = "function removeScopeOccurrenceRegion(";

const leanRuntimeStateOwner = "BpmnSemantics/SemanticProcess/RuntimeState.lean";
const leanDataOwner = "BpmnSemantics/SemanticProcess/Data.lean";
const leanRemovalOwners = [
  ["BpmnSemantics/SemanticProcess/ScopeCancellation.lean", "def cancelScopeSubtree ("],
  ["BpmnSemantics/SemanticProcess/CallActivity.lean", "def removeCalledProcessTree ("],
] as const;

/**
 * The `RuntimeState` fields no removal route assigns, each with the reason it is not an omission.
 *
 * Monotonic fields are the substantive entries: activation counters and `endOccurrences` are
 * historical high-water marks, and a cancelled region's counts deliberately survive it so a later
 * occurrence of the same element cannot reuse a spent identity. Rewinding one would be the defect.
 */
const exemptFields = new Map([
  ["control", "scalar control state, not an owner-keyed collection"],
  ["initiationPending", "scalar admission flag, not an owner-keyed collection"],
  ["logicalTimeMs", "scalar clock, not an owner-keyed collection"],
  ["endOccurrences", "monotonic historical count, never rewound"],
  ["taskActivations", "monotonic high-water mark, never rewound"],
  ["messageActivations", "monotonic high-water mark, never rewound"],
  ["timerActivations", "monotonic high-water mark, never rewound"],
  ["eventRaceActivations", "monotonic high-water mark, never rewound"],
  ["callActivations", "monotonic high-water mark, never rewound"],
  ["effectActivations", "monotonic high-water mark, never rewound"],
  ["scopeActivations", "monotonic high-water mark, never rewound"],
  ["activityActivations", "monotonic high-water mark, never rewound"],
]);

/**
 * The one field regional cancellation delegates rather than filtering itself.
 *
 * Narrow on purpose. The delegate filters by a process-instance closure, not by subtree membership, so
 * crediting the region route with every field the delegate touches would accept a region that forgot a
 * collection whenever the delegate happened to name it under a different owner predicate.
 */
const regionDelegatedFields: ReadonlySet<string> = new Set(["calledProcessOccurrences"]);

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

/** The span from `open` through its matching close brace, exclusive of both delimiters. */
function braceSpan(source: string, open: string): string {
  const start = source.indexOf(open);
  assert.notEqual(start, -1, `absent: ${open}`);
  let depth = 0;
  for (let index = start + open.length - 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + open.length, index);
    }
  }
  assert.fail(`unbalanced: ${open}`);
}

/** Brace depth after a line, relative to the depth before it. */
function depthDelta(line: string): number {
  let delta = 0;
  for (const character of line) {
    if (character === "{" || character === "(" || character === "[") delta += 1;
    if (character === "}" || character === ")" || character === "]") delta -= 1;
  }
  return delta;
}

/**
 * The keys a span assigns or declares at its own depth.
 *
 * A direct conditional spread is also top-level ownership. Removal routes use that form for optional
 * collections because assigning `undefined` would add a property and change the historical wire
 * shape. Keys nested under an ordinary property or callback remain excluded.
 */
function topLevelKeys(span: string): ReadonlySet<string> {
  const keys = new Set<string>();
  let depth = 0;
  let optionalSpread = false;
  for (const line of span.split("\n")) {
    if (
      depth === 0 &&
      /^\s{2,4}\.\.\.\(/.test(line) &&
      line.includes("=== undefined")
    ) {
      optionalSpread = true;
    }
    const key = depth === 0 || (optionalSpread && depth === 2)
      ? /^\s{2,10}(\w+)\??:/.exec(line)
      : null;
    if (key?.[1] !== undefined) keys.add(key[1]);
    depth += depthDelta(line);
    if (depth === 0) optionalSpread = false;
  }
  return keys;
}

/** The body of the object literal a named function returns. */
function returnedLiteral(relativePath: string, signature: string): string {
  return braceSpan(braceSpan(read(relativePath), signature), "return {");
}

/**
 * The same literal with one field's whole assignment removed, however many lines it spans.
 *
 * A seeded mutation rather than a text search: the assignment's value nests parentheses and braces, so
 * a pattern narrow enough to match one field is also narrow enough to break on reformatting.
 */
function withoutField(span: string, field: string): string {
  const pattern = new RegExp(`^\\s{2,10}${field}:`);
  const kept: string[] = [];
  let depth = 0;
  let dropping = false;
  for (const line of span.split("\n")) {
    if (depth === 0 && pattern.test(line)) dropping = true;
    depth += depthDelta(line);
    if (!dropping) kept.push(line);
    if (depth === 0) dropping = false;
  }
  return kept.join("\n");
}

/** Renames one assigned key without changing its value, including inside an optional direct spread. */
function renamedField(span: string, field: string): string {
  return span.replace(
    new RegExp(`^(\\s{2,10})${field}:`, "m"),
    `$1omitted${field[0]?.toUpperCase()}${field.slice(1)}:`,
  );
}

function unassigned(fields: ReadonlySet<string>, ...covered: ReadonlySet<string>[]): string[] {
  return [...fields].filter((field) =>
    !exemptFields.has(field) && !covered.some((keys) => keys.has(field))
  );
}

function leanRuntimeFields(source: string): ReadonlySet<string> {
  return leanStructureFields(source, "RuntimeState");
}

function leanStructureFields(source: string, name: string): ReadonlySet<string> {
  const declaration = source.split(`structure ${name} where\n`)[1]?.split("\n  deriving")[0];
  assert.ok(declaration !== undefined, `Lean ${name} declaration was not parsed`);
  return new Set([...declaration.matchAll(/^  (\w+) :/gm)].map((match) => match[1]!));
}

function leanRemovalLiteral(source: string, signature: string): string {
  const body = source.split(signature)[1];
  assert.ok(body !== undefined, `absent: ${signature}`);
  return braceSpan(body, "{");
}

function leanAssignedFields(literal: string): ReadonlySet<string> {
  return new Set([...literal.matchAll(/^    (\w+) :=/gm)].map((match) => match[1]!));
}

function leanUnassigned(fields: ReadonlySet<string>, assigned: ReadonlySet<string>): string[] {
  return [...fields].filter((field) =>
    !exemptFields.has(field === "activations" ? "taskActivations" : field) &&
    !assigned.has(field)
  );
}

// The hosting caller's Property store survives regional removal; every other ScopedVariables
// collection has a removable owner (CALL-ACTIVITY-DATA-BOUNDARIES, runtime ownership contract).
function missingScopedCollections(
  declared: ReadonlySet<string>, assigned: ReadonlySet<string>,
): string[] {
  return [...declared].filter((field) => field !== "process" && !assigned.has(field));
}

for (const [owner, signature] of [
  [calledOwner, calledRemoval], [regionOwner, regionRemoval],
] as const) {
  test(`${owner} assigns every nested owner-keyed data collection`, () => {
    const declared = topLevelKeys(braceSpan(read(runtimeStateOwner), "export type ScopedVariables = DeepReadonly<{"));
    const literal = braceSpan(returnedLiteral(owner, signature), "variables: {");
    const assigned = topLevelKeys(literal);
    assert.ok(declared.has("activities") && declared.has("processInterfaces"));
    assert.deepEqual(missingScopedCollections(declared, assigned), []);
    assert.deepEqual(missingScopedCollections(new Set([...declared, "newOwnedData"]), assigned), ["newOwnedData"]);
    for (const field of declared) {
      if (field === "process") continue;
      const mutated = renamedField(literal, field);
      assert.notEqual(mutated, literal, `${owner}: ${field}`);
      assert.deepEqual(missingScopedCollections(declared, topLevelKeys(mutated)), [field]);
    }
  });
}

for (const [owner, signature] of leanRemovalOwners) {
  test(`${owner} assigns every nested owner-keyed data collection`, () => {
    const declared = leanStructureFields(read(leanDataOwner), "ScopedVariables");
    const literal = leanRemovalLiteral(read(owner), signature);
    const variables = literal.split("    variables :=")[1];
    assert.ok(variables !== undefined, `${owner}: absent variables assignment`);
    const assigned = new Set([...variables.matchAll(/^        (\w+) :=/gm)].map((match) => match[1]!));
    assert.ok(declared.has("activities") && declared.has("processInterfaces"));
    assert.deepEqual(missingScopedCollections(declared, assigned), []);
    assert.deepEqual(missingScopedCollections(new Set([...declared, "newOwnedData"]), assigned), ["newOwnedData"]);
    for (const field of declared) {
      if (field === "process") continue;
      const mutated = new Set([...assigned].filter((key) => key !== field));
      assert.deepEqual(missingScopedCollections(declared, mutated), [field]);
    }
  });
}

for (const [owner, signature] of leanRemovalOwners) {
  test(`${owner} assigns or exempts every live RuntimeState collection`, () => {
    const fields = leanRuntimeFields(read(leanRuntimeStateOwner));
    assert.ok(fields.has("compensationHandlerEffectWaits") && fields.has("activityOccurrences"));
    const assigned = leanAssignedFields(leanRemovalLiteral(read(owner), signature));
    assert.deepEqual(leanUnassigned(fields, assigned), [], owner);
  });
}

test("Lean assignment census discovers new fields and missing assignments independently", () => {
  const fields = leanRuntimeFields(read(leanRuntimeStateOwner));
  const extended = leanRuntimeFields(read(leanRuntimeStateOwner).replace(
    "structure RuntimeState where\n",
    "structure RuntimeState where\n  reviewOnlyLiveOwners : List ScopeOccurrenceId\n",
  ));
  for (const [owner, signature] of leanRemovalOwners) {
    const literal = leanRemovalLiteral(read(owner), signature);
    const assigned = leanAssignedFields(literal);
    const existingOmissions = leanUnassigned(fields, assigned);
    assert.deepEqual(
      leanUnassigned(extended, assigned), ["reviewOnlyLiveOwners", ...existingOmissions], owner,
    );
    for (const field of assigned) {
      if (!fields.has(field)) continue;
      const mutated = literal.replace(new RegExp(`^(    )${field} :=`, "m"), "$1omitted :=");
      assert.notEqual(mutated, literal, `${owner}: ${field}`);
      assert.deepEqual(
        leanUnassigned(fields, leanAssignedFields(mutated)),
        [...fields].filter((key) => key === field || existingOmissions.includes(key)),
        `${owner}: ${field}`,
      );
    }
  }
});

test("the called-instance removal assigns every live runtime collection", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  assert.ok(fields.has("activityOccurrences"), "RuntimeState fields were not parsed");
  assert.ok(
    fields.has("sequentialMultiInstanceControllers") &&
      fields.has("parallelMultiInstanceControllers"),
    "optional RuntimeState fields were not parsed",
  );
  const assigned = topLevelKeys(returnedLiteral(calledOwner, calledRemoval));
  assert.deepEqual(unassigned(fields, assigned), []);
});

test("regional cancellation or its delegate assigns every live runtime collection", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  const regionSource = read(regionOwner);
  // The region route reaches `calledProcessOccurrences` only through the delegate whose result it
  // spreads. Counting that as coverage is sound only while both the call and the spread are present.
  assert.match(regionSource, /const withoutCalledProcesses = removeCalledProcessSubtreesForCallers\(/);
  assert.match(regionSource, /\.\.\.withoutCalledProcesses,/);
  const assigned = topLevelKeys(braceSpan(braceSpan(regionSource, regionRemoval), "return {"));
  assert.deepEqual(unassigned(fields, assigned, regionDelegatedFields), []);
});

test("no exempt field is still assigned by a removal route", () => {
  const assigned = new Set([
    ...topLevelKeys(returnedLiteral(calledOwner, calledRemoval)),
    ...topLevelKeys(returnedLiteral(regionOwner, regionRemoval)),
  ]);
  assert.deepEqual([...exemptFields.keys()].filter((field) => assigned.has(field)), []);
});

test("dropping one assigned collection from either route is reported", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  const noDelegation: ReadonlySet<string> = new Set();
  for (const [relativePath, signature, delegated] of [
    [calledOwner, calledRemoval, noDelegation],
    [regionOwner, regionRemoval, regionDelegatedFields],
  ] as const) {
    const literal = returnedLiteral(relativePath, signature);
    const mutated = withoutField(literal, "activityOccurrences");
    assert.notEqual(mutated, literal, `seeded mutation matched nothing in ${relativePath}`);
    assert.deepEqual(
      unassigned(fields, topLevelKeys(mutated), delegated),
      ["activityOccurrences"],
      relativePath,
    );
  }
});

test("renaming either optional controller assignment is reported independently in both routes", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  const noDelegation: ReadonlySet<string> = new Set();
  for (const [relativePath, signature, delegated] of [
    [calledOwner, calledRemoval, noDelegation],
    [regionOwner, regionRemoval, regionDelegatedFields],
  ] as const) {
    const literal = returnedLiteral(relativePath, signature);
    for (const field of [
      "sequentialMultiInstanceControllers",
      "parallelMultiInstanceControllers",
    ] as const) {
      const mutated = renamedField(literal, field);
      assert.notEqual(mutated, literal, `seeded mutation matched no ${field} in ${relativePath}`);
      assert.deepEqual(
        unassigned(fields, topLevelKeys(mutated), delegated),
        [field],
        `${relativePath}: ${field}`,
      );
    }
  }
});

// The three tests below pin what this census cannot do. A mutant that keeps every key but filters
// nothing, or filters by the wrong owner, passes it; only the behavioral ownership-graph test fails it.
const routes = [
  [calledOwner, calledRemoval, new Set<string>()],
  [regionOwner, regionRemoval, regionDelegatedFields],
] as const;

test("a pass-through or inverted top-level assignment still passes the census", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  for (const [relativePath, signature, delegated] of routes) {
    const literal = returnedLiteral(relativePath, signature);
    for (const [mutant, assignment] of [
      ["pass-through", "activityOccurrences: state.activityOccurrences,"],
      ["inverted filter", "activityOccurrences: state.activityOccurrences.filter(({ owner }) => isRemoved(owner)),"],
    ] as const) {
      const mutated = `${withoutField(literal, "activityOccurrences")}\n    ${assignment}`;
      assert.notEqual(mutated, literal, `seeded mutation matched nothing in ${relativePath}`);
      assert.deepEqual(unassigned(fields, topLevelKeys(mutated), delegated), [], `${relativePath}: ${mutant}`);
    }
  }
});

test("a pass-through nested data assignment still passes the census", () => {
  const declared = topLevelKeys(braceSpan(read(runtimeStateOwner), "export type ScopedVariables = DeepReadonly<{"));
  for (const [owner, signature] of routes) {
    const literal = braceSpan(returnedLiteral(owner, signature), "variables: {");
    const mutated = `${withoutField(literal, "scopes")}\n      scopes: state.variables.scopes,`;
    assert.notEqual(mutated, literal, `seeded mutation matched nothing in ${owner}`);
    assert.deepEqual(missingScopedCollections(declared, topLevelKeys(mutated)), [], owner);
  }
});

test("a pass-through or inverted Lean assignment still passes the census", () => {
  const fields = leanRuntimeFields(read(leanRuntimeStateOwner));
  for (const [owner, signature] of leanRemovalOwners) {
    const literal = leanRemovalLiteral(read(owner), signature);
    const existingOmissions = leanUnassigned(fields, leanAssignedFields(literal));
    for (const [mutant, pattern, replacement] of [
      ["pass-through", /^(    eventRaces := state\.eventRaces)\.filter[^\n]*/m, "$1"],
      ["inverted filter", /^(    eventRaces := state\.eventRaces\.filter fun race => )!/m, "$1"],
    ] as const) {
      const mutated = literal.replace(pattern, replacement);
      assert.notEqual(mutated, literal, `seeded mutation matched nothing in ${owner}`);
      assert.deepEqual(leanUnassigned(fields, leanAssignedFields(mutated)), existingOmissions, `${owner}: ${mutant}`);
    }
  }
});

test("the behavioral owner of the filtering claim exists", () => {
  assert.doesNotThrow(() => read("packages/semantic-core/test/removal-ownership-graph.test.ts"));
});
