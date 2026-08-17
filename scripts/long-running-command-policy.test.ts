import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const retiredPolicyPath = fileURLToPath(
  new URL("../instructions/long-running-commands-js-ts.md", import.meta.url),
);
const contributorGuidePath = fileURLToPath(
  new URL("../CLAUDE.md", import.meta.url),
);
const testingSpecPath = fileURLToPath(
  new URL("../docs/TESTING-SPEC.md", import.meta.url),
);
const documentationRegistryPath = fileURLToPath(
  new URL("../docs/README.md", import.meta.url),
);
const receiptScriptPath = fileURLToPath(
  new URL("./run-with-receipt.sh", import.meta.url),
);

test("long-running JavaScript and TypeScript commands retain resumable evidence", async () => {
  const [contributorGuide, testingSpec, documentationRegistry] = await Promise.all([
    readFile(contributorGuidePath, "utf8"),
    readFile(testingSpecPath, "utf8"),
    readFile(documentationRegistryPath, "utf8"),
  ]);

  assert.equal(existsSync(retiredPolicyPath), false);
  assert.match(testingSpec, /## Long-running JavaScript and TypeScript commands/u);
  assert.match(testingSpec, /durable log/u);
  assert.match(testingSpec, /exit-status receipt/u);
  assert.match(testingSpec, /resumable session ID/u);
  assert.match(testingSpec, /set -o pipefail/u);
  assert.match(testingSpec, /PIPESTATUS\[0\]/u);
  assert.match(testingSpec, /tee/u);
  assert.match(testingSpec, /scripts\/run-with-receipt\.sh/u);
  assert.match(
    testingSpec,
    /Never rerun .* merely because .* output .* (?:lost|unavailable)/u,
  );
  assert.match(
    contributorGuide,
    /\[long-running-command policy\]\(docs\/TESTING-SPEC\.md#long-running-javascript-and-typescript-commands\)/u,
  );
  assert.match(
    documentationRegistry,
    /\[Long-running command policy\]\(TESTING-SPEC\.md#long-running-javascript-and-typescript-commands\)/u,
  );
});

test("receipt runner preserves combined output and the exact command exit", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "bpmn-command-receipt-test-"),
  );
  const successReceipt = path.join(temporaryRoot, "success");
  const failureReceipt = path.join(temporaryRoot, "failure");

  try {
    const success = spawnSync(
      receiptScriptPath,
      [
        successReceipt,
        "--",
        process.execPath,
        "-e",
        'process.stdout.write("out\\n"); process.stderr.write("err\\n");',
      ],
      { encoding: "utf8" },
    );
    assert.equal(success.status, 0, success.stderr);
    assert.equal(await readFile(path.join(successReceipt, "exit-status"), "utf8"), "0\n");
    assert.equal(await readFile(path.join(successReceipt, "output.log"), "utf8"), "out\nerr\n");

    const failure = spawnSync(
      receiptScriptPath,
      [
        failureReceipt,
        "--",
        process.execPath,
        "-e",
        'process.stderr.write("failed\\n"); process.exit(7);',
      ],
      { encoding: "utf8" },
    );
    assert.equal(failure.status, 7, failure.stderr);
    assert.equal(await readFile(path.join(failureReceipt, "exit-status"), "utf8"), "7\n");
    assert.equal(await readFile(path.join(failureReceipt, "output.log"), "utf8"), "failed\n");

    const repeated = spawnSync(
      receiptScriptPath,
      [successReceipt, "--", process.execPath, "-e", "process.exit(0)"],
      { encoding: "utf8" },
    );
    assert.equal(repeated.status, 2);
    assert.match(repeated.stderr, /already contains command evidence/u);
    assert.equal(await readFile(path.join(successReceipt, "exit-status"), "utf8"), "0\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
