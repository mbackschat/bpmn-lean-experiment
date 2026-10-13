import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLeanResultRecords, runProcess } from "./pipeline-target-support.ts";

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

function resultLine(logicalTimeMs: string): string {
  return `{"scenarioId":"raw-result","result":{"outcome":{"kind":"semantic","outcome":"committed"},"trace":[{"kind":"state","instanceId":"Instance_1","status":"running","activeWaits":[],"openUserTasks":[],"openMessageSubscriptions":[],"openTimers":[],"openEffects":[],"openIncidents":[],"variables":[],"enabledInteractions":[],"logicalTimeMs":${logicalTimeMs}}]}}\n`;
}
