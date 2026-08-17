/** Durable structured-value, replacement, retry, conflict, history, and replay evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  ScenarioResult,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  durableUpdateOutcomes,
  getTestProcessHandle,
  readTestProcessTerminalResult,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  reconcileHarnessTraceEvidence,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";
import {
  loadStructuredHumanWorkTemporalFixture,
} from "./structured-human-work-temporal-fixture.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 10_000;
const identity = "bpmn-lean-structured-human-work";

test("mixed structured values survive replacement, retry, conflict, history, and replay", async () => {
  const fixture = await loadStructuredHumanWorkTemporalFixture();
  assert.notEqual(
    contentBoundUpdateId(fixture.completion),
    contentBoundUpdateId(fixture.reorderedCompletion),
  );
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "structured Human Work Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const started = await startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      throw new TypeError("structured Human Work Workflow was rejected");
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    assert.deepEqual(
      await waitForOpenUserTaskIds(handle, ["ReviewException"]),
      [{
        id: fixture.completion.taskId,
        name: "Review exception",
        state: "active",
        metadata: {
          assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
        },
      }],
    );

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );
    const waitingTrace = await readBpmnProcessTrace(
      environment.client.workflow,
      fixture.start.instanceId,
    );
    const waitingState = waitingTrace.findLast(
      (observation): observation is StateObservation =>
        observation.kind === CanonicalObservationKind.State,
    );
    assert.ok(waitingState !== undefined);
    const conflictBaseline: CompleteUserTaskInstanceStimulus = {
      ...fixture.completion,
      commandId: "structured-list-conflict-probe",
      taskId: { ...fixture.completion.taskId, activation: 2 },
    };
    const reorderedConflict: CompleteUserTaskInstanceStimulus = {
      ...fixture.reorderedCompletion,
      commandId: conflictBaseline.commandId,
      taskId: conflictBaseline.taskId,
    };
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        fixture.start.instanceId,
        conflictBaseline,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: conflictBaseline.commandId,
        outcome: CommandOutcome.Rejected,
      },
    );
    await assert.rejects(
      submitUserTaskCompletion(
        environment.client.workflow,
        fixture.start.instanceId,
        reorderedConflict,
      ),
      (error: unknown) => {
        assert.match(
          causeChain(error),
          /BpmnCommandIdentityConflict|reused with a different stimulus/u,
        );
        return true;
      },
    );
    assert.deepEqual(
      await waitForOpenUserTaskIds(handle, ["ReviewException"]),
      [{
        id: fixture.completion.taskId,
        name: "Review exception",
        state: "active",
        metadata: {
          assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
        },
      }],
    );
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        fixture.start.instanceId,
        fixture.completion,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.completion.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    assert.deepEqual(
      await submitUserTaskCompletion(
        environment.client.workflow,
        fixture.start.instanceId,
        fixture.completion,
      ),
      {
        kind: ProcessCommandResultKind.Semantic,
        commandId: fixture.completion.commandId,
        outcome: CommandOutcome.Committed,
      },
    );

    const receiptValue = (await withDeadline(
      readTestProcessTerminalResult(handle),
      operationDeadlineMs,
      "structured Human Work terminal result",
    )).receipt;
    assert.equal(isCompletedProcessReceipt(receiptValue), true);
    if (!isCompletedProcessReceipt(receiptValue)) {
      throw new TypeError("structured Human Work Workflow returned no receipt");
    }
    const trace = await readBpmnProcessTrace(
      environment.client.workflow,
      fixture.start.instanceId,
    );
    assert.deepEqual(trace, [
      ...fixture.expected.trace.slice(0, -2),
      {
        kind: CanonicalObservationKind.Command,
        commandId: conflictBaseline.commandId,
        outcome: CommandOutcome.Rejected,
      },
      waitingState,
      ...fixture.expected.trace.slice(-2),
    ]);
    assert.deepEqual(receiptValue.finalState, expectedTerminal(fixture.expected));
    assertExactStructuredValues(receiptValue.finalState);

    const replayHistory = await handle.fetchHistory();
    const history = replayHistory as TemporalHistory;
    assert.deepEqual(
      durableUpdateOutcomes(history),
      new Map([
        [conflictBaseline.commandId, CommandOutcome.Rejected],
        [fixture.completion.commandId, CommandOutcome.Committed],
      ]),
    );
    assert.deepEqual(acceptedCompletionOrder(history), [
      conflictBaseline.commandId,
      fixture.completion.commandId,
    ]);
    assertUpdatesCompleteBeforeWorkflow(history, 2);
    assertNoNonUpdateBpmnHostEvents(history, "structured Human Work");
    reconcileHarnessTraceEvidence(trace, receiptValue, history);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(bundle, replayHistory, handle.workflowId);
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "structured Human Work Temporal environment teardown",
      );
    }
  }
});

function expectedTerminal(expected: ScenarioResult): StateObservation {
  const state = expected.trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.ok(state !== undefined);
  return state;
}

function assertExactStructuredValues(state: StateObservation): void {
  assert.deepEqual(
    state.variables.find(({ name }) => name === "approvedAmount")?.value,
    { kind: VariableValueKind.Integer, value: 4250 },
  );
  assert.deepEqual(
    state.variables.find(({ name }) => name === "riskFlags")?.value,
    {
      kind: VariableValueKind.StringList,
      value: ["policy", "receipt", "policy"],
    },
  );
}

function causeChain(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  while (current instanceof Error && parts.length < 8) {
    parts.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
  return parts.join(" <- ");
}
