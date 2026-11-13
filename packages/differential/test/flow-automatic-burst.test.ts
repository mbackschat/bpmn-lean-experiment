/**
 * PC-CF-06: an automatic Sequence Flow cycle with no wait runs within one closure, and a burst beyond the row's declared
 * limit, `Step.closureBound` micro-steps, is `unsupported "closure-bound"` and commits nothing. The model is the
 * retained `automatic-loop` witness, whose plain Task counts with a `camunda:outputParameter` read in its own scope
 * (CIB-EXT-0031). The beyond-bound schedule (`limit` 50000, about 3 micro-steps an iteration, measured 2026-11-10)
 * separates a kernel that truncates the closure or commits its prefix from one that refuses it; CIB runs it to the end
 * (CIB-LIM-0016).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Json = Record<string, any>;

const directory = "scenarios/open-rows/cycle-compositions";

async function run(name: string): Promise<Json> {
  const scenarioPath = `${directory}/${name}.scenario.json`;
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  return runScenario((read as Extract<typeof read, { kind: "read" }>).program, scenario) as Json;
}

const variables = (state: Json): Json => Object.fromEntries(state.variables.map((binding: Json) => [binding.name, binding.value.value]));

test("an automatic cycle under the closure bound counts to its limit in one start", async () => {
  const result = await run("automatic-loop-short-burst");
  assert.deepEqual(result.outcome, { kind: "semantic", outcome: "committed" }, JSON.stringify(result.trace));
  const [state] = result.trace.filter((entry: Json) => entry.kind === "state");
  assert.deepEqual(variables(state), { limit: 3, n: 3 });
  assert.deepEqual(state.openWaits.map((wait: Json) => `${wait.id.elementId}#${wait.id.activation}`), ["Report#1"]);
});

test("a burst beyond the closure bound is unsupported and commits nothing", async () => {
  const result = await run("automatic-loop-beyond-bound");
  const start = result.trace.find((entry: Json) => entry.kind === "command" && entry.commandId === "s01-start");
  assert.deepEqual(start, { kind: "command", commandId: "s01-start", outcome: "unsupported", code: "closure-bound" });
  assert.equal(result.trace.filter((entry: Json) => entry.kind === "state" && entry.status === "running").length, 0,
    "no running instance is observed after the refused start");
});

// The `automatic-loop-tail` start runs 3 micro-steps an iteration, 5 around the cycle and `tail` (0 to 2) after it,
// so `limit` 33331 with `tail` 2 takes exactly `closureBound` micro-steps and `limit` 33332 with `tail` 0 one more.
test("a closure of exactly the closure bound commits, and one micro-step more is unsupported", async () => {
  const fits = await run("automatic-loop-tail-at-closure-bound");
  assert.deepEqual(fits.outcome, { kind: "semantic", outcome: "committed" });
  const [state] = fits.trace.filter((entry: Json) => entry.kind === "state");
  assert.deepEqual(variables(state), { limit: 33331, n: 33331, tail: 2 });
  assert.deepEqual(state.openWaits.map((wait: Json) => `${wait.id.elementId}#${wait.id.activation}`), ["Report#1"]);

  const over = await run("automatic-loop-tail-beyond-closure-bound");
  assert.deepEqual(over.trace.find((entry: Json) => entry.kind === "command" && entry.commandId === "s01-start"),
    { kind: "command", commandId: "s01-start", outcome: "unsupported", code: "closure-bound" });
});

// Each `automatic-loop-waiting-branch` iteration leaves one more open *Review* for every later micro-step to scan, so
// the closure's work, not its 5 micro-steps an iteration, meets its bound first: between `limit` 1413 and 1414.
test("a closure whose growing state meets the work bound commits below it and is unsupported past it", async () => {
  const fits = await run("automatic-loop-waiting-branch-at-work-bound");
  assert.deepEqual(fits.outcome, { kind: "semantic", outcome: "committed" });
  const [state] = fits.trace.filter((entry: Json) => entry.kind === "state");
  assert.deepEqual(variables(state), { limit: 1413, n: 1413 });
  assert.equal(state.openWaits.filter((wait: Json) => wait.id.elementId === "Review").length, 1412);

  const over = await run("automatic-loop-waiting-branch-beyond-work-bound");
  assert.deepEqual(over.trace.find((entry: Json) => entry.kind === "command" && entry.commandId === "s01-start"),
    { kind: "command", commandId: "s01-start", outcome: "unsupported", code: "closure-bound" });
});
