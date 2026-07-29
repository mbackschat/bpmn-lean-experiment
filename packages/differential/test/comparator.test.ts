import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioOutcomeKind,
  WaitKind,
} from "@bpmn-lean/semantic-core";
import type { ScenarioResult } from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
  compareTargetResults,
} from "@bpmn-lean/differential";
import type {
  Comparison,
  ScenarioDisagreement,
  TargetScenarioResult,
} from "@bpmn-lean/differential";

import type {
  MutableScenarioResult,
} from "./pipeline-types.ts";

const calibratedResult: ScenarioResult = {
  outcome: {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  },
  trace: [
    {
      kind: CanonicalObservationKind.Deployment,
      outcome: CommandOutcome.Committed,
    },
    {
      kind: CanonicalObservationKind.State,
      instanceId: "Instance_1",
      status: ProcessStatus.Running,
      activeWaits: [
        {
          elementId: "UserTask_Approve",
          kind: WaitKind.UserTask,
          multiplicity: 1,
        },
      ],
      openUserTasks: [],
      openTimers: [],
      openEffects: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
  ],
};

function target(
  targetName: DifferentialTarget,
  result: ScenarioResult = calibratedResult,
): TargetScenarioResult {
  return {
    target: targetName,
    result,
  };
}

function mutableResult(): MutableScenarioResult {
  return structuredClone(calibratedResult) as MutableScenarioResult;
}

function requireDisagreement(comparison: Comparison): ScenarioDisagreement {
  assert.ok(
    comparison.kind === ComparisonKind.Disagreement,
    "the comparison must classify a disagreement",
  );
  return comparison.disagreement;
}

function stateObservation(
  result: MutableScenarioResult,
  index: number,
): Extract<
  MutableScenarioResult["trace"][number],
  { kind: CanonicalObservationKind.State }
> {
  const observation = result.trace[index];
  assert.ok(
    observation?.kind === CanonicalObservationKind.State,
    `trace[${index}] must be a state observation`,
  );
  return observation;
}

test("accepts exact canonical agreement across all declared targets", () => {
  const comparison = compareTargetResults(
    target(DifferentialTarget.CibSeven),
    [
      target(DifferentialTarget.Lean),
      target(DifferentialTarget.SemanticCore),
      target(DifferentialTarget.Temporal),
    ],
  );

  assert.deepEqual(comparison, {
    kind: ComparisonKind.Agreement,
    targets: [
      DifferentialTarget.CibSeven,
      DifferentialTarget.Lean,
      DifferentialTarget.SemanticCore,
      DifferentialTarget.Temporal,
    ],
  });
});

test("classifies an injected observation-value disagreement at its first path", () => {
  const mutatedResult = mutableResult();
  stateObservation(mutatedResult, 1).status = ProcessStatus.Completed;

  const comparison = compareTargetResults(
    target(DifferentialTarget.CibSeven),
    [target(DifferentialTarget.SemanticCore, mutatedResult)],
  );

  assert.deepEqual(comparison, {
    kind: ComparisonKind.Disagreement,
    referenceTarget: DifferentialTarget.CibSeven,
    candidateTarget: DifferentialTarget.SemanticCore,
    disagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[1].status",
      expected: "running",
      actual: "completed",
    },
  });
});

test("distinguishes outcome, trace-length, and observation-kind disagreements", () => {
  const outcomeMutation = mutableResult();
  outcomeMutation.outcome = {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Rejected,
  };
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Lean, outcomeMutation),
      ]),
    ).kind,
    DisagreementKind.Outcome,
  );

  const lengthMutation = mutableResult();
  lengthMutation.trace.pop();
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Lean, lengthMutation),
      ]),
    ).kind,
    DisagreementKind.TraceLength,
  );

  const kindMutation = mutableResult();
  kindMutation.trace[1] = {
    kind: CanonicalObservationKind.Command,
    commandId: "start-process",
    outcome: CommandOutcome.Committed,
  };
  assert.equal(
    requireDisagreement(
      compareTargetResults(target(DifferentialTarget.CibSeven), [
        target(DifferentialTarget.Lean, kindMutation),
      ]),
    ).kind,
    DisagreementKind.ObservationKind,
  );
});
