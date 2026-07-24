import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";

import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
} from "../dist/index.js";

import {
  pipelineCases,
  runPipelineCases,
} from "./pipeline-harness.mjs";

const cleanCibProjection = {
  deployments: 0,
  processDefinitions: 0,
  processInstances: 0,
  tasks: 0,
  jobs: 0,
  incidents: 0,
  historicProcessInstances: 0,
};

test(
  "runs the current User Task witnesses through one four-target batch",
  { timeout: 45_000 },
  async () => {
    assert.deepEqual(
      pipelineCases.map(({ id }) => id),
      [
        "user-task-discovery-completion",
        "user-task-wrong-activation",
        "user-task-stale-completion",
      ],
    );
    const { report, evidence } = await runPipelineCases(pipelineCases);

    assert.equal(report.kind, "bpmnPipelineReport");
    assert.equal(report.cases.length, pipelineCases.length);
    assert.equal(evidence.length, pipelineCases.length);
    for (const [index, caseReport] of report.cases.entries()) {
      const caseEvidence = evidence[index];
      assert.equal(caseReport.scenario.id, pipelineCases[index].id);
      assert.equal(caseEvidence.scenarioId, pipelineCases[index].id);
      assert.equal(caseReport.comparison.kind, ComparisonKind.Agreement);
      assert.deepEqual(caseReport.evidenceComparison, {
        kind: ComparisonKind.Agreement,
        targets: [
          DifferentialTarget.RetainedCibEvidence,
          DifferentialTarget.CibSeven,
        ],
      });
      assert.deepEqual(caseReport.scenario.executableIr, {
        kind: "sequentialUserTask",
        compiler: "bpmn-source-sequential-user-task",
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
        referenceTarget: DifferentialTarget.CibSeven,
        candidateTarget: DifferentialTarget.SemanticCore,
        disagreement: {
          kind: DisagreementKind.ObservationValue,
          path: "trace[2].openUserTasks[0].id.activation",
          expected: 1,
          actual: 2,
        },
      });

      assert.notEqual(caseEvidence.temporalInteractionEvidence, null);
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openUserTasksAtWait,
        caseEvidence.expectedWaitTrace[2].openUserTasks,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.completionOutcomes,
        caseEvidence.expectedCompletionOutcomes,
      );
      assert.equal(
        caseEvidence.temporalInteractionEvidence
          .duplicateCompletionOutcome,
        caseReport.scenario.id === "user-task-stale-completion"
          ? CommandOutcome.Committed
          : null,
      );
    }
    assert.deepEqual(report.replay, {
      liveHistories: 3,
    });
    assert.equal(report.isolation.temporalWorkflowIds.length, 6);
    assert.equal(
      new Set(report.isolation.temporalWorkflowIds).size,
      report.isolation.temporalWorkflowIds.length,
    );
    assert.ok(
      report.phaseMs.warmTotal < 15_000,
      `warm pipeline took ${report.phaseMs.warmTotal.toFixed(3)}ms`,
    );
    if (report.buildMode === "measured") {
      assert.ok(
        report.phaseMs.coldTotal < 45_000,
        `cold pipeline took ${report.phaseMs.coldTotal.toFixed(3)}ms`,
      );
    } else {
      assert.equal(report.buildMode, "prebuilt");
      assert.equal(report.phaseMs.coldTotal, null);
    }

    console.log(`BPMN_MVP_PIPELINE_REPORT ${JSON.stringify(report)}`);
  },
);
