import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  WorkflowChainCapacityState,
  WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger,
  buildWorkflowChainSuccessor,
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
  validateIncomingWorkflowContinuation,
} from "../dist/index.js";
import type {
  CommandPublicationState,
  WorkflowChainRuntime,
  WorkflowChainSuccessorArguments,
} from "../dist/index.js";
import {
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

const firstExecutionRunId = "run-1";
const runLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.WorkflowChainRuns,
);

test("accepts the required 128th Run with complete carried state", () => {
  const fixture = successorFixture(runLimit - 1);
  const args = buildSuccessor(fixture);

  assert.equal(args[2].runOrdinal, runLimit);
  assert.equal(args[5].segmentDirectory.segments.length, runLimit - 1);
  assert.equal(
    args[5].segmentDirectory.segments.at(-1)?.runOrdinal,
    runLimit - 1,
  );
  const restored = validateIncomingWorkflowContinuation(
    ...args,
    firstExecutionRunId,
  );
  assert.deepEqual(restored.state, args[3]);
  assert.deepEqual(restored.recovery, args[4]);
  assert.deepEqual(restored.publication, args[5]);
});

test("fails a required 129th Run before reading or closing the current segment", () => {
  const fixture = successorFixture(runLimit);
  let segmentDirectoryRead = false;
  const runtime: WorkflowChainRuntime = {
    ...fixture.runtime,
    get segmentDirectory() {
      segmentDirectoryRead = true;
      throw new Error("current segment must not close after Run capacity");
    },
  };

  assert.throws(
    () => buildSuccessor({ ...fixture, runtime }),
    (error: unknown) => {
      if (!(error instanceof ApplicationFailure) ||
        error.type !== "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED") {
        return false;
      }
      assert.equal(error.nonRetryable, true);
      assert.equal(error.details?.length, 1);
      assert.deepEqual(error.details?.[0], {
        budget: WorkflowChainBudgetKind.WorkflowChainRuns,
        configuredBound: runLimit,
        observedValue: runLimit + 1,
        processInstanceId: publicationStart.instanceId,
        publicRevision: fixture.publication.execution.headRevision,
        runOrdinal: runLimit,
      });
      return true;
    },
  );
  assert.equal(segmentDirectoryRead, false);
});

test("rejects an incoming 129th ordinal as malformed continuation", () => {
  const args = buildSuccessor(successorFixture(runLimit - 1));
  const host = { ...args[2], runOrdinal: runLimit + 1 };

  assert.throws(
    () => validateIncomingWorkflowContinuation(
      args[0],
      args[1],
      host,
      args[3],
      args[4],
      args[5],
      firstExecutionRunId,
    ),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnWorkflowContinuationInvalid" &&
      error.nonRetryable === true,
  );
});

function buildSuccessor(
  fixture: ReturnType<typeof successorFixture>,
): WorkflowChainSuccessorArguments {
  return buildWorkflowChainSuccessor(
    fixture.runtime,
    publicationStart,
    publicationProgram,
    fixture.state,
    fixture.publication,
    [],
  );
}

function successorFixture(runOrdinal: number): Readonly<{
  state: ReturnType<typeof advanceScenario>["state"];
  publication: CommandPublicationState;
  runtime: WorkflowChainRuntime;
}> {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("publication Start did not reach a committed stable state");
  }
  const candidate = integrateCommandPublication(
    publicationProgram,
    createCommandPublicationState(
      publicationProgram,
      publicationStart.instanceId,
    ),
    publicationStart,
    step,
    () => 1_000,
  );
  const publication = recordCommandPublicationOutcome(
    candidate,
    publicationStart,
    step.observations,
  );
  return {
    state: step.state,
    publication,
    runtime: {
      eventHistoryEventLimit: workflowChainProductionLimit(
        WorkflowChainBudgetKind.EventHistoryEvents,
      ),
      eventHistoryByteLimit: workflowChainProductionLimit(
        WorkflowChainBudgetKind.EventHistoryBytes,
      ),
      runId: `run-${runOrdinal}`,
      runOrdinal,
      firstExecutionRunId,
      segmentDirectory: {
        format: "bpmn-lean.workflow-publication-segment-directory.v1",
        segments: Array.from({ length: runOrdinal - 1 }, (_, index) => ({
          format: "bpmn-lean.workflow-publication-segment.v1",
          runId: `run-${index + 1}`,
          runOrdinal: index + 1,
          fromRevision: 0,
          throughRevision: 0,
          sha256: "0".repeat(64),
        })),
      },
      recovery: new WorkflowCommandRecoveryLedger(),
      capacity: new WorkflowChainCapacityState({
        processInstanceId: publicationStart.instanceId,
        runOrdinal,
      }),
      commandCapacity: new WorkflowCommandCapacityState(),
    },
  };
}
