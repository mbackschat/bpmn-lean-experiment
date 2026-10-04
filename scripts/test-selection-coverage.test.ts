import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { directNodeTestEntrypoints, runnableTestFiles, unselectedTestFiles } from "./test-selection-coverage.ts";

test("selection includes pending tests before commit and excludes ignored, deleted and frozen files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "test-selection-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(path.join(root, "adoption/a12/legacy"), { recursive: true });
    writeFileSync(path.join(root, "adoption/a12/legacy/manifest.json"), JSON.stringify({
      entries: [{ frozenPath: "frozen.test.ts" }],
    }));
    writeFileSync(path.join(root, ".gitignore"), "ignored.test.ts\n");
    for (const file of ["retained.test.ts", "removed.test.ts", "frozen.test.ts", "pending.integration-test.ts", "ignored.test.ts"]) {
      writeFileSync(path.join(root, file), "");
    }
    execFileSync("git", ["add", "retained.test.ts", "removed.test.ts", "frozen.test.ts"], { cwd: root });
    rmSync(path.join(root, "removed.test.ts"));
    assert.deepEqual(runnableTestFiles(root).toSorted(), ["pending.integration-test.ts", "retained.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("host-clock winner witnesses with Worker replacement stay in the serial lane", () => {
  const files = readdirSync(new URL("../packages/temporal-adapter/testkit/test/", import.meta.url));
  for (const stem of [
    "event-based-gateway",
    "sequential-multi-instance-refinement",
    "parallel-multi-instance-refinement",
  ]) {
    assert.ok(files.includes(`${stem}.temporal-serial-test.ts`),
      `${stem} must not race concurrent suite startup against its native Timer`);
  }
});

/**
 * Every tracked or pending test file must be reachable from a tracked gate.
 *
 * The oracle is the repository's own command graph. A test no command reaches contributes no
 * evidence while looking exactly like a covered test, and no gate can report it, because a gate
 * reports only what it ran. Name-matching is not enough: three packages here declared `test:built`
 * scripts naming their own tests while nothing invoked those scripts, and one of them had stopped
 * compiling because no lane ever built it.
 */

test("every tracked or pending test file is reachable from a gate command", () => {
  // No allowance list. Every lane counts, the PostgreSQL suites included: a workflow runs them
  // against a real database, so "the ordinary loop stays database-free" is a statement about local
  // development and not about coverage.
  assert.deepEqual(unselectedTestFiles(), []);
});

test("the runnable inventory includes integration witnesses from distinct semantic families", () => {
  const runnable = new Set(runnableTestFiles());
  for (const family of ["structured-composition", "interrupting-message-event-subprocess"]) {
    const file = `packages/differential/test/${family}-lean-core.integration-test.ts`;
    assert.equal(runnable.has(file), true, file);
  }
});

test("direct shell and workflow commands select integration tests without selecting references", () => {
  assert.deepEqual(directNodeTestEntrypoints([
    "node --test --test-concurrency=1 packages/one/test/*.integration-test.ts",
    "  node --test \\",
    "    packages/two/test/closure.integration-test.ts",
    "  run: env CI=true node --test packages/three/test/ports.integration-test.ts # ignored.test.ts",
    "# node --test packages/ignored/test/comment.test.ts",
    'echo "node --test packages/ignored/test/text.test.ts"',
    "node packages/ignored/test/not-a-test-command.ts",
  ].join("\n")), [
    "packages/one/test/*.integration-test.ts",
    "packages/two/test/closure.integration-test.ts",
    "packages/three/test/ports.integration-test.ts",
  ]);
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
