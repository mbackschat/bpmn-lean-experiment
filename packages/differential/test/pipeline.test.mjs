import assert from "node:assert/strict";
import { test } from "node:test";

import { ProcessStatus } from "@bpmn-lean/semantic-core";

import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
} from "../dist/index.js";

import {
  pipelineCases,
  runPipelineCase,
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
  "runs and compares the complete Milestone 0 pipeline within budget",
  { timeout: 45_000 },
  async () => {
    assert.equal(pipelineCases.length, 1);
    assert.equal(pipelineCases[0].id, "m0-sequential-user-task");
    const { report, evidence } = await runPipelineCase(pipelineCases[0]);

    assert.equal(report.comparison.kind, ComparisonKind.Agreement);
    assert.deepEqual(report.evidenceComparison, {
      kind: ComparisonKind.Agreement,
      targets: [
        DifferentialTarget.RetainedCibEvidence,
        DifferentialTarget.CibSeven,
      ],
    });
    assert.deepEqual(report.scenario.executableIr, {
      schemaVersion: "0.1.0",
      kind: "sequentialUserTask",
      compiler: "bpmn-source-sequential-user-task@0.1.0",
    });
    assert.deepEqual(evidence.actualWaitTrace, evidence.expectedWaitTrace);
    assert.deepEqual(
      evidence.isolationTemporalResult,
      evidence.primaryTemporalResult,
    );
    assert.deepEqual(evidence.cibCleanup, cleanCibProjection);
    assert.deepEqual(report.injectedDisagreement, {
      kind: ComparisonKind.Disagreement,
      referenceTarget: DifferentialTarget.CibSeven,
      candidateTarget: DifferentialTarget.SemanticCore,
      disagreement: {
        kind: DisagreementKind.ObservationValue,
        path: "trace[2].status",
        expected: ProcessStatus.Running,
        actual: ProcessStatus.Completed,
      },
    });
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

    console.log(`M0_PIPELINE_REPORT ${JSON.stringify(report)}`);
  },
);
