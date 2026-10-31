/**
 * Every registered pipeline schedule publishes the same committed transitions, positions and lifecycles in Lean and the core.
 * The pipeline compares results only, so this is the publication half over the same retained schedules. It locks the replay
 * dispatch class: a merge-target record names one of several live occurrences and replays by its owner in every profile
 * (CEA-QUIESCE-01), and a Lean replay that addressed it by definition silently dropped seven merge-region publications
 * (observed 2026-10-31).
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { coreCommandPublications } from "./core-command-publications.ts";
import { pipelineCases } from "./pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { parseLeanOutputLines, projectRoot } from "./pipeline-target-support.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";

test("every registered pipeline schedule publishes the same commands in Lean and the core", async () => {
  const contexts = await loadAndCompileCases(pipelineCases);
  const directory = await mkdtemp(path.join(tmpdir(), "pipeline-publications-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, contexts.map(({ scenario, checkedProcess, semanticProcess }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess })).join("\n") + "\n");
    const execution = await runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions,
      ...contexts.map(({ pipelineCase }) => path.join(projectRoot, pipelineCase.scenarioRelativePath))], contexts.length);
    const actual = parseLeanOutputLines<{ scenarioId: string; commandPublications: unknown }>(execution.stdout);
    assert.deepEqual(actual.map(({ scenarioId }) => scenarioId), contexts.map(({ scenario }) => scenario.id));
    // Collected rather than asserted one by one, so a single run names every disagreeing schedule.
    const disagreements = contexts.filter(({ scenario, semanticProcess }, index) =>
      !isDeepStrictEqual(actual[index]!.commandPublications, coreCommandPublications(semanticProcess, scenario)))
      .map(({ scenario }) => scenario.id);
    assert.deepEqual(disagreements, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
