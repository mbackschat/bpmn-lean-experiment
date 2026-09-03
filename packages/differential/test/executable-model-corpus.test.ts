import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { ComparisonKind } from "@bpmn-lean/differential";

import {
  requireExecutableModelCorpusManifest,
} from "../../../scripts/executable-model-corpus.ts";
import {
  pipelineCases,
  runPipelineCases,
} from "./pipeline-harness.ts";
import {
  messageKeyCorrelationPopulationCases,
} from "./message-key-correlation-population-cases.ts";
import {
  warmPipelineTestTimeoutMs,
} from "../../../scripts/pipeline-budget.ts";

const manifest = requireExecutableModelCorpusManifest(
  JSON.parse(
    await readFile(
      new URL("../../../model-corpus/manifest.json", import.meta.url),
      "utf8",
    ),
  ),
);
const retainedCaseIds = manifest.models
  .filter(({ source }) => source.kind === "retainedScenario")
  .map(({ pipelineCaseId }) => pipelineCaseId);
const populationCaseIds = new Set<string>(
  messageKeyCorrelationPopulationCases.map(({ id }) => id),
);
const selectedPopulationIds = retainedCaseIds.filter(
  (id): id is string => id !== null && populationCaseIds.has(id),
);
const selectedPipelineIds = retainedCaseIds.filter(
  (id): id is string => id !== null && !populationCaseIds.has(id),
);
const selectedCases = selectedPipelineIds.map((id) => {
  const pipelineCase = pipelineCases.find((candidate) => candidate.id === id);
  if (pipelineCase === undefined) {
    throw new Error(`corpus pipeline case is absent: ${id}`);
  }
  return pipelineCase;
});

/**
 * Production-target evidence for the retained corpus tranche.
 *
 * The static corpus guard binds bytes, profiles, clone families, and case identities. This test
 * executes those exact selected cases through the existing Lean, semantic-core, CIB-when-selected,
 * and Temporal target owners rather than introducing another runner or another expected answer.
 */
test(
  "executes every retained corpus model through every claimed pipeline target",
  { timeout: warmPipelineTestTimeoutMs(process.env) },
  async () => {
    assert.equal(new Set(retainedCaseIds).size, retainedCaseIds.length);
    assert.deepEqual(selectedPopulationIds, ["message-key-correlation-unique"]);
    const { report, evidence } = await runPipelineCases(selectedCases);

    assert.deepEqual(
      report.cases.map(({ scenario }) => scenario.id),
      selectedPipelineIds,
    );
    assert.deepEqual(
      evidence.map(({ scenarioId }) => scenarioId),
      selectedPipelineIds,
    );
    for (const caseReport of report.cases) {
      assert.equal(
        caseReport.comparison.kind,
        ComparisonKind.Agreement,
        JSON.stringify(caseReport.comparison),
      );
    }
    assert.equal(
      report.replay.liveHistories,
      selectedCases.reduce(
        (count, pipelineCase) =>
          count + (pipelineCase.replaySelection === "primaryAndIsolation" ? 2 : 1),
        0,
      ),
    );
  },
);
