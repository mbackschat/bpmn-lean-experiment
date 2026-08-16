import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";

import {
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";
import {
  pipelineCases,
} from "./pipeline-cases.ts";
import {
  structuredHumanWorkPipelineCases,
} from "./structured-human-work-pipeline-cases.ts";
import {
  mutableClone,
} from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";
import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";

const scenarioPaths = [
  "scenarios/expense-exception-review/approve.scenario.json",
  "scenarios/expense-exception-review/request-changes.scenario.json",
  "scenarios/expense-exception-review/abort.scenario.json",
];

test("registers three standards-profile M6 cases with no terminal CIB target", () => {
  assert.deepEqual(
    structuredHumanWorkPipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      scenarioRelativePath: pipelineCase.scenarioRelativePath,
      cib: pipelineCase.cib,
      temporalRelation: pipelineCase.temporalRelation,
    })),
    [{
      id: "expense-exception-review-approve",
      scenarioRelativePath: scenarioPaths[0],
      cib: null,
      temporalRelation: TemporalCaseRelation.ExactSemantic,
    }, {
      id: "expense-exception-review-request-changes",
      scenarioRelativePath: scenarioPaths[1],
      cib: null,
      temporalRelation: TemporalCaseRelation.ExactSemantic,
    }, {
      id: "expense-exception-review-abort",
      scenarioRelativePath: scenarioPaths[2],
      cib: null,
      temporalRelation: TemporalCaseRelation.ExactSemantic,
    }],
  );
  assert.deepEqual(
    normativeArtifactCases.filter(({ scenarioRelativePath }) =>
      scenarioPaths.includes(scenarioRelativePath)
    ).map(({ scenarioRelativePath }) => scenarioRelativePath),
    scenarioPaths,
  );
  for (const pipelineCase of structuredHumanWorkPipelineCases) {
    assert.equal(pipelineCases.includes(pipelineCase), true);
  }
});

test("each M6 case carries one independent result-class mutation at its exact locus", async () => {
  const contexts = await loadAndCompileCases(structuredHumanWorkPipelineCases);
  const results = runCoreTargets(contexts).results;
  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    const mutated = mutableClone(result);
    context.pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind !== ComparisonKind.Disagreement) {
      throw new Error("M6 mutation did not create a disagreement");
    }
    assert.deepEqual(
      comparison.disagreement,
      context.pipelineCase.expectedInjectedDisagreement,
    );
  }
});
