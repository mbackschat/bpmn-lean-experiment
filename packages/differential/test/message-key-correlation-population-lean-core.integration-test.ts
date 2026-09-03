import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import type {
  EnginePopulationScenario,
  EnginePopulationScenarioResult,
} from "@bpmn-lean/semantic-core";

import { parseStrictJson } from "../../../scripts/strict-json.ts";
import {
  loadMessageKeyCorrelationPopulationCases,
  runMessageKeyCorrelationPopulationCore,
} from "./message-key-correlation-population-cases.ts";
import {
  indexExactRecords,
  projectRoot,
  runProcess,
} from "./pipeline-target-support.ts";

type LeanPopulationResultRecord = Readonly<{
  scenarioId: string;
  scenario: EnginePopulationScenario;
  result: EnginePopulationScenarioResult;
}>;

test("compares all Message-correlation population schedules between Lean and the core", async () => {
  const contexts = await loadMessageKeyCorrelationPopulationCases();
  const core = runMessageKeyCorrelationPopulationCore(contexts);
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-message-correlation-population-"),
  );
  try {
    const definitionsPath = path.join(temporaryDirectory, "definitions.jsonl");
    await writeFile(
      definitionsPath,
      `${contexts.flatMap((context) =>
        context.definitions.map((definition) => JSON.stringify({
          scenarioId: context.scenario.id,
          checkedProcess: definition.checkedProcess,
          semanticProcess: definition.semanticProcess,
        }))
      ).join("\n")}\n`,
      "utf8",
    );
    const execution = await runProcess(
      "./scripts/lake.sh",
      [
        "run",
        "BpmnSemantics/EnginePopulationScenarioJsonMain.lean",
        definitionsPath,
        ...contexts.map(({ populationCase }) =>
          path.join(projectRoot, populationCase.scenarioRelativePath)
        ),
      ],
      10_000,
    );
    const records = execution.stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line, index) => parseStrictJson<LeanPopulationResultRecord>(
        line,
        `Lean population result line ${index + 1}`,
      ));
    const lean = indexExactRecords(
      records,
      contexts.map(({ scenario }) => scenario.id),
      "Lean population",
    );
    for (const context of contexts) {
      const leanRecord = lean.get(context.scenario.id);
      const coreResult = core.get(context.scenario.id);
      assert.ok(leanRecord !== undefined);
      assert.ok(coreResult !== undefined);
      assert.deepEqual(leanRecord.scenario, context.scenario);
      assert.deepEqual(leanRecord.result, coreResult);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
