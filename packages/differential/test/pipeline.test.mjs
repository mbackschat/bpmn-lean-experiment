import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import {
  ProcessCommandResultKind,
} from "@bpmn-lean/temporal-adapter";

import {
  ComparisonKind,
  DifferentialTarget,
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
  "runs the User Task, parallel, and Timer witnesses through one four-target batch",
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
      assert.equal(
        caseReport.comparison.kind,
        ComparisonKind.Agreement,
        JSON.stringify(caseReport.comparison),
      );
      const isPostTerminal =
        caseReport.scenario.id === "user-task-stale-completion";
      assert.equal(
        caseReport.comparison.targets.includes(
          DifferentialTarget.Temporal,
        ),
        !isPostTerminal,
      );
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
        referenceTarget: DifferentialTarget.CibSeven,
        candidateTarget: DifferentialTarget.SemanticCore,
        disagreement: pipelineCases[index].expectedInjectedDisagreement,
      });

      assert.notEqual(caseEvidence.temporalInteractionEvidence, null);
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openUserTasksAtWait,
        caseEvidence.expectedWaitTrace[2].openUserTasks,
      );
      assert.deepEqual(
        caseEvidence.temporalInteractionEvidence.openTimersAtWait,
        caseEvidence.expectedWaitTrace[2].openTimers,
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
    }
    assert.deepEqual(report.replay, {
      liveHistories: 7,
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
    assert.equal(report.isolation.temporalWorkflowIds.length, 14);
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
