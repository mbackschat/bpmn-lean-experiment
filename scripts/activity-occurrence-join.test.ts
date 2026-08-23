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

/**
 * The one exempt owner, and why it is exempt rather than migrated.
 *
 * The publication completeness relation is an *independent* reconstruction: its own contract says it
 * pairs through the private retained anchor relation and never through state differences. Giving it the
 * producer's ownership records would make it share the mechanism it exists to check, and that
 * independence is what lets it count as a separate evidence lane. Its surviving ordinal reconstruction
 * is therefore a cross-check on the record-based producer rather than a redundant copy of it.
 *
 * The exemption has a reopen trigger and it is close: under any admitted repetition the record and the
 * ordinal reconstruction would legitimately disagree, and this owner would then reject a correct
 * publication. Admitting repeated boundary firing, repeated outer activation, or Multi-Instance must
 * resolve that, either by retaining an Activity occurrence anchor or by accepting the coupling.
 */
const exemptOwner =
  "packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts";

/** The Lean family modules that recover a body-to-handler pair. */
const leanPairingOwners = [
  "BpmnSemantics/SemanticProcess/BoundedTask.lean",
  "BpmnSemantics/SemanticProcess/MonitoredTask.lean",
  "BpmnSemantics/SemanticProcess/BoundedScope.lean",
] as const;

const leanRecordLookup = /activityOccurrenceFor|activityBody(Task|Scope)\?|RecordJoins/u;

const crossFamilyJoin = /\.activation\s*===\s*[A-Za-z_$][\w$.]*\.activation\b/u;
/**
 * The Lean form of the same defect.
 *
 * `=` rather than `===`, and it must not match a *same-family* identity check. Those compare a wait's
 * activation against a submitted occurrence identity's, which is a wrong-identity refusal and not a
 * join, so the pattern requires both sides to end in `.activation` and excludes a right-hand side
 * naming a submitted identity parameter.
 */
const leanCrossFamilyJoin =
  /\.activation\s*=\s*(?!.*\b(?:timerId|taskId|submitted)\b)[A-Za-z_][\w.]*\.activation\b/u;
const recordLookup = /activityOccurrenceFor|activityBody(Task|Scope)/u;

function lines(file: string): ReadonlyArray<string> {
  return readFileSync(path.join(projectRoot, file), "utf8").split("\n");
}

function joinSites(file: string): ReadonlyArray<string> {
  return lines(file).flatMap((line, index) =>
    crossFamilyJoin.test(line) ? [`${file}:${index + 1}`] : []
  );
}

test("every migrated pairing owner resolves its pair through the ownership record", () => {
  const migrated = pairingOwners.filter((owner) => owner !== exemptOwner);
  assert.equal(migrated.length, 4, "four transition and open-set owners are migrated");
  assert.deepEqual(migrated.flatMap(joinSites), []);
  for (const owner of migrated) {
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

test("the exemption names a file that still holds the pattern it exempts", () => {
  assert.notDeepEqual(
    joinSites(exemptOwner),
    [],
    "a vacuous exemption should be deleted rather than left standing as a claim",
  );
});

test("the pattern separates a cross-family join from a cardinality check", () => {
  const sample = [
    "  candidate.id.activation === wait.id.activation &&",
    "  entry.anchor.id.activation === 1 &&",
    "  left.activation - right.activation;",
  ];
  assert.deepEqual(
    sample.flatMap((line, index) => crossFamilyJoin.test(line) ? [index] : []),
    [0],
  );
});
