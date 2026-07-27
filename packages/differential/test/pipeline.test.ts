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
} from "@bpmn-lean/temporal-adapter";

import {
  ComparisonKind,
  DifferentialTarget,
} from "@bpmn-lean/differential";

import {
  pipelineCases,
  runPipelineCases,
} from "./pipeline-harness.ts";

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
        "intermediate-catch-timer-pt1s",
        "service-task-effect-success",
        "a12-create-document-data",
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
        !isSynchronousCreateDocument,
      );
      if (isSynchronousCreateDocument) {
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
      assert.deepEqual(caseReport.evidenceComparison, {
        kind: ComparisonKind.Agreement,
        targets: [
          DifferentialTarget.RetainedCibEvidence,
          DifferentialTarget.CibSeven,
        ],
      });
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
      assert.deepEqual(caseEvidence.cibCleanup, cleanCibProjection);

      assert.deepEqual(caseReport.injectedDisagreement, {
        kind: ComparisonKind.Disagreement,
        referenceTarget: isSynchronousCreateDocument
          ? DifferentialTarget.Lean
          : DifferentialTarget.CibSeven,
        candidateTarget: DifferentialTarget.SemanticCore,
        disagreement: pipelineCase.expectedInjectedDisagreement,
      });

      assert.notEqual(caseEvidence.temporalInteractionEvidence, null);
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openUserTasksAtWait,
        expectedWaitState.openUserTasks,
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
        if (isSynchronousCreateDocument) {
          assert.equal(caseEvidence.cibEffectRetryEvidence, null);
        } else {
          assert.deepEqual(caseEvidence.cibEffectRetryEvidence, {
            afterCommandId: caseEvidence.expectedDerivedEffectCommandId,
            schedule: "failAfterMutationOnce",
            invocations: 2,
            mutations: 1,
            initialRetries: 3,
            retriesAfterFirstFailure: 2,
          });
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
          2,
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
      liveHistories: 11,
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
    assert.equal(report.isolation.temporalWorkflowIds.length, 18);
    assert.equal(
      new Set(report.isolation.temporalWorkflowIds).size,
      report.isolation.temporalWorkflowIds.length,
    );
    assert.ok(
      report.phaseMs.warmTotal < 15_000,
      `warm pipeline took ${report.phaseMs.warmTotal.toFixed(3)}ms`,
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
