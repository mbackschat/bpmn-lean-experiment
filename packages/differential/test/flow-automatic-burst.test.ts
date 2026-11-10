/**
 * PC-CF-06: an automatic Sequence Flow cycle with no wait runs within one closure, and a burst beyond the row's declared
 * limit, `Step.closureBound` micro-steps, is `unsupported "closure-bound"` and commits nothing. The model is the
 * retained `automatic-loop` witness, whose plain Task counts with a `camunda:outputParameter` read in its own scope
 * (CIB-EXT-0031). The beyond-bound schedule (`limit` 50000, about 3 micro-steps an iteration, measured 2026-11-10)
 * separates a kernel that truncates the closure or commits its prefix from one that refuses it; CIB runs it to the end
 * (the draft CIB-LIM entry of PC-CF-06).
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
