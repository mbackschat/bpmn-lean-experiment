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
} from "@bpmn-lean/temporal-testkit";

import {
  ComparisonKind,
  DifferentialTarget,
} from "@bpmn-lean/differential";

import {
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
  TemporalCaseRelation,
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
import {
  cibMavenBuildDirectory,
} from "./pipeline-cib-targets.ts";
import { settleOwnedLanes } from "./pipeline-parallel.ts";
import {
  coldBudgetMsFor,
  defaultWarmBudgetMs,
  timingIsComparable,
  warmBudgetMs,
  warmPipelineTestTimeoutMs,
  warmSoftTargetMsFor,
} from "../../../scripts/pipeline-budget.ts";

/**
 * Warm-pipeline feedback measures in milliseconds.
 *
 * Two tiers, because wall clock on a shared workstation mixes two different
 * facts. The soft target is the developer feedback loop this pipeline is
 * designed for; exceeding it is reported with the measurement so a real
 * performance regression stays visible in gate output. The hard ceiling is a
 * pathology detector for a hang or a runaway lane, deliberately set well above
 * the soft target so unrelated CPU load on the host cannot fail a correctness
 * gate. Neither is a semantic invariant, and a slower environment still
 * declares its own ceiling through `BPMN_PIPELINE_WARM_BUDGET_MS`.
 *
 * Performance comparison uses the exact `phaseMs.warmTotal` figure the report
 * emits, compared against the last uncontended measurement recorded in
 * `docs/PLAN.md`. The ceiling never substitutes for that comparison.
 */
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

test("isolates every concurrent CIB Maven batch output", () => {
  const first = cibMavenBuildDirectory("/tmp/cib-2.2-plain-output.jsonl");
  const second = cibMavenBuildDirectory("/tmp/cib-2.2-incident-output.jsonl");
  const third = cibMavenBuildDirectory("/tmp/cib-2.0-plain-output.jsonl");

  assert.notEqual(first, second);
  assert.notEqual(first, third);
  assert.match(first, /cib-2\.2-plain-output\.jsonl\.maven$/u);
});

test("joins every owned lane before surfacing one parallel failure", async () => {
  let siblingFinished = false;
  const failing = Promise.reject(new Error("first lane failed"));
  const sibling = new Promise<string>((resolve) => {
    setTimeout(() => {
      siblingFinished = true;
      resolve("finished");
    }, 10);
  });

  await assert.rejects(
    settleOwnedLanes([failing, sibling] as const),
    /first lane failed/u,
  );
  assert.equal(siblingFinished, true);
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
  { timeout: warmPipelineTestTimeoutMs(process.env) },
  async () => {
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
      assert.equal(caseReport.scenario.id, pipelineCase.id);
      assert.equal(caseEvidence.scenarioId, pipelineCase.id);
      assert.equal(
        caseReport.comparison.kind,
        ComparisonKind.Agreement,
        JSON.stringify(caseReport.comparison),
      );
      const isPostTerminal =
        caseReport.scenario.id === "user-task-stale-completion";
      const isSynchronousMappedSuccess =
        caseReport.scenario.id === "mapped-success-service-task";
      const isSynchronousBoundaryError =
        caseReport.scenario.id ===
          "mapped-boundary-error-service-task-caught";
      const isSynchronousCibHost =
        isSynchronousMappedSuccess ||
        isSynchronousBoundaryError;
      const isServiceTaskIncident =
        caseReport.scenario.id ===
          "service-task-effect-incident-retry-success";
      const isServiceTaskIncidentCancellation =
        caseReport.scenario.id ===
          "service-task-effect-incident-root-cancellation";
      const expectedWaitState = requireStateObservation(
        requiredAt(
          caseEvidence.expectedWaitTrace,
          isServiceTaskIncident || isServiceTaskIncidentCancellation ? 4 : 2,
          "expected wait trace",
        ),
      );
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
        caseEvidence.expectedOpenUserTasksAtFirstCompletionWait,
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
        pipelineCase.temporalRelation === TemporalCaseRelation.ExactSemantic
          ? null
          : ProcessCommandResultKind.ProcessClosed,
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
          isServiceTaskIncident ? 2 : 1,
        );
        assert.equal(
          caseEvidence.primaryEffectProbeEvidence.mutations,
          1,
        );
        assert.equal(
          caseEvidence.isolationEffectProbeEvidence.invocations,
          isServiceTaskIncident
            ? 2
            : pipelineCase.effectSchedules?.isolation ===
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
        if (isServiceTaskIncidentCancellation) {
          assert.deepEqual(caseEvidence.primaryEffectProbeEvidence, {
            invocations: 1,
            mutations: 1,
            keys: caseEvidence.primaryEffectProbeEvidence?.keys ?? [],
          });
          assert.deepEqual(caseEvidence.isolationEffectProbeEvidence, {
            invocations: 1,
            mutations: 1,
            keys: caseEvidence.isolationEffectProbeEvidence?.keys ?? [],
          });
        } else {
          assert.equal(caseEvidence.primaryEffectProbeEvidence, null);
          assert.equal(caseEvidence.isolationEffectProbeEvidence, null);
        }
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
        `BPMN_PIPELINE_WARM_BUDGET ${warmBudget.toFixed(0)}ms declared instead of the ${defaultWarmBudgetMs}ms default ceiling`,
      );
    }
    // Derived from the registered catalog so the target measures per-case speed rather than how
    // many cases exist; a fixed total made every run on a grown catalog breach it.
    // A timing figure is only comparable against a run under similar load, and this project has
    // recorded a figure as uncontended that was taken on a busy host. Asserting the host block
    // exists is what keeps that checkable: the number travels with the load it was measured under,
    // including into any document that quotes this line.
    assert.ok(report.host.cores >= 1, "the report must record the host it was measured on");
    assert.ok(
      Number.isFinite(report.host.loadAverage1m) && report.host.loadAverage1m >= 0,
      "the report must record host load beside its timings",
    );
    assert.equal(
      report.host.loadPerCore,
      report.host.loadAverage1m / report.host.cores,
      "load per core must be derived from the same sample it reports",
    );
    const warmSoftTarget = warmSoftTargetMsFor(pipelineCases.length);
    if (report.phaseMs.warmTotal >= warmSoftTarget) {
      console.log(
        `BPMN_PIPELINE_WARM_SOFT_TARGET exceeded: ${report.phaseMs.warmTotal.toFixed(3)}ms against the ${warmSoftTarget}ms feedback target for ${pipelineCases.length} cases at loadPerCore ${report.host.loadPerCore.toFixed(2)}; a figure above roughly 1 is a contended host and not a comparable measurement`,
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
      const coldBudget = coldBudgetMsFor(pipelineCases.length);
      if (!timingIsComparable(report.host.loadPerCore)) {
        // Reported and left uncounted rather than asserted. The cold phase builds before it measures,
        // so contention lands here first, and a red gate whose only content is a duration taken on a
        // busy host teaches a contributor to re-run rather than to look.
        console.log(
          `BPMN_PIPELINE_COLD uncounted: ${coldTotal.toFixed(3)}ms against the ${coldBudget}ms ceiling for ${pipelineCases.length} cases at loadPerCore ${report.host.loadPerCore.toFixed(2)}`,
        );
      } else {
        assert.ok(
          coldTotal < coldBudget,
          `cold pipeline took ${coldTotal.toFixed(3)}ms against a ${coldBudget}ms ceiling for ${pipelineCases.length} cases at loadPerCore ${report.host.loadPerCore.toFixed(2)}`,
        );
      }
    } else {
      assert.equal(report.buildMode, "prebuilt");
      assert.equal(report.phaseMs.coldTotal, null);
    }

    console.log(`BPMN_MVP_PIPELINE_REPORT ${JSON.stringify(report)}`);
  },
);
