import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const scriptRegistryPath = fileURLToPath(
  new URL("./README.md", import.meta.url),
);
const receiptScriptPath = fileURLToPath(
  new URL("./run-with-receipt.sh", import.meta.url),
);
const receiptAssertionPath = fileURLToPath(
  new URL("./assert-command-receipt.ts", import.meta.url),
);

test("long-running JavaScript and TypeScript commands retain resumable evidence", async () => {
  const [contributorGuide, testingSpec, documentationRegistry, scriptRegistry] = await Promise.all([
    readFile(contributorGuidePath, "utf8"),
    readFile(testingSpecPath, "utf8"),
    readFile(documentationRegistryPath, "utf8"),
    readFile(scriptRegistryPath, "utf8"),
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
  assert.match(testingSpec, /node scripts\/assert-command-receipt\.ts/u);
  assert.match(testingSpec, /filtered log search/u);
  assert.match(
    testingSpec,
    /Never rerun .* merely because .* output .* (?:lost|unavailable)/u,
  );
  assert.match(
    contributorGuide,
    /\[long-running-command policy\]\(docs\/TESTING-SPEC\.md#long-running-javascript-and-typescript-commands\)/u,
  );
  assert.match(contributorGuide, /node scripts\/assert-command-receipt\.ts/u);
  assert.match(
    documentationRegistry,
    /\[Long-running command policy\]\(TESTING-SPEC\.md#long-running-javascript-and-typescript-commands\)/u,
  );
  assert.match(scriptRegistry, /\[`assert-command-receipt\.ts`\]\(assert-command-receipt\.ts\)/u);
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
    assert.match(
      success.stdout,
      new RegExp(`COMMAND_RECEIPT_COMPLETE=${successReceipt.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} exitStatus=0`, "u"),
    );
    assert.equal(await readFile(path.join(successReceipt, "exit-status"), "utf8"), "0\n");
    assert.equal(await readFile(path.join(successReceipt, "output.log"), "utf8"), "out\nerr\n");
    const head = spawnSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      encoding: "utf8",
    });
    assert.equal(head.status, 0, head.stderr);
    assert.equal(
      await readFile(path.join(successReceipt, "git-head"), "utf8"),
      head.stdout,
    );

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
    assert.match(
      failure.stdout,
      new RegExp(`COMMAND_RECEIPT_COMPLETE=${failureReceipt.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} exitStatus=7`, "u"),
    );
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

test("receipt assertion is the sole machine verdict for a completed long command", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "bpmn-command-receipt-assertion-test-"),
  );
  const successReceipt = path.join(temporaryRoot, "success");
  const failureReceipt = path.join(temporaryRoot, "failure");
  const pendingReceipt = path.join(temporaryRoot, "pending");
  const malformedReceipt = path.join(temporaryRoot, "malformed");

  try {
    for (const [receipt, status] of [
      [successReceipt, 0],
      [failureReceipt, 7],
    ] as const) {
      const command = spawnSync(
        receiptScriptPath,
        [receipt, "--", process.execPath, "-e", `process.exit(${status})`],
        { encoding: "utf8" },
      );
      assert.equal(command.status, status);
    }
    await mkdir(pendingReceipt);
    await mkdir(malformedReceipt);
    await writeFile(path.join(malformedReceipt, "exit-status"), "green\n");

    const success = spawnSync(process.execPath, [receiptAssertionPath, successReceipt], {
      encoding: "utf8",
    });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(
      success.stdout,
      `COMMAND_RECEIPT_VERDICT=success exitStatus=0 gitHead=${(await readFile(path.join(successReceipt, "git-head"), "utf8")).trim()} receipt=${successReceipt}\n`,
    );

    const failure = spawnSync(process.execPath, [receiptAssertionPath, failureReceipt], {
      encoding: "utf8",
    });
    assert.equal(failure.status, 1);
    assert.equal(
      failure.stderr,
      `COMMAND_RECEIPT_VERDICT=failure exitStatus=7 gitHead=${(await readFile(path.join(failureReceipt, "git-head"), "utf8")).trim()} receipt=${failureReceipt}\n`,
    );

    for (const receipt of [pendingReceipt, malformedReceipt]) {
      const incomplete = spawnSync(process.execPath, [receiptAssertionPath, receipt], {
        encoding: "utf8",
      });
      assert.equal(incomplete.status, 2);
      assert.match(incomplete.stderr, /COMMAND_RECEIPT_VERDICT=invalid/u);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("completed failures locate the first recognized diagnostic without changing the verdict", async (context) => {
  const cases = [
    { name: "Node", status: 1, output: "✔ first\nexpected error: example\n✖ broken test\n✔ later\n✖ another\n", locator: "3: ✖ broken test" },
    { name: "Lean", status: 1, output: "building\r\nerror: Main.lean:3: mismatch\r\nerror: build failed\r\n", locator: "2: error: Main.lean:3: mismatch" },
    { name: "Lake summary", status: 1, output: "building\nSome required targets logged failures:\n- Main\n", locator: "2: Some required targets logged failures:" },
    { name: "unrecognized failure", status: 7, output: "ordinary output\n", locator: undefined },
    { name: "embedded diagnostic", status: 7, output: "expected error: example\nquoted ✖ failure\n", locator: undefined },
    { name: "passing negative test", status: 0, output: "✖ expected fixture\nerror: expected negative\n", locator: undefined },
  ];
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "bpmn-failure-locator-test-"));
  try {
    for (const [index, fixture] of cases.entries()) {
      await context.test(fixture.name, async () => {
        const receipt = path.join(temporaryRoot, String(index));
        const command = spawnSync(receiptScriptPath, [receipt, "--", process.execPath, "-e",
          `process.stdout.write(${JSON.stringify(fixture.output)}); process.exit(${fixture.status});`],
        { encoding: "utf8" });
        assert.equal(command.status, fixture.status);
        const result = spawnSync(process.execPath, [receiptAssertionPath, receipt], { encoding: "utf8" });
        assert.equal(result.status, fixture.status === 0 ? 0 : 1);
        const markers = result.stderr.split("\n").filter((line) => line.startsWith("COMMAND_RECEIPT_FIRST_FAILURE="));
        assert.deepEqual(markers, fixture.locator === undefined ? [] : [`COMMAND_RECEIPT_FIRST_FAILURE=${fixture.locator}`]);
        assert.match(result.stdout + result.stderr, new RegExp(`COMMAND_RECEIPT_VERDICT=${fixture.status === 0 ? "success" : "failure"} exitStatus=${fixture.status} `, "u"));
        assert.equal(await readFile(path.join(receipt, "output.log"), "utf8"), fixture.output);
        assert.equal(await readFile(path.join(receipt, "exit-status"), "utf8"), `${fixture.status}\n`);
      });
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("receipt runner records an optional lane and refuses malformed or stale labels before execution", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "bpmn-receipt-lane-test-"));
  try {
    const labeled = path.join(temporaryRoot, "labeled");
    const result = spawnSync(receiptScriptPath, [labeled, "--", process.execPath, "-e", "process.exit(7)"], {
      encoding: "utf8", env: { ...process.env, COMMAND_RECEIPT_LANE: "proof/local-control" },
    });
    assert.equal(result.status, 7, result.stderr);
    assert.equal(await readFile(path.join(labeled, "lane"), "utf8"), "proof/local-control\n");
    assert.equal(await readFile(path.join(labeled, "exit-status"), "utf8"), "7\n");
    const malformed = spawnSync(receiptScriptPath, [path.join(temporaryRoot, "malformed"), "--",
      process.execPath, "-e", "process.exit(85)"], {
      encoding: "utf8", env: { ...process.env, COMMAND_RECEIPT_LANE: "first\nsecond" },
    });
    assert.equal(malformed.status, 2, malformed.stderr);
    const stale = path.join(temporaryRoot, "stale");
    await mkdir(stale);
    await writeFile(path.join(stale, "lane"), "older\n");
    const reused = spawnSync(receiptScriptPath, [stale, "--", process.execPath, "-e", "process.exit(85)"], {
      encoding: "utf8", env: { ...process.env, COMMAND_RECEIPT_LANE: "" },
    });
    assert.equal(reused.status, 2, reused.stderr);
    assert.equal(await readFile(path.join(stale, "lane"), "utf8"), "older\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
