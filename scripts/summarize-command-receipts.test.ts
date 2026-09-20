import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { summarizeCommandReceipts } from "./summarize-command-receipts.ts";

function fixture(root: string, name: string, start: number, end: number, command: string,
  status = 0, lane?: string): string {
  const directory = path.join(root, name);
  mkdirSync(directory);
  writeFileSync(path.join(directory, "command.txt"), `cwd=/repo\ncommand=${command} \n`);
  writeFileSync(path.join(directory, "git-head"), `${"a".repeat(40)}\n`);
  writeFileSync(path.join(directory, "output.log"), "retained output\n");
  writeFileSync(path.join(directory, "exit-status"), `${status}\n`);
  if (lane !== undefined) writeFileSync(path.join(directory, "lane"), `${lane}\n`);
  for (const [file, time] of [["command.txt", start], ["exit-status", end]] as const) {
    utimesSync(path.join(directory, file), new Date(time), new Date(time));
  }
  return directory;
}

test("receipt summary separates overlap, idle span, failure, and author-supplied labels", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "bpmn-receipt-summary-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  fixture(root, "z-parent", 1000, 6000, "./scripts/lake.sh build First", 0, "proof");
  fixture(root, "a-contained", 3000, 4000, "./scripts/lake.sh build Second", 7, "proof");
  fixture(root, "b-overlap", 5000, 9000, "node --test scripts/example.test.ts");
  fixture(root, "c-gap", 12000, 14000, "./scripts/pnpm.sh run test:infrastructure", 0, "docs");
  fixture(root, "d-instant", 14000, 14000, "./scripts/pnpm.sh run test:infrastructure", 0, "docs");
  mkdirSync(path.join(root, "scratch"));
  writeFileSync(path.join(root, "scratch", "note.txt"), "not a receipt");
  const summary = summarizeCommandReceipts(root);
  assert.equal(summary.receiptCount, 5);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.spanMs, 13000);
  assert.equal(summary.busyMs, 10000);
  assert.equal(summary.summedCommandMs, 12000);
  assert.equal(summary.unlabeledCount, 1);
  assert.deepEqual(summary.lanes, ["docs", "proof"]);
  assert.deepEqual(summary.families, [
    { family: "lean", count: 2, failedCount: 1, summedCommandMs: 6000 },
    { family: "node:test", count: 1, failedCount: 0, summedCommandMs: 4000 },
    { family: "pnpm:test:infrastructure", count: 2, failedCount: 0, summedCommandMs: 2000 },
  ]);
  assert.deepEqual(summary.invalidReceipts, []);
  assert.equal(summary.ignoredDirectories, 1);
  assert.equal(summary.timingBasis, "command.txt and exit-status modification times");
});

test("summary exposes incomplete and invalid timing evidence instead of silently counting it", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "bpmn-receipt-summary-invalid-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  fixture(root, "backwards", 2000, 1000, "node check.ts");
  const pending = path.join(root, "pending");
  mkdirSync(pending);
  writeFileSync(path.join(pending, "command.txt"), "command=node pending.ts\n");
  fixture(root, "bad-label", 1000, 2000, "node check.ts", 0, "first\nsecond");
  const summary = summarizeCommandReceipts(root);
  assert.equal(summary.receiptCount, 0);
  assert.equal(summary.spanMs, null);
  assert.equal(summary.busyMs, 0);
  assert.deepEqual(summary.invalidReceipts.map(({ reason }) => reason),
    ["invalid-interval", "invalid-lane", "incomplete-evidence"]);
});

test("summary CLI is read-only and reports partial input without declaring a command verdict", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "bpmn-receipt-summary-cli-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const receipt = fixture(root, "failed", 1000, 2000, "custom-command", 125);
  const source = readFileSync(path.join(receipt, "output.log"));
  const entry = fileURLToPath(new URL("./summarize-command-receipts.ts", import.meta.url));
  const result = spawnSync(process.execPath, [entry, root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).failedCount, 1);
  assert.doesNotMatch(result.stdout, /COMMAND_RECEIPT_VERDICT/u);
  assert.deepEqual(readFileSync(path.join(receipt, "output.log")), source);
  mkdirSync(path.join(root, "pending"));
  writeFileSync(path.join(root, "pending", "command.txt"), "command=node pending.ts\n");
  const partial = spawnSync(process.execPath, [entry, root], { encoding: "utf8" });
  assert.equal(partial.status, 2);
  assert.equal(JSON.parse(partial.stdout).receiptCount, 1);
  assert.equal(JSON.parse(partial.stdout).invalidReceipts[0].reason, "incomplete-evidence");
  const missing = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(missing.status, 2);
});
