import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseLeanOutputLines, parseLeanResultRecords, projectRoot, runProcess } from "./pipeline-target-support.ts";

test("actual differential result admission rejects lossy and noncanonical raw integer tokens", () => {
  for (const token of ["1.0000000000000001", "9007199254740991.1", "1e-400", "1e400", "1.0", "1e1", "-0", "9007199254740992", "9007199254740993"]) {
    assert.throws(() => parseLeanResultRecords(resultLine(token)), SyntaxError, token);
  }
});

test("actual differential result admission retains canonical integer controls and strict decoded keys", () => {
  for (const token of ["0", "1", "10", "9007199254740991"]) {
    assert.equal(parseLeanResultRecords(resultLine(token)).length, 1);
  }
  assert.throws(() => parseLeanResultRecords('{"scenarioId":"one","\\u0073cenarioId":"two"}'), /duplicate/u);
  assert.throws(() => parseLeanResultRecords('{"scenarioId":"\\uD800"}'), /surrogate/u);
});

test("actual differential record parser preserves BOM and non-JSON whitespace refusal", () => {
  for (const whitespace of ["\uFEFF", "\u00A0", "\u2003", "\u2028"]) {
    assert.throws(() => parseLeanResultRecords(whitespace + resultLine("0")), SyntaxError);
    assert.throws(() => parseLeanResultRecords(resultLine("0").replace("\n", whitespace)), SyntaxError);
  }
  assert.equal(parseLeanResultRecords(" \t\r" + resultLine("0")).length, 1);
  const scalarString = resultLine("0").replace("raw-result", "raw-\uFEFF-result");
  assert.equal(parseLeanResultRecords(scalarString)[0]?.scenarioId, "raw-\uFEFF-result");
});

test("wire-producing differential processes reject malformed stdout without changing generic logging", async () => {
  for (const bytes of [[0xff], [0xe2, 0x82]]) {
    const source = `process.stdout.write(Buffer.from(${JSON.stringify(bytes)}))`;
    assert.equal((await runProcess(process.execPath, ["-e", source], 5_000)).stdout, "\uFFFD");
    await assert.rejects(runProcess(process.execPath, ["-e", source], 5_000, "utf8Fatal"), /UTF-8|encoded data/u);
  }
  const control = await runProcess(process.execPath, ["-e", 'process.stdout.write(Buffer.from([0xe2]));setImmediate(()=>{process.stdout.write(Buffer.from([0x82,0xac]));process.stderr.write(Buffer.from([0xff]));})'], 5_000, "utf8Fatal");
  assert.equal(control.stdout, "€");
  assert.equal(control.stderr, "\uFFFD");
});

test("generic Lean output lines reject a rounding alias that JSON.parse would equate", () => {
  assert.throws(() => parseLeanOutputLines('{"capacity":1.0000000000000001}\n'), SyntaxError);
  assert.deepEqual(parseLeanOutputLines('{"capacity":1}\n\nnull\n'), [{ capacity: 1 }, null]);
});

// A package test that decodes Lean stdout with JSON.parse equates distinct Lean integers (AA-13), so every
// stdout decode must go through the exact wire reader. Clone idioms over local values remain allowed.
test("package tests decode Lean stdout only through the exact wire reader", () => {
  const sources = execFileSync("git", ["ls-files", "packages/**/test/*.ts"], { cwd: projectRoot, encoding: "utf8" })
    .split("\n").filter((relativePath) => relativePath.length > 0 && relativePath !== "packages/differential/test/raw-wire-admission.test.ts");
  const findings = sources.flatMap((relativePath) =>
    readFileSync(`${projectRoot}${relativePath}`, "utf8").split("\n").flatMap((line, index) =>
      /\bstdout\b/u.test(line) && /\bJSON\.parse\b/u.test(line) ? [`${relativePath}:${index + 1}`] : []));
  assert.deepEqual(findings, []);
});

function resultLine(logicalTimeMs: string): string {
  return `{"scenarioId":"raw-result","result":{"outcome":{"kind":"semantic","outcome":"committed"},"trace":[{"kind":"state","instanceId":"Instance_1","status":"running","activeWaits":[],"openUserTasks":[],"openMessageSubscriptions":[],"openTimers":[],"openEffects":[],"openIncidents":[],"variables":[],"enabledInteractions":[],"logicalTimeMs":${logicalTimeMs}}]}}\n`;
}
