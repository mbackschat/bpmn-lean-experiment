/**
 * No production source orders or compares strings through the host locale.
 *
 * The contract: every ordering this repository produces must be identical on every host. Canonical
 * wire order is owned by `compareCanonicalStrings`, and a site that cannot reach that owner still
 * compares by code unit rather than by collation. `Intl.Collator` and `String.prototype.localeCompare`
 * both consult the runtime's ICU locale, so two hosts can disagree about the same pair.
 *
 * This exists because prose did not bind. The semantic core already carried a comment rejecting locale
 * ordering for one comparator, and a locale comparison was then written into a neighbouring file in the
 * same capsule; a review found it, and a search for the mechanism found two more in Product 2 that
 * nobody had been told about, one ordering database migrations and one ordering a public projection.
 * Four sites, one class, so the vocabulary is removed rather than each site corrected.
 *
 * Scope is production source. Test and guard files may name these constructs, because asserting their
 * absence requires spelling them.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Every position the class can occupy, not every value it can take.
 *
 * A guard over a syntactic class needs one alternative per position, because seeding one form
 * certifies that form alone. Property access, optional chaining, computed access, and the collator
 * constructor are four positions for one defect.
 */
const localeSensitiveOrdering =
  /(?:\?\.|\.)\s*localeCompare\s*\(|\[\s*["'`]localeCompare["'`]\s*\]|Intl\s*\.\s*Collator/u;

function productionSourceFiles(): ReadonlyArray<string> {
  const tracked = execFileSync("git", ["ls-files", "-z", "*.ts"], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((entry) => entry.length > 0);
  return tracked.filter((entry) =>
    entry.includes("/src/") &&
    !entry.includes("/dist/") &&
    !entry.includes("/node_modules/") &&
    !entry.includes("/adoption/") &&
    !entry.endsWith(".test.ts") &&
    !entry.endsWith(".platform-test.ts") &&
    !entry.endsWith(".temporal-test.ts")
  );
}

test("no production source compares strings through the host locale", () => {
  const offenders = productionSourceFiles().filter((relativePath) =>
    localeSensitiveOrdering.test(
      readFileSync(path.join(projectRoot, relativePath), "utf8"),
    )
  );
  assert.deepEqual(
    { offenders },
    { offenders: [] },
    "order by code unit, or by the canonical wire comparator, never by collation",
  );
});

test("the inventory is not vacuous", () => {
  const files = productionSourceFiles();
  assert.ok(
    files.length > 200,
    `expected the production source inventory to be substantial, saw ${files.length}`,
  );
  assert.ok(
    files.some((entry) => entry.startsWith("packages/semantic-core/src/")),
    "the semantic core must be inside the scanned set",
  );
  assert.ok(
    files.some((entry) => entry.startsWith("platform/")),
    "Product 2 must be inside the scanned set, because two of the four sites were there",
  );
});

test("the pattern rejects every position of the class", () => {
  const rejected = [
    "left.localeCompare(right)",
    "left?.localeCompare(right)",
    'left["localeCompare"](right)',
    "left['localeCompare'](right)",
    "new Intl.Collator('de-DE').compare",
    "Intl . Collator",
    "left . localeCompare (right)",
  ];
  for (const source of rejected) {
    assert.match(source, localeSensitiveOrdering, `must reject: ${source}`);
  }
  const admitted = [
    "left < right ? -1 : left > right ? 1 : 0",
    "compareCanonicalStrings(left, right)",
    "left.localeCompareSomethingElse(right)",
    "value.toLocaleString()",
  ];
  for (const source of admitted) {
    assert.doesNotMatch(source, localeSensitiveOrdering, `must admit: ${source}`);
  }
});
