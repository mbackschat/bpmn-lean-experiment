import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Both removal routes must clean every live owner-keyed runtime collection.
 *
 * Two routes remove a live owner *by filtering every collection*, and they classify by different keys.
 * Regional cancellation selects a scope occurrence and its descendants; called-instance removal
 * selects a process-instance closure, because a called root has no runtime parent and is therefore in
 * no subtree. A collection cleaned by one route and forgotten by the other is not a partial fix: it is
 * a state whose entries name owners that no longer exist, reachable only through the route that forgot
 * it, which is why such an omission survives every schedule the other route covers.
 *
 * `completeScope` also removes a scope occurrence and is deliberately not a third route here. It
 * removes only a quiescent occurrence, and quiescence excludes every owned wait, so there is nothing
 * for it to filter; a record that nonetheless survived would name a missing owner and trip the already
 * gated `DanglingWaitOwner`. Its withdrawal path refuses outright when the record is absent rather
 * than filtering collections, so this guard's shape does not describe it.
 *
 * The guard is source-derived because neither route is on the package surface and no registered
 * program composes regional cancellation with a Call Activity, so no executable schedule reaches the
 * called-instance filter. Deriving the required set from `RuntimeState` rather than listing it makes
 * this cover the class: a collection added to the state without a filter in both routes fails here,
 * and so does deleting an existing filter from either.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const runtimeStateOwner = "packages/semantic-core/src/semantic-process-state.ts";
const regionOwner = "packages/semantic-core/src/semantic-process-scope-cancellation.ts";
const calledOwner = "packages/semantic-core/src/semantic-process-call-runtime.ts";

const runtimeStateDeclaration = "export type RuntimeState = DeepReadonly<{";
const calledRemoval = "function removeCalledProcessTree(";
const regionRemoval = "function removeScopeOccurrenceRegion(";

/**
 * The `RuntimeState` fields no removal route filters, each with the reason it is not an omission.
 *
 * Monotonic fields are the substantive entries: activation counters and `endOccurrences` are
 * historical high-water marks, and a cancelled region's counts deliberately survive it so a later
 * occurrence of the same element cannot reuse a spent identity. Rewinding one would be the defect.
 */
const unfilteredFields = new Map([
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

/** The keys a span assigns or declares at its own depth, ignoring nested literals. */
function topLevelKeys(span: string): ReadonlySet<string> {
  const keys = new Set<string>();
  let depth = 0;
  for (const line of span.split("\n")) {
    const key = depth === 0 ? /^\s{2,4}(\w+):/.exec(line) : null;
    if (key?.[1] !== undefined) keys.add(key[1]);
    depth += depthDelta(line);
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
  const pattern = new RegExp(`^\\s{2,4}${field}:`);
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

function unfiltered(fields: ReadonlySet<string>, ...covered: ReadonlySet<string>[]): string[] {
  return [...fields].filter((field) =>
    !unfilteredFields.has(field) && !covered.some((keys) => keys.has(field))
  );
}

test("every live runtime collection is filtered by the called-instance removal", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  assert.ok(fields.has("activityOccurrences"), "RuntimeState fields were not parsed");
  const filtered = topLevelKeys(returnedLiteral(calledOwner, calledRemoval));
  assert.deepEqual(unfiltered(fields, filtered), []);
});

test("every live runtime collection is filtered by regional cancellation or its delegate", () => {
  const fields = topLevelKeys(braceSpan(read(runtimeStateOwner), runtimeStateDeclaration));
  const regionSource = read(regionOwner);
  // The region route reaches `calledProcessOccurrences` only through the delegate whose result it
  // spreads. Counting that as coverage is sound only while both the call and the spread are present.
  assert.match(regionSource, /const withoutCalledProcesses = removeCalledProcessSubtreesForCallers\(/);
  assert.match(regionSource, /\.\.\.withoutCalledProcesses,/);
  const filtered = topLevelKeys(braceSpan(braceSpan(regionSource, regionRemoval), "return {"));
  assert.deepEqual(unfiltered(fields, filtered, regionDelegatedFields), []);
});

test("no field claims an unfiltered reason while a route still filters it", () => {
  const filtered = new Set([
    ...topLevelKeys(returnedLiteral(calledOwner, calledRemoval)),
    ...topLevelKeys(returnedLiteral(regionOwner, regionRemoval)),
  ]);
  assert.deepEqual([...unfilteredFields.keys()].filter((field) => filtered.has(field)), []);
});

test("dropping one filtered collection from either route is reported", () => {
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
      unfiltered(fields, topLevelKeys(mutated), delegated),
      ["activityOccurrences"],
      relativePath,
    );
  }
});
