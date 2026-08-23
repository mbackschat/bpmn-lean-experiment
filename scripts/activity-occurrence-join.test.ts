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
  "packages/semantic-core/src/flow-node-occurrence-retained-pairing.ts",
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
 * The Lean form of the same defect.
 *
 * `=` rather than `===`, and it must not match a *same-family* identity check. Those compare a wait's
 * activation against a submitted occurrence identity's, which is a wrong-identity refusal and not a
 * join, so the pattern requires both sides to end in `.activation` and excludes a right-hand side
 * naming a submitted identity parameter.
 *
 * That exclusion is line-scoped, and the closure review named the hole: a genuine cross-family join
 * written on a line that also mentions any excluded identifier evades this pattern. Naming the safe
 * operand instead, as the TypeScript pattern below does, narrows the trigger from three identifiers to
 * one exact line but does not close the hole either, because that line is still matched whole: a real
 * join written beside the safe comparison escapes both patterns. The enumeration is what carries the
 * rule in both languages, and the residual hole is recorded rather than claimed closed.
 */
const leanCrossFamilyJoin =
  /\.activation\s*=\s*(?!.*\b(?:timerId|taskId|submitted)\b)[A-Za-z_][\w.]*\.activation\b/u;

/**
 * A join across two counter families, written in TypeScript.
 *
 * The exclusion is the *left* operand, not the line. An earlier form excluded any line mentioning a
 * submitted identity, which is how the Lean pattern is written and which is wrong here: the join this
 * capsule removed was `entry.anchor.id.activation === timerId.activation`, so a whole-line exclusion
 * for `timerId` would have stopped flagging exactly the regression it exists to catch. The safe shape
 * is one line, named exactly, and it compares an element of the retained handler list against the
 * submitted deadline, which is an identity equality inside one family.
 *
 * Naming the operand narrows the hole the Lean pattern records rather than closing it: the safe line
 * is still matched whole, so a real join written on that same line escapes. The enumeration below
 * carries the rest of the rule while exempting nothing.
 */
const crossFamilyJoin = /\.activation\s*===\s*[A-Za-z_$][\w$.]*\.activation\b/u;

/** The one same-family identity comparison the enumerated owners are allowed to contain. */
const retainedListIdentity = /^\s*attached\.activation\s*===\s*timerId\.activation\b/u;

function joinsAcrossFamilies(line: string): boolean {
  return crossFamilyJoin.test(line) && !retainedListIdentity.test(line);
}

const recordLookup = /activityOccurrenceFor|activityBody(Task|Scope)|attachedTimers/u;

function lines(file: string): ReadonlyArray<string> {
  return readFileSync(path.join(projectRoot, file), "utf8").split("\n");
}

function joinSites(file: string): ReadonlyArray<string> {
  return lines(file).flatMap((line, index) =>
    joinsAcrossFamilies(line) ? [`${file}:${index + 1}`] : []
  );
}

test("every enumerated pairing owner resolves its pair through the ownership record", () => {
  assert.equal(
    pairingOwners.length,
    6,
    "four transition owners across three family runtimes, the open-set binding, the retained-pairing owner, and the completeness relation",
  );
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
    // The retained handler read: an identity equality inside one family, and the only safe shape.
    "    attached.activation === timerId.activation);",
    // The join this capsule removed. It mentions a submitted identity too, so a line-scoped
    // exclusion would have stopped catching its regression.
    "        entry.anchor.id.activation === timerId.activation &&",
  ];
  assert.deepEqual(
    sample.flatMap((line, index) => joinsAcrossFamilies(line) ? [index] : []),
    [0, 4],
    "the removed join stays flagged while the retained-list identity comparison does not",
  );
});
