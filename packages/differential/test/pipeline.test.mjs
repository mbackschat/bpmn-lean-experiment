import assert from "node:assert/strict";
import { test } from "node:test";

import { ProcessStatus } from "@bpmn-lean/semantic-core";

import {
  ComparisonKind,
  DifferentialTarget,
  DisagreementKind,
} from "../dist/index.js";

import { runMilestoneZeroPipeline } from "./pipeline-harness.mjs";

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
    const { report, evidence } = await runMilestoneZeroPipeline();

    assert.equal(report.comparison.kind, ComparisonKind.Agreement);
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
    assert.ok(
      report.phaseMs.coldTotal < 45_000,
      `cold pipeline took ${report.phaseMs.coldTotal.toFixed(3)}ms`,
    );

    console.log(`M0_PIPELINE_REPORT ${JSON.stringify(report)}`);
  },
);
