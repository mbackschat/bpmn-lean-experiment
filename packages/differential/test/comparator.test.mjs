import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
  compareTargetResults,
} from "../dist/index.js";

const calibratedResult = {
  outcome: {
    kind: "semantic",
    outcome: "committed",
  },
  trace: [
    {
      kind: "deployment",
      outcome: "committed",
    },
    {
      kind: "state",
      instanceId: "Instance_1",
      status: "running",
      activeWaits: [
        {
          elementId: "UserTask_Approve",
          kind: "userTask",
          multiplicity: 1,
        },
      ],
      openUserTasks: [],
      openTimers: [],
      openEffects: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
  ],
};

function target(targetName, result = calibratedResult) {
  return {
    target: targetName,
    result,
  };
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
  const mutatedResult = structuredClone(calibratedResult);
  mutatedResult.trace[1].status = "completed";

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
  const outcomeMutation = structuredClone(calibratedResult);
  outcomeMutation.outcome.outcome = "rejected";
  assert.equal(
    compareTargetResults(target(DifferentialTarget.CibSeven), [
      target(DifferentialTarget.Lean, outcomeMutation),
    ]).disagreement.kind,
    DisagreementKind.Outcome,
  );

  const lengthMutation = structuredClone(calibratedResult);
  lengthMutation.trace.pop();
  assert.equal(
    compareTargetResults(target(DifferentialTarget.CibSeven), [
      target(DifferentialTarget.Lean, lengthMutation),
    ]).disagreement.kind,
    DisagreementKind.TraceLength,
  );

  const kindMutation = structuredClone(calibratedResult);
  kindMutation.trace[1] = {
    kind: "command",
    commandId: "start-process",
    outcome: "committed",
  };
  assert.equal(
    compareTargetResults(target(DifferentialTarget.CibSeven), [
      target(DifferentialTarget.Lean, kindMutation),
    ]).disagreement.kind,
    DisagreementKind.ObservationKind,
  );
});
