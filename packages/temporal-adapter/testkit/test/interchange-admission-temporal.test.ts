/** Live Product 1 refinement evidence for Process data composed with preserved notation. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  SemanticProfileId,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  asArray,
  asRecord,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  decodeJsonPayload,
  durableUpdateOutcomes,
  getTestProcessHandle,
  historyEvents as decodedHistoryEvents,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  readBpmnProcessTrace,
  readTestProcessTerminalResult,
  reconcileHarnessTraceEvidence,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
  assertWorkflowChainPatchHistory,
} from "./temporal-history-facts.ts";
import {
  loadJson,
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
const identity = "bpmn-lean-interchange-admission";
const scenarioUrl = new URL(
  "../../../../scenarios/user-task-process-data-preserved-notation/scenario.json",
  import.meta.url,
);
const sourceUrl = new URL(
  "../../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);

type InterchangeFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  expected: ScenarioResult;
}>;

test("Process data with preserved notation survives Worker replacement and replay", async () => {
  const fixture = await loadFixture();
  const bundle = await loadBpmnWorkflowBundle();
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "interchange Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    worker = await startBpmnTestWorker(environment, bundle, identity);
    const handle = await startUntilUserTask(environment, fixture);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${identity}-replacement`,
    );

    const history = await completeAfterReplacement(
      environment,
      fixture,
      handle,
    );
    await stopBpmnTestWorker(worker);
    worker = undefined;
    await replayBpmnHistory(bundle, history, handle.workflowId);
  } finally {
    try {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    } finally {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "interchange Temporal environment teardown",
      );
    }
  }
});

async function loadFixture(): Promise<InterchangeFixture> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(
    scenario.profile,
    SemanticProfileId.UserTaskProcessDataPreservedNotation,
  );
  assert.equal(scenario.bpmn.sourceOverlay, null);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(sourceUrl),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(
    compilation.status,
    BpmnCompilationStatus.Accepted,
    compilation.status === BpmnCompilationStatus.Rejected
      ? JSON.stringify(compilation.diagnostics)
      : undefined,
  );
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("interchange source was not admitted");
  }
  const start = requireStart(scenario);
  const completion = requireCompletion(scenario);
  assert.deepEqual(start.initialVariables, [
    { name: "decision", value: { kind: "string", value: "pending" } },
    {
      name: "requestTitle",
      value: { kind: "string", value: "Review invoice 42" },
    },
  ]);
  assert.deepEqual(completion.submittedValues, [
    { name: "decision", value: { kind: "string", value: "approved" } },
    { name: "reviewNote", value: { kind: "null" } },
  ]);
  return {
    scenario,
    semanticProcess: compilation.semanticProcess,
    start,
    completion,
    expected: runScenario(scenario, compilation.semanticProcess),
  };
}

async function startUntilUserTask(
  environment: TestWorkflowEnvironment,
  fixture: InterchangeFixture,
): Promise<WorkflowHandle> {
  const started = await withDeadline(
    startBpmnProcess(
      environment.client.workflow,
      fixture.start,
      fixture.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    ),
    operationDeadlineMs,
    "interchange Workflow start",
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  if (started.kind !== BpmnProcessStartResultKind.Started) {
    throw new TypeError("interchange Workflow was rejected");
  }
  const handle = getTestProcessHandle(
    environment.client.workflow,
    started.processInstanceId,
  );
  const openTasks = await waitForOpenUserTaskIds(
    handle,
    [fixture.completion.taskId.elementId],
  );
  assert.deepEqual(openTasks.map(({ id }) => id), [fixture.completion.taskId]);
  assert.deepEqual(
    await readBpmnProcessTrace(
      environment.client.workflow,
      fixture.start.instanceId,
    ),
    fixture.expected.trace.slice(0, 3),
  );
  return handle;
}

async function completeAfterReplacement(
  environment: TestWorkflowEnvironment,
  fixture: InterchangeFixture,
  handle: WorkflowHandle,
) {
  assert.deepEqual(
    (await waitForOpenUserTaskIds(
      handle,
      [fixture.completion.taskId.elementId],
    )).map(({ id }) => id),
    [fixture.completion.taskId],
  );
  const commandResult = await submitUserTaskCompletion(
    environment.client.workflow,
    fixture.start.instanceId,
    fixture.completion,
  );
  assert.deepEqual(commandResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: fixture.completion.commandId,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(
    await handle.getUpdateHandle(
      contentBoundUpdateId(fixture.completion),
    ).result(),
    CommandOutcome.Committed,
  );

  const terminal = await withDeadline(
    readTestProcessTerminalResult(handle),
    operationDeadlineMs,
    "interchange terminal result",
  );
  assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
  if (!isCompletedProcessReceipt(terminal.receipt)) {
    throw new TypeError("interchange Workflow returned no completed receipt");
  }
  const trace = await readBpmnProcessTrace(
    environment.client.workflow,
    fixture.start.instanceId,
  );
  assert.deepEqual(trace, fixture.expected.trace);
  assert.deepEqual(terminal.receipt.finalState, expectedTerminal(fixture.expected));
  assertNoPreservedNotationProjection(trace);
  assertNoPreservedNotationProjection(terminal.receipt);

  const rawHistory = await withDeadline(
    handle.fetchHistory(),
    operationDeadlineMs,
    "interchange history fetch",
  );
  const history = rawHistory as TemporalHistory;
  assertExactCompletionPayload(history, fixture.completion);
  assert.deepEqual(
    durableUpdateOutcomes(history),
    new Map([[fixture.completion.commandId, CommandOutcome.Committed]]),
  );
  assert.deepEqual(acceptedCompletionOrder(history), [
    fixture.completion.commandId,
  ]);
  assertUpdatesCompleteBeforeWorkflow(history, 1);
  assertNoNonUpdateBpmnHostEvents(history, "interchange composition");
  assertNoTimerOrActivityEvents(history);
  assertWorkflowChainPatchHistory(history, 1);
  reconcileHarnessTraceEvidence(trace, terminal.receipt, history);
  return rawHistory;
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const stimulus = scenario.stimuli[0];
  if (stimulus?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("interchange scenario has no manual start");
  }
  return stimulus;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli.find(
    ({ kind }) => kind === StimulusKind.CompleteUserTaskInstance,
  );
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("interchange scenario has no User Task completion");
  }
  return stimulus;
}

function expectedTerminal(expected: ScenarioResult): StateObservation {
  const terminal = expected.trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.ok(terminal !== undefined, "interchange scenario has no terminal state");
  return terminal;
}

function assertExactCompletionPayload(
  history: TemporalHistory,
  expected: CompleteUserTaskInstanceStimulus,
): void {
  const accepted = decodedHistoryEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  assert.equal(accepted.length, 1);
  const event = accepted[0];
  assert.ok(event !== undefined);
  const request = asRecord(
    event.attributes.acceptedRequest,
    "accepted interchange Update request",
  );
  const input = asRecord(request.input, "accepted interchange Update input");
  assert.equal(input.name, "bpmn-complete-user-task");
  const args = asRecord(input.args, "accepted interchange Update arguments");
  const payloads = asArray(
    args.payloads,
    "accepted interchange Update argument payloads",
  );
  assert.deepEqual(
    decodeJsonPayload(payloads[0], "accepted interchange completion"),
    expected,
  );
}

function assertNoTimerOrActivityEvents(history: TemporalHistory): void {
  for (const attributesName of [
    "timerFiredEventAttributes",
    "timerCanceledEventAttributes",
    "activityTaskStartedEventAttributes",
    "activityTaskCompletedEventAttributes",
    "activityTaskFailedEventAttributes",
    "childWorkflowExecutionStartedEventAttributes",
    "childWorkflowExecutionCompletedEventAttributes",
    "childWorkflowExecutionFailedEventAttributes",
    "childWorkflowExecutionTerminatedEventAttributes",
  ]) {
    assert.equal(decodedHistoryEvents(history, attributesName).length, 0);
  }
}

function assertNoPreservedNotationProjection(value: unknown): void {
  const forbiddenKeys = new Set([
    "artifacts",
    "collaboration",
    "definitionsMetadata",
    "diagramInterchange",
    "documentation",
    "lanes",
    "rawSource",
    "sourceBytes",
  ]);
  visit(value, (key) => {
    assert.equal(
      forbiddenKeys.has(key),
      false,
      `preserved notation escaped through ${key}`,
    );
  });
}

function visit(value: unknown, observeKey: (key: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, observeKey);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    observeKey(key);
    visit(item, observeKey);
  }
}
