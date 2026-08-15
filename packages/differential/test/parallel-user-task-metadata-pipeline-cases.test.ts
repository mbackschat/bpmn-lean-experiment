import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";

import {
  artifactCases,
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";
import { verifyPipelineRegistration } from "../../../scripts/capsule-roundtrip.ts";
import {
  parallelUserTaskMetadataPipelineCases,
} from "./parallel-user-task-metadata-pipeline-cases.ts";
import { pipelineCases } from "./pipeline-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";

test("registers both composed schedules with independent mutations", () => {
  assert.doesNotThrow(() =>
    verifyPipelineRegistration(artifactCases, normativeArtifactCases, pipelineCases)
  );
  assert.deepEqual(
    parallelUserTaskMetadataPipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      scenarioRelativePath: pipelineCase.scenarioRelativePath,
      evidenceRelativePath: pipelineCase.cib?.evidenceRelativePath,
      disagreement: pipelineCase.expectedInjectedDisagreement,
    })),
    [{
      id: "parallel-user-task-metadata-content-then-risk",
      scenarioRelativePath:
        "scenarios/parallel-user-task-metadata-composition/content-then-risk.scenario.json",
      evidenceRelativePath:
        "scenarios/parallel-user-task-metadata-composition/content-then-risk.cibseven-evidence.json",
      disagreement: {
        kind: "observationValue",
        path: "trace[2].openUserTasks[0].metadata.form.fields[0].key",
        expected: "contentApproved",
        actual: "riskApproved",
      },
    }, {
      id: "parallel-user-task-metadata-risk-then-content",
      scenarioRelativePath:
        "scenarios/parallel-user-task-metadata-composition/risk-then-content.scenario.json",
      evidenceRelativePath:
        "scenarios/parallel-user-task-metadata-composition/risk-then-content.cibseven-evidence.json",
      disagreement: {
        kind: "observationValue",
        path: "trace[4].openUserTasks.length",
        expected: 1,
        actual: 0,
      },
    }],
  );
});

test("makes metadata swap and sibling drop reach their exact loci", async () => {
  const contexts = await loadAndCompileCases(parallelUserTaskMetadataPipelineCases);
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
      throw new Error("parallel metadata mutation did not create a disagreement");
    }
    assert.deepEqual(
      comparison.disagreement,
      context.pipelineCase.expectedInjectedDisagreement,
    );
  }
});
