import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The owners that pair an Activity's body with a handler attached to it must read the ownership record.
 *
 * `taskActivations` is keyed by task element, `scopeActivations` by definition scope, and
 * `timerActivations` by Timer element. Two of them agree only while each of their elements is armed
 * once per arming of the other, and nothing in `RuntimeState` asserted that. Six sites spent three
 * different keys on that one agreement, and none reported an ambiguity when it broke: each silently
 * found a different sibling or none.
 *
 * Both languages are enumerated. The Lean families were migrated after this guard was first written,
 * and while they were not, this guard covered TypeScript only and said so, because a rule enforced over
 * one language while asserted over two is the gap the checkpoint review found. The Lean patterns differ
 * only in syntax: an equality rather than a strict comparison, and `=` rather than `===`.
 *
 * The owner list is enumerated rather than discovered, and that limit is the honest part. A cross-family
 * join and a same-family identity helper are lexically identical — both compare two `.activation`
 * expressions, and both may compare an element field in the same predicate; what separates them is
 * whether the element came from the program or from the other identity. A repository-wide pattern
 * therefore cannot express this rule without an allowlist of unrelated helpers, which would be noise.
 * Enumerating the pairing owners states the claim the capsule actually makes, and the cost is that a
 * newly written pairing owner is not covered until it is added here.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** The owners that resolve a boundary handler to the Activity occurrence it is attached to. */
const pairingOwners = [
  "packages/semantic-core/src/semantic-process-bounded-task-runtime.ts",
  "packages/semantic-core/src/semantic-process-monitored-task-runtime.ts",
  "packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts",
  "packages/semantic-core/src/flow-node-occurrence-open-set.ts",
  "packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts",
] as const;

/** The Lean family modules that recover a body-to-handler pair. */
const leanPairingOwners = [
  "BpmnSemantics/SemanticProcess/BoundedTask.lean",
  "BpmnSemantics/SemanticProcess/MonitoredTask.lean",
  "BpmnSemantics/SemanticProcess/BoundedScope.lean",
] as const;

const leanRecordLookup = /activityOccurrenceFor|activityBody(Task|Scope)\?|RecordJoins/u;

/**
 * A join across two counter families, written in TypeScript.
 *
 * The right-hand exclusion is the same one the Lean pattern carries and for the same reason: comparing
 * a retained identity's activation against a *submitted* occurrence identity's is an identity equality,
 * not a join. The publication relation's retained handler lookup is exactly that shape, and before this
 * exclusion existed on both sides the enumeration had to exempt that owner instead.
 *
 * It inherits the recorded hole too: the exclusion is line-scoped, so a genuine cross-family join on a
 * line that also mentions an excluded identifier evades the pattern. The enumeration below is what
 * carries the rule, and it now exempts nothing.
 */
const crossFamilyJoin =
  /\.activation\s*===\s*(?!.*\b(?:timerId|taskId|submitted)\b)[A-Za-z_$][\w$.]*\.activation\b/u;
/**
 * The Lean form of the same defect.
 *
 * `=` rather than `===`, and it must not match a *same-family* identity check. Those compare a wait's
 * activation against a submitted occurrence identity's, which is a wrong-identity refusal and not a
 * join, so the pattern requires both sides to end in `.activation` and excludes a right-hand side
 * naming a submitted identity parameter.
 *
 * That exclusion is line-scoped, and the closure review named the hole: a genuine cross-family join written on a line that
 * also mentions any excluded identifier evades this pattern. The alternative, matching across lines, would need a parser for
 * a claim an enumeration already bounds, so the hole is recorded rather than closed and the enumeration is what carries the
 * rule.
 */
const leanCrossFamilyJoin =
  /\.activation\s*=\s*(?!.*\b(?:timerId|taskId|submitted)\b)[A-Za-z_][\w.]*\.activation\b/u;
/**
 * Evidence that an owner actually pairs through the record rather than pairing nothing.
 *
 * Two shapes count. Most owners hold runtime state and call a record lookup. The publication
 * completeness relation holds none, so it reads `attachedTimers`, the record's own field, from the
 * accumulator's retained copy. Both are the record; the second is one step removed, and admitting only
 * the first is what forced this owner to be exempted from the rule instead of covered by it.
 */
const recordLookup = /activityOccurrenceFor|activityBody(Task|Scope)|attachedTimers/u;

function lines(file: string): ReadonlyArray<string> {
  return readFileSync(path.join(projectRoot, file), "utf8").split("\n");
}

function joinSites(file: string): ReadonlyArray<string> {
  return lines(file).flatMap((line, index) =>
    crossFamilyJoin.test(line) ? [`${file}:${index + 1}`] : []
  );
}

test("every enumerated pairing owner resolves its pair through the ownership record", () => {
  assert.equal(pairingOwners.length, 5, "four transition owners plus the publication binding");
  assert.deepEqual(pairingOwners.flatMap(joinSites), []);
  for (const owner of pairingOwners) {
    // Anti-vacuity: a file with no join and no lookup would satisfy the assertion above while pairing
    // nothing, which is what a botched migration or a moved function looks like.
    assert.ok(
      lines(owner).some((line) => recordLookup.test(line)),
      `${owner} must resolve its pair through the record`,
    );
  }
});

test("every Lean family module resolves its pair through the ownership record", () => {
  for (const owner of leanPairingOwners) {
    assert.deepEqual(
      lines(owner).flatMap((line, index) =>
        leanCrossFamilyJoin.test(line) ? [`${owner}:${index + 1}`] : []
      ),
      [],
    );
    // Anti-vacuity, for the same reason the TypeScript loop carries it: a module that pairs nothing
    // satisfies the assertion above, and two of these modules held no record reference at all before
    // the migration.
    assert.ok(
      lines(owner).some((line) => leanRecordLookup.test(line)),
      `${owner} must resolve its pair through the record`,
    );
  }
});

test("the Lean pattern separates a cross-family join from a same-family identity check", () => {
  const sample = [
    "      timer.activation = task.activation ∧",
    "        wait.activation = timerId.activation)",
    "  let activityActivation := activityActivationCount state task.id + 1",
  ];
  assert.deepEqual(
    sample.flatMap((line, index) => leanCrossFamilyJoin.test(line) ? [index] : []),
    [0],
  );
});

test("the pattern separates a cross-family join from a cardinality check", () => {
  const sample = [
    "  candidate.id.activation === wait.id.activation &&",
    "  entry.anchor.id.activation === 1 &&",
    "  left.activation - right.activation;",
    // The retained handler lookup: an identity equality against a submitted Timer identity.
    "    attached.activation === timerId.activation);",
  ];
  assert.deepEqual(
    sample.flatMap((line, index) => crossFamilyJoin.test(line) ? [index] : []),
    [0],
    "only the cross-family join matches, and the submitted-identity comparison does not",
  );
});
