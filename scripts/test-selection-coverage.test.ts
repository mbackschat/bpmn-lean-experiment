import assert from "node:assert/strict";
import { test } from "node:test";

import { runnableTestFiles, unselectedTestFiles } from "./test-selection-coverage.ts";

/**
 * Every tracked test file must be selected by some gate command.
 *
 * The oracle is the repository's own command surface, not a curated list: a test file that no
 * manifest script, shell script, or workflow names contributes no evidence while looking exactly
 * like a covered file. That state cannot be reported by any gate, because a gate only reports what
 * it ran.
 *
 * The unselected set is asserted exactly rather than bounded. A file that becomes covered must be
 * removed here in the same change, so this list cannot decay into a permanent allowance, and a
 * newly orphaned file cannot hide inside an unchanged count.
 */

test("every tracked test file is selected by a gate command", () => {
  // No allowance list. A gate lane that names its files by hand is exactly how four
  // `.temporal-test.ts` witnesses came to run nowhere, so each lane globs the convention that
  // decides its membership and this set stays empty.
  assert.deepEqual(unselectedTestFiles(), []);
});

test("the runnable set excludes frozen legacy evidence and still covers the repository", () => {
  const runnable = runnableTestFiles();

  // Anti-vacuity: an empty or tiny runnable set would make the assertion above pass for the wrong
  // reason, and a path-matching mistake in the frozen-manifest lookup would show up here first.
  assert.ok(runnable.length > 400, `expected the full test corpus, found ${runnable.length}`);
  assert.equal(
    runnable.some((file) => file.startsWith("adoption/a12/legacy/source-tree/")),
    false,
    "frozen legacy evidence must never be required to run",
  );
  assert.equal(
    runnable.includes("scripts/test-selection-coverage.test.ts"),
    true,
    "this guard must be inside the set it enforces",
  );
});
