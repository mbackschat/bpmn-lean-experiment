import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";
import {
  CommandOutcome,
  ScenarioOutcomeKind,
} from "@bpmn-lean/semantic-core";
import {
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  sequentialMultiInstancePipelineCases,
} from "./sequential-multi-instance-pipeline-cases.ts";
import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";

test("registers natural closure and interrupted running-trace evidence", () => {
  assert.deepEqual(
    sequentialMultiInstancePipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      schedule: pipelineCase.executionSchedule,
      relation: pipelineCase.temporalRelation,
      disagreement: pipelineCase.expectedInjectedDisagreement,
    })),
    [{
      id: "sequential-multi-instance-natural",
      schedule: TemporalExecutionSchedule.Normal,
      relation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
      disagreement: {
        kind: "observationValue",
        path: "trace[8].variables[1].value.value[0]",
        expected: "accepted",
        actual: "flagged",
      },
    }, {
      id: "sequential-multi-instance-interrupted",
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

test("detects output reordering and an inner task retained after interruption", async () => {
  const contexts = await loadAndCompileCases(
    sequentialMultiInstancePipelineCases,
  );
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

test("consumes later input after an intermediate semantic rejection", async () => {
  const [context] = await loadAndCompileCases(
    sequentialMultiInstancePipelineCases.filter(({ id }) =>
      id === "sequential-multi-instance-interrupted"
    ),
  );
  assert.ok(context !== undefined);
  const firstCompletion = context.scenario.stimuli[1];
  assert.ok(firstCompletion !== undefined);

  const extended = {
    ...context,
    scenario: {
      ...context.scenario,
      stimuli: [
        ...context.scenario.stimuli,
        {
          ...firstCompletion,
          commandId: "refuse-another-stale-review",
        },
      ],
    },
  };
  const result = runCoreTargets([extended]).results.get(context.scenario.id);

  assert.deepEqual(result?.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Rejected,
  });
});
