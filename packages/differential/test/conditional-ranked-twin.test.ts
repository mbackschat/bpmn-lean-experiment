/**
 * A ranked twin reproduces the retained CIB answer of a schedule whose Conditional contest the kernel refuses unranked
 * (CIB-LIM-0053). `level-both-eligible` makes the non-interrupting `Warn_Level` and the interrupting `Stop_Level` true
 * at one write; CIB fired `Warn_Level` first, an order no profile selects, so the kernel refuses the schedule and its
 * evidence is ledgered. The twin ranks `[Warn_Level, Stop_Level]` and must then equal that evidence at the CIB
 * observation boundary. The behavior oracle compares a schedule only with its own evidence, which a twin cannot have,
 * since the CIB runner cannot be given a ranking.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { runScenario } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { scenarioKernelInput } from "./scenario-discovery.ts";
import type { CanonicalResult, ScenarioDocument } from "./scenario-discovery.ts";

const directory = "scenarios/open-rows/conditional-boundary-hosts";
const read = async (relativePath: string): Promise<any> => JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));

test("the twin ranked in CIB's order reproduces the retained answer of the schedule the kernel refuses unranked", async () => {
  const twinPath = `${directory}/level-both-eligible-ranked.scenario.json`;
  const twin = await read(twinPath) as ScenarioDocument;
  const original = await read(`${directory}/level-both-eligible.scenario.json`) as ScenarioDocument;
  const evidence = await read(`${directory}/level-both-eligible.cibseven-evidence.json`);
  const unranked = (stimuli: ScenarioDocument["stimuli"]): unknown =>
    JSON.parse(JSON.stringify(stimuli, (key, value) => (key === "conditionChoices" ? undefined : value)));
  assert.deepEqual(unranked(twin.stimuli), unranked(original.stimuli), "the twin differs from its schedule only by its ranking");
  const input = await scenarioKernelInput(twinPath, twin.bpmn, twin.profile);
  assert.equal(input.kind, "program");
  const result = JSON.parse(JSON.stringify(runScenario(JSON.parse(JSON.stringify(input.program)), twin as never))) as CanonicalResult;
  const comparison = compareTargetResults(
    { target: DifferentialTarget.RetainedCibEvidence, result: evidence.result },
    [{ target: DifferentialTarget.KernelTs, result }],
  );
  assert.notEqual(comparison.kind, ComparisonKind.Disagreement, JSON.stringify(comparison));
});
