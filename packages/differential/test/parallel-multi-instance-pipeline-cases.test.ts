import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  parallelMultiInstancePipelineCases,
} from "./parallel-multi-instance-pipeline-cases.ts";
import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";

test("registers all, first, and interrupting Timer schedules independently", () => {
  assert.deepEqual(
    parallelMultiInstancePipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      completionDelivery: pipelineCase.completionDelivery,
      schedule: pipelineCase.executionSchedule,
      relation: pipelineCase.temporalRelation,
      disagreement: pipelineCase.expectedInjectedDisagreement,
    })),
    [{
      id: "parallel-multi-instance-all",
      completionDelivery: TemporalCompletionDelivery.OrderedWithClosedReceipt,
      schedule: TemporalExecutionSchedule.Normal,
      relation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
      disagreement: {
        kind: "observationValue",
        path: "trace[8].variables[1].value.value[0]",
        expected: "security-high",
        actual: "privacy-low",
      },
    }, {
      id: "parallel-multi-instance-first",
      completionDelivery: TemporalCompletionDelivery.OrderedWithClosedReceipt,
      schedule: TemporalExecutionSchedule.Normal,
      relation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
      disagreement: {
        kind: "observationValue",
        path: "trace[4].openUserTasks.length",
        expected: 0,
        actual: 1,
      },
    }, {
      id: "parallel-multi-instance-interrupted",
      completionDelivery: TemporalCompletionDelivery.Ordered,
      schedule: TemporalExecutionSchedule.StimulusOrder,
      relation: TemporalCaseRelation.ExactSemantic,
      disagreement: {
        kind: "observationValue",
        path: "trace[6].openUserTasks.length",
        expected: 1,
        actual: 2,
      },
    }],
  );
});

test("detects result reordering, retained first-policy siblings, and stale interrupted work", async () => {
  const contexts = await loadAndCompileCases(parallelMultiInstancePipelineCases);
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
      throw new Error(`${context.pipelineCase.id} mutation was not detected`);
    }
    assert.deepEqual(
      comparison.disagreement,
      context.pipelineCase.expectedInjectedDisagreement,
    );
  }
});
