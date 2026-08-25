import assert from "node:assert/strict";
import { test } from "node:test";

import { runnableTestFiles, unselectedTestFiles } from "./test-selection-coverage.ts";

/**
 * Every tracked test file must be reachable from an automatically invoked gate.
 *
 * The oracle is the repository's own command graph. A test no command reaches contributes no
 * evidence while looking exactly like a covered test, and no gate can report it, because a gate
 * reports only what it ran. Name-matching is not enough: three packages here declared `test:built`
 * scripts naming their own tests while nothing invoked those scripts, and one of them had stopped
 * compiling because no lane ever built it.
 */

test("every tracked test file is reachable from a gate command", () => {
  // No allowance list. Every lane counts, the PostgreSQL suites included: a workflow runs them
  // against a real database, so "the ordinary loop stays database-free" is a statement about local
  // development and not about coverage.
  assert.deepEqual(unselectedTestFiles(), []);
});

test("the runnable set excludes frozen legacy evidence and still covers the repository", () => {
  const runnable = runnableTestFiles();

  // A path-matching mistake in the frozen-manifest lookup, or a collapsed runnable set, would make
  // every assertion above pass for the wrong reason.
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
  assert.equal(
    runnable.includes(
      "packages/temporal-adapter/testkit/test/workflow-chain-recovery-capacity.temporal-serial-test.ts",
    ),
    true,
    "serialized live-service tests must remain inside the runnable set",
  );
});
