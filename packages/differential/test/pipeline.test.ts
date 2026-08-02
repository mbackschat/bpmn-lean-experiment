import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  ProcessCommandResultKind,
  EffectExecutionSchedule,
} from "@bpmn-lean/temporal-adapter";

import {
  ComparisonKind,
  DifferentialTarget,
} from "@bpmn-lean/differential";

import {
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
} from "./pipeline-types.ts";
import {
  pipelineCases,
  runPipelineCases,
} from "./pipeline-harness.ts";
import {
  artifactCases,
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";
import {
  verifyPipelineRegistration,
} from "../../../scripts/capsule-roundtrip.ts";

/**
 * Warm-pipeline feedback budget in milliseconds.
 *
 * The default protects the developer feedback loop on a workstation. It is a
 * host-speed observation, not a semantic invariant, so a slower environment
 * declares its own budget through `BPMN_PIPELINE_WARM_BUDGET_MS` instead of
 * weakening the workstation figure for everyone. Every lane still asserts a
 * hard ceiling, and an overridden budget is announced with the measurement.
 */
const defaultWarmBudgetMs = 15_000;

function warmBudgetMs(environment: NodeJS.ProcessEnv): number {
  const declared = environment.BPMN_PIPELINE_WARM_BUDGET_MS;
  if (declared === undefined) {
    return defaultWarmBudgetMs;
  }
  const budget = Number(declared);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new TypeError(
      `BPMN_PIPELINE_WARM_BUDGET_MS must be a positive number of milliseconds, received ${JSON.stringify(declared)}`,
    );
  }
  return budget;
}

test("rejects a warm-pipeline budget with trailing units", () => {
  assert.throws(
    () =>
      warmBudgetMs({
        BPMN_PIPELINE_WARM_BUDGET_MS: "40000ms",
      }),
    TypeError,
  );
});

test("covers the complete artifact registry with exact evidence routes and seeded mutations", () => {
  assert.doesNotThrow(() =>
    verifyPipelineRegistration(
      artifactCases,
      normativeArtifactCases,
      pipelineCases,
    ),
  );
});

test("rejects incomplete or unprotected pipeline registration", () => {
  const scenarioRelativePath = "scenarios/example/scenario.json";
  const evidenceRelativePath =
    "scenarios/example/cibseven-evidence.json";
  const artifact = { scenarioRelativePath, evidenceRelativePath };

  assert.throws(
    () => verifyPipelineRegistration([artifact], [], []),
    /registered scenario missing from pipeline.*example\/scenario\.json/u,
  );
  assert.throws(
    () =>
      verifyPipelineRegistration([], [{ scenarioRelativePath }], [
        { scenarioRelativePath, cib: null },
      ]),
    /pipeline case has no seeded mutation.*example\/scenario\.json/u,
  );
  assert.throws(
    () =>
      verifyPipelineRegistration([artifact], [], [
        {
          scenarioRelativePath,
          cib: {
            evidenceRelativePath:
              "scenarios/example/different.cibseven-evidence.json",
          },
          injectMutation: () => undefined,
        },
      ]),
    /pipeline CIB evidence route differs from registry/u,
  );
});

const cleanCibProjection = {
  deployments: 0,
  processDefinitions: 0,
  processInstances: 0,
  tasks: 0,
  jobs: 0,
  incidents: 0,
  historicProcessInstances: 0,
};

function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`${label} omitted index ${index}`);
  }
  return value;
}

function requireStateObservation(
  observation: CanonicalObservation,
): StateObservation {
  if (observation.kind !== CanonicalObservationKind.State) {
    throw new Error("expected one canonical state observation");
  }
  return observation;
}

