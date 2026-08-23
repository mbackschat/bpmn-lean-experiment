/**
 * No project-authored executable TypeScript orders or compares strings through the host locale.
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
 * Four production sites exposed the class, but the first guard encoded that search boundary rather
 * than the repository rule. Widening it found seventeen more live calls across tests, calibration
 * harnesses, scripts, and showcase support. Those surfaces are executable too: a locale-ordered
 * expectation or generated artifact can drift across hosts even when production does not.
 *
 * Scope is every tracked or non-ignored pending TypeScript execution surface except frozen adoption
 * evidence, generated dependencies, declarations, and this guard's own adversarial fixture text.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function projectExecutableTypeScriptFiles(): ReadonlyArray<string> {
  const trackedAndPending = execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z", "--", "*.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split("\0")
    .filter((entry) => entry.length > 0);
  return [...new Set(trackedAndPending)]
    .filter(
      (entry) =>
        entry !== "scripts/canonical-ordering.test.ts" &&
        !entry.endsWith(".d.ts") &&
        !entry.includes("/dist/") &&
        !entry.includes("/node_modules/") &&
        !entry.startsWith("adoption/") &&
        !entry.includes("/adoption/") &&
        existsSync(path.join(projectRoot, entry)),
    )
    .sort();
}

test("no project-authored executable TypeScript compares strings through the host locale", () => {
  const offenders = projectExecutableTypeScriptFiles().filter(
    (relativePath) =>
      localeSensitiveOrdering.test(
        readFileSync(path.join(projectRoot, relativePath), "utf8"),
      ),
  );
  assert.deepEqual(
    { offenders },
    { offenders: [] },
    "order by code unit, or by the canonical wire comparator, never by collation",
  );
});

test("the inventory is not vacuous", () => {
  const files = projectExecutableTypeScriptFiles();
  assert.ok(
    files.length > 600,
    `expected the executable TypeScript inventory to be substantial, saw ${files.length}`,
  );
  for (const required of [
    "packages/semantic-core/src/wire.ts",
    "packages/bpmn-source/calibration/miwg-observation.ts",
    "packages/bpmn-source/test/projected-flow-element-keys.test.ts",
    "platform/modules/operate/src/flow-node-occurrence-projection.ts",
    "scripts/start-operation-artifact-consistency.test.ts",
    "scripts/what-binds.ts",
    "showcase/m3-human-work/test/runtime-support.ts",
  ]) {
    assert.ok(files.includes(required), `executable inventory must include ${required}`);
  }
  assert.equal(files.includes("scripts/canonical-ordering.test.ts"), false);
  assert.equal(
    files.some((entry) => entry.startsWith("adoption/")),
    false,
    "frozen adoption evidence stays outside project-authored enforcement",
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
