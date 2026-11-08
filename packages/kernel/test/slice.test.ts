/**
 * The TypeScript kernel against the Lean kernel on the vertical slice.
 *
 * The oracle is `simple-boolean.expected.json`, the output of `./.lake/build/bin/kernelRun` on the program
 * fixture and the retained `exclusive-gateway-simple-boolean` scenario; deep equality ignores key order, as the
 * canonical result does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, encodeProgram, runScenario } from "@bpmn-lean/kernel";

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

const program = readJson(new URL("./fixtures/simple-boolean.program.json", import.meta.url));
const scenario = readJson(
  new URL("../../../scenarios/exclusive-gateway-simple-boolean/scenario.json", import.meta.url),
);
const expected = readJson(new URL("./fixtures/simple-boolean.expected.json", import.meta.url));

test("the slice runs to the Lean kernel's canonical result", () => {
  assert.deepEqual(runScenario(program, scenario), expected);
});

test("the program codec round-trips the Lean encoding", () => {
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.deepEqual(encodeProgram(decoded.value), program);
});