test(
  "runs the admitted semantic capsules through release-bound target batches",
  { timeout: 45_000 },
  async () => {
    assert.deepEqual(
      pipelineCases.map(({ id }) => id),
      [
        "user-task-discovery-completion",
        "user-task-wrong-activation",
        "user-task-stale-completion",
        "parallel-fork-join-a-then-b",
        "parallel-fork-join-b-then-a",
        "parallel-fork-join-stale-a-while-b-active",
        "embedded-subprocess-completion-a-then-b",
        "embedded-subprocess-completion-b-then-a",
        "embedded-subprocess-completion-stale-a-while-b-active",
        "embedded-subprocess-completion-stale-a-after-scope",
        "subprocess-error-propagation-trigger-first",
        "subprocess-error-propagation-sibling-first",
        "subprocess-error-propagation-stale-sibling-after-error",
        "intermediate-catch-timer-pt1s",
        "timer-user-task-composition",
        "intermediate-catch-message",
        "message-addressed-receive-task",
        "exclusive-gateway-simple-boolean-first-true",
        "inclusive-gateway-one-true",
        "inclusive-gateway-both-true-a-then-b",
        "inclusive-gateway-both-true-b-then-a",
        "inclusive-gateway-default",
        "service-task-effect-success",
        "a12-create-document-data",
        "a12-boundary-error-caught",
      ],
    );
    const { report, evidence } = await runPipelineCases(pipelineCases);

    assert.equal(report.kind, "bpmnPipelineReport");
    assert.equal(report.cases.length, pipelineCases.length);
    assert.equal(evidence.length, pipelineCases.length);
    for (const [index, caseReport] of report.cases.entries()) {
      const pipelineCase = requiredAt(
        pipelineCases,
        index,
        "pipeline cases",
      );
      const caseEvidence = requiredAt(evidence, index, "case evidence");
      const expectedWaitState = requireStateObservation(
        requiredAt(
          caseEvidence.expectedWaitTrace,
          2,
          "expected wait trace",
        ),
      );
      const firstCallerWaitState =
        caseEvidence.primaryTemporalResult.trace.find(
          (observation): observation is StateObservation =>
            observation.kind === CanonicalObservationKind.State &&
            observation.openUserTasks.length > 0,
        ) ?? expectedWaitState;
      assert.equal(caseReport.scenario.id, pipelineCase.id);
      assert.equal(caseEvidence.scenarioId, pipelineCase.id);
      assert.equal(
        caseReport.comparison.kind,
        ComparisonKind.Agreement,
        JSON.stringify(caseReport.comparison),
      );
      const isPostTerminal =
        caseReport.scenario.id === "user-task-stale-completion";
      const isSynchronousCreateDocument =
        caseReport.scenario.id === "a12-create-document-data";
      const isSynchronousBoundaryError =
        caseReport.scenario.id === "a12-boundary-error-caught";
      const isSynchronousCibHost =
        isSynchronousCreateDocument ||
        isSynchronousBoundaryError;
      const hasCib = pipelineCase.cib !== null;
      assert.equal(
        caseReport.comparison.targets.includes(
          DifferentialTarget.Temporal,
        ),
        !isPostTerminal,
      );
      assert.equal(
        caseReport.comparison.targets.includes(
          DifferentialTarget.CibSeven,
        ),
        hasCib && !isSynchronousCibHost,
      );
      if (isSynchronousCibHost) {
        assert.deepEqual(caseReport.cibHostComparison, {
          kind: ComparisonKind.Agreement,
          targets: [
            DifferentialTarget.CibSeven,
            DifferentialTarget.Lean,
          ],
        });
      } else {
        assert.equal(caseReport.cibHostComparison, null);
      }
      if (isPostTerminal) {
        assert.deepEqual(caseReport.temporalPrefixComparison, {
          kind: ComparisonKind.Agreement,
          targets: [
            DifferentialTarget.SemanticCore,
            DifferentialTarget.Temporal,
          ],
        });
      } else {
        assert.equal(caseReport.temporalPrefixComparison, null);
      }
      assert.deepEqual(
        caseReport.evidenceComparison,
        hasCib
          ? {
              kind: ComparisonKind.Agreement,
              targets: [
                DifferentialTarget.RetainedCibEvidence,
                DifferentialTarget.CibSeven,
              ],
            }
          : null,
      );
      assert.deepEqual(caseReport.scenario.semanticProcess, {
        kind: "semanticProcess",
        compiler: "bpmn-source-semantic-process",
      });
      assert.deepEqual(caseReport.scenario.checkedProcess, {
        kind: "checkedProcess",
      });
      assert.deepEqual(
        caseEvidence.actualWaitTrace,
        caseEvidence.expectedWaitTrace,
      );
      assert.deepEqual(
        caseEvidence.isolationTemporalResult,
        caseEvidence.primaryTemporalResult,
      );
      assert.deepEqual(
        caseEvidence.cibCleanup,
        hasCib ? cleanCibProjection : null,
      );

      assert.deepEqual(caseReport.injectedDisagreement, {
        kind: ComparisonKind.Disagreement,
        referenceTarget:
          pipelineCase.cib?.relation ===
              CibCaseRelation.ExactSemantic
            ? DifferentialTarget.CibSeven
            : DifferentialTarget.Lean,
        candidateTarget: DifferentialTarget.SemanticCore,
        disagreement: pipelineCase.expectedInjectedDisagreement,
      });

      assert.notEqual(caseEvidence.temporalInteractionEvidence, null);
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openUserTasksAtWait,
        firstCallerWaitState.openUserTasks,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openTimersAtWait,
        expectedWaitState.openTimers,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openEffectsAtWait,
        expectedWaitState.openEffects,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.completionOutcomes,
        caseEvidence.expectedCompletionOutcomes,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence
          .openUserTasksAfterCompletions,
        caseEvidence.expectedOpenUserTasksAfterCompletions,
      );
      assert.equal(
        caseEvidence.temporalInteractionEvidence
          .postTerminalResult?.kind ?? null,
        caseEvidence.expectedPostTerminalResultKind,
      );
      assert.equal(
        caseEvidence.expectedPostTerminalResultKind,
        isPostTerminal
          ? ProcessCommandResultKind.ProcessClosed
          : null,
      );
      assert.equal(
        caseEvidence.temporalInteractionEvidence
          .duplicateCompletionOutcome,
        caseReport.scenario.id === "user-task-stale-completion"
          ? CommandOutcome.Committed
          : null,
      );
      if (caseEvidence.expectedDerivedTimerCommandId !== null) {
        assert.equal(
          caseEvidence.primaryTemporalResult.trace.some(
            (observation) =>
              observation.kind === "command" &&
              observation.commandId ===
                caseEvidence.expectedDerivedTimerCommandId,
          ),
          true,
        );
      }
      if (caseEvidence.expectedDerivedEffectCommandId !== null) {
        assert.equal(
          caseEvidence.primaryTemporalResult.trace.some(
            (observation) =>
              observation.kind === "command" &&
              observation.commandId ===
                caseEvidence.expectedDerivedEffectCommandId,
          ),
          true,
        );
        if (
          pipelineCase.cib?.effectExecutionSchedule ===
            CibEffectExecutionSchedule.FailAfterMutationOnce
        ) {
          assert.deepEqual(caseEvidence.cibEffectRetryEvidence, {
            afterCommandId: caseEvidence.expectedDerivedEffectCommandId,
            schedule: "failAfterMutationOnce",
            invocations: 2,
            mutations: 1,
            initialRetries: 3,
            retriesAfterFirstFailure: 2,
          });
        } else {
          assert.equal(caseEvidence.cibEffectRetryEvidence, null);
        }
        assert.notEqual(caseEvidence.primaryEffectProbeEvidence, null);
        assert.notEqual(caseEvidence.isolationEffectProbeEvidence, null);
        if (
          caseEvidence.primaryEffectProbeEvidence === null ||
          caseEvidence.isolationEffectProbeEvidence === null
        ) {
          throw new Error(
            "Service Task evidence omitted effect probe results",
          );
        }
        assert.equal(
          caseEvidence.primaryEffectProbeEvidence.invocations,
          1,
        );
        assert.equal(
          caseEvidence.primaryEffectProbeEvidence.mutations,
          1,
        );
        assert.equal(
          caseEvidence.isolationEffectProbeEvidence.invocations,
          pipelineCase.effectSchedules?.isolation ===
            EffectExecutionSchedule.FailAfterMutationOnce
            ? 2
            : 1,
        );
        assert.equal(
          caseEvidence.isolationEffectProbeEvidence.mutations,
          1,
        );
      } else {
        assert.equal(caseEvidence.cibEffectRetryEvidence, null);
        assert.equal(caseEvidence.primaryEffectProbeEvidence, null);
        assert.equal(caseEvidence.isolationEffectProbeEvidence, null);
      }
    }
    assert.deepEqual(report.replay, {
      liveHistories: pipelineCases.reduce(
        (count, pipelineCase) =>
          count +
          (pipelineCase.replaySelection ===
              PipelineReplaySelection.PrimaryAndIsolation
            ? 2
            : 1),
        0,
      ),
    });
    assert.deepEqual(report.leanDefinitionMutation, {
      kind: "rejected",
      mutation: "operationOrigin",
    });
    assert.deepEqual(report.leanScenarioMutation, {
      kind: "rejected",
      mutation: "scenarioExtraField",
    });
    assert.deepEqual(report.leanProvenanceMutation, {
      kind: "rejected",
      mutation: "parallelControlPlaceProvenanceErasure",
    });
    assert.equal(
      report.isolation.temporalWorkflowIds.length,
      pipelineCases.length * 2,
    );
    assert.equal(
      new Set(report.isolation.temporalWorkflowIds).size,
      report.isolation.temporalWorkflowIds.length,
    );
    const warmBudget = warmBudgetMs(process.env);
    if (warmBudget !== defaultWarmBudgetMs) {
      console.log(
        `BPMN_PIPELINE_WARM_BUDGET ${warmBudget.toFixed(0)}ms declared instead of the ${defaultWarmBudgetMs}ms workstation budget`,
      );
    }
    assert.ok(
      report.phaseMs.warmTotal < warmBudget,
      `warm pipeline took ${report.phaseMs.warmTotal.toFixed(3)}ms against a ${warmBudget.toFixed(0)}ms budget`,
    );
    if (report.buildMode === "measured") {
      const coldTotal = report.phaseMs.coldTotal;
      assert.notEqual(coldTotal, null);
      if (coldTotal === null) {
        throw new Error("measured pipeline omitted cold timing");
      }
      assert.ok(
        coldTotal < 45_000,
        `cold pipeline took ${coldTotal.toFixed(3)}ms`,
      );
    } else {
      assert.equal(report.buildMode, "prebuilt");
      assert.equal(report.phaseMs.coldTotal, null);
    }

    console.log(`BPMN_MVP_PIPELINE_REPORT ${JSON.stringify(report)}`);
  },
);
