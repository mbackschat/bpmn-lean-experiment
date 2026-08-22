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

/**
 * Files whose gate placement is an open decision, not an accepted gap.
 *
 * These four need a live Temporal server and are the only `.temporal-test.ts` files the capacity
 * lane's hand-written list omits. That list is the mechanism: it names five siblings explicitly, so
 * every file added afterwards had to be appended by hand and these were not. Their correct lane
 * depends on whether they are concurrency-safe, which takes a server run to establish, so they are
 * recorded with that reason rather than wired into a lane chosen by guess.
 */
const pendingLaneDecision = [
  "packages/temporal-adapter/testkit/test/workflow-chain-effect-rollover.temporal-test.ts",
  "packages/temporal-adapter/testkit/test/workflow-chain-message-rollover.temporal-test.ts",
  "packages/temporal-adapter/testkit/test/workflow-chain-timer-rollover.temporal-test.ts",
  "packages/temporal-adapter/testkit/test/workflow-deployment-admission.temporal-test.ts",
];

test("every tracked test file is selected by a gate command", () => {
  assert.deepEqual(unselectedTestFiles(), pendingLaneDecision);
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
