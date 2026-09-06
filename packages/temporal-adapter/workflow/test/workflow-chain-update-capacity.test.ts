import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  applyStimulus,
  initialState,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  WorkflowChainCapacityState,
  WorkflowChainFenceState,
  WorkflowChainRecoveryIngressKind,
  WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
  validateWorkflowChainUpdate,
} from "@bpmn-lean/temporal-workflow";
import type { WorkflowChainRuntime } from "@bpmn-lean/temporal-workflow";
import {
  publicationCompletion,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

for (const [padding, runOrdinal] of [[900, 1], [1_800, 2]] as const) {
  test(`classifies fresh production recovery-byte exhaustion in Run ${runOrdinal} without validator mutation`, () => {
    const runtime = workflowChain(runOrdinal);
    const started = applyStimulus(publicationProgram, initialState, publicationStart);
    assert.equal(started.outcome, CommandOutcome.Committed);
    const entryLimit = workflowChainProductionLimit(
      WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    );
    for (let index = 0; index < entryLimit; index += 1) {
      const stimulus = {
        ...publicationCompletion("UserTask_A", 99),
        commandId: `rejected-${index}-${"x".repeat(padding)}`,
      };
      assert.equal(isWellFormedStimulus(stimulus), true);
      assert.ok(workflowChainCanonicalUtf8ByteLength(stimulus) <
        workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes));
      const ingress = runtime.capacity.classifyUpdateIngress(runtime.recovery, stimulus, 1);
      if (ingress.kind === WorkflowChainRecoveryIngressKind.CapacityExceeded) {
        const before = runtime.recovery.snapshot();
        const byteLimit = workflowChainProductionLimit(
          WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
        );
        assert.ok(before.length > 0 && before.length < entryLimit);
        assert.ok(workflowChainCanonicalUtf8ByteLength(before) < byteLimit);
        assert.equal(ingress.failure.budget, WorkflowChainBudgetKind.CommandRecoveryLedgerBytes);
        assert.equal(ingress.failure.configuredBound, byteLimit);
        assert.ok(ingress.failure.observedValue > byteLimit);
        assert.equal(ingress.failure.processInstanceId, publicationStart.instanceId);
        assert.equal(ingress.failure.runOrdinal, runOrdinal);
        assert.equal(ingress.failure.publicRevision, 1);
        assert.equal(runtime.capacity.pendingFailure(), null);
        assert.throws(() => validateWorkflowChainUpdate(
          runtime, WorkflowChainFenceState.Active, stimulus, 1,
        ), (error: unknown) => {
          assert.ok(error instanceof ApplicationFailure, String(error));
          assert.equal(error.type, bpmnWorkflowChainCapacityExhaustedFailureType);
          assert.equal(error.nonRetryable, true);
          assert.deepEqual(error.details, [ingress.failure]);
          return true;
        });
        assert.equal(runtime.capacity.pendingFailure(), null);
        assert.deepEqual(runtime.recovery.snapshot(), before);
        return;
      }
      assert.equal(ingress.kind, WorkflowChainRecoveryIngressKind.Unseen);
      validateWorkflowChainUpdate(runtime, WorkflowChainFenceState.Active, stimulus, 1);
      const admission = runtime.recovery.preflight(stimulus);
      assert.equal(admission.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
      if (admission.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
        assert.fail("production recovery capacity refused a classified admissible command");
      }
      const evaluated = applyStimulus(publicationProgram, started.state, stimulus);
      assert.equal(evaluated.outcome, CommandOutcome.Rejected);
      assert.equal(evaluated.state, started.state);
      runtime.capacity.observeRecoveryRecord(
        runtime.recovery.record(admission.admission, evaluated.outcome), 1,
      );
      assert.equal(runtime.capacity.pendingFailure(), null);
    }
    assert.fail("byte capacity was not reached before entry capacity");
  });
}

function workflowChain(runOrdinal: number): WorkflowChainRuntime {
  return {
    eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
    eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes),
    runId: `run-${runOrdinal}`,
    runOrdinal,
    firstExecutionRunId: "run-1",
    segmentDirectory: {
      format: "bpmn-lean.workflow-publication-segment-directory.v1",
      segments: [],
    },
    recovery: new WorkflowCommandRecoveryLedger(),
    capacity: new WorkflowChainCapacityState({
      processInstanceId: publicationStart.instanceId,
      runOrdinal,
    }),
    commandCapacity: new WorkflowCommandCapacityState(),
  };
}
