import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";

import {
  EffectExecutionSchedule,
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  TemporalScenarioRunner,
  isCompletedProcessReceipt,
  requireDurableEffectActivityHistory,
  requireExhaustedEffectActivityHistory,
  requireDurableTimerHistory,
} from "../dist/index.js";
import {
  serviceTaskEffectInput,
  serviceTaskEffectKey,
  serviceTaskEffectRequest,
} from "./service-task-effect-fixture.mjs";

import {
  bpmnUrl,
  collectTemporalIdentities,
  compileExecutionInput,
  expectedTemporalIdentity,
  assertExactCompletionUpdateHistory,
  historyEvents,
  loadExecutionInput,
  loadJson,
  scenarioUrls,
  semanticPrefixThroughCompletion,
  stateObservations,
  temporalCacheDirectory,
  timerBpmnUrl,
  timerScenarioUrl,
  withDeadline,
} from "./temporal-test-support.mjs";
import {
  registerParallelTemporalTests,
} from "./parallel-temporal-tests.mjs";
import {
  registerServiceTaskEffectTemporalTests,
} from "./service-task-effect-temporal-tests.mjs";
import {
  registerCreateDocumentDataTemporalTests,
} from "./create-document-data-temporal-tests.mjs";
import {
  registerBoundaryErrorTemporalTests,
} from "./boundary-error-temporal-tests.mjs";

let runner;

before(async () => {
  runner = await withDeadline(
    TemporalScenarioRunner.create({
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    }),
    45_000,
    "Temporal runner startup",
  );
});

after(async () => {
  if (runner !== undefined) {
    await withDeadline(runner.shutdown(), 10_000, "Temporal runner shutdown");
  }
});

test("one clean server executes, captures, and replays the current capsule", async () => {
  const inputs = await Promise.all(scenarioUrls.map(loadExecutionInput));
  const batchItems = inputs.map(
    ({ scenario, semanticProcess }, index) => ({
      scenario,
      semanticProcess,
      options: {
        workflowId: `user-task-batch-${index}`,
        completionDelivery:
          index === 2
            ? TemporalCompletionDelivery.PostTerminal
            : TemporalCompletionDelivery.Ordered,
        executionSchedule:
          index === 2
            ? TemporalExecutionSchedule.DuplicateFirstCompletion
            : TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: null,
      },
    }),
  );

  const executions = await withDeadline(
    runner.runScenarios(batchItems),
    15_000,
    "Temporal interaction batch",
  );

  assert.equal(executions.length, inputs.length);
  assertExactCompletionUpdateHistory(executions[0].history, inputs[0]);
  for (const [index, execution] of executions.entries()) {
    const input = inputs[index];
    const semanticCoreResult = runScenario(
      input.scenario,
      input.semanticProcess,
    );
    const waitingState = semanticCoreResult.trace.find(
      (observation) =>
        observation.kind === CanonicalObservationKind.State &&
        observation.status === "running",
    );
    const completionCommandIds = new Set(
      input.scenario.stimuli.slice(1).map(({ commandId }) => commandId),
    );
    const allExpectedCompletionOutcomes = semanticCoreResult.trace.flatMap(
      (observation) =>
        observation.kind === CanonicalObservationKind.Command &&
        completionCommandIds.has(observation.commandId)
          ? [observation.outcome]
          : [],
    );
    const expectedCompletionOutcomes =
      index === 2
        ? allExpectedCompletionOutcomes.slice(0, -1)
        : allExpectedCompletionOutcomes;

    assert.notEqual(waitingState, undefined);
    assert.deepEqual(
      execution.waitTrace,
      semanticCoreResult.trace.slice(0, 3),
    );
    assert.deepEqual(
      execution.interactionEvidence.openUserTasksAtWait,
      waitingState.openUserTasks,
    );
    assert.deepEqual(
      execution.interactionEvidence.completionOutcomes,
      expectedCompletionOutcomes,
    );
    assert.equal(
      execution.interactionEvidence.duplicateCompletionOutcome,
      index === 2 ? CommandOutcome.Committed : null,
    );
    assert.deepEqual(
      execution.result,
      index === 2
        ? semanticPrefixThroughCompletion(semanticCoreResult)
        : semanticCoreResult,
    );
    assert.equal(
      execution.interactionEvidence.postTerminalResult?.kind ?? null,
      index === 2
        ? ProcessCommandResultKind.ProcessClosed
        : null,
    );
    if (index === 2) {
      assert.equal(
        execution.interactionEvidence.postTerminalResult.commandId,
        input.scenario.stimuli.at(-1).commandId,
      );
    }
    assert.equal(
      execution.receipt === null,
      index === 1,
    );
    if (execution.receipt !== null) {
      assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    }
    assert.deepEqual(
      collectTemporalIdentities(execution.history),
      new Set([expectedTemporalIdentity]),
    );
  }

  await withDeadline(
    runner.replayHistories(
      executions.map((execution, index) => ({
        history: execution.history,
        workflowId: `user-task-batch-${index}`,
      })),
    ),
    10_000,
    "current history batch replay",
  );
});

test("durable timer survives Worker absence at due time and replays exactly", async () => {
  const scenario = await loadJson(timerScenarioUrl);
  const input = await compileExecutionInput(scenario, timerBpmnUrl);
  const expected = runScenario(input.scenario, input.semanticProcess);
  const execution = await withDeadline(
    runner.runScenario(input.scenario, input.semanticProcess, {
      workflowId: "intermediate-catch-timer-worker-restart",
      completionDelivery: TemporalCompletionDelivery.Ordered,
      executionSchedule: TemporalExecutionSchedule.WorkerDownAtTimerDue,
      effectExecutionSchedule: null,
    }),
    15_000,
    "Intermediate Catch Timer Worker-restart execution",
  );

  assert.deepEqual(execution.waitTrace, expected.trace.slice(0, 3));
  assert.deepEqual(
    execution.interactionEvidence.openTimersAtWait,
    expected.trace[2].openTimers,
  );
  assert.deepEqual(execution.interactionEvidence.completionOutcomes, []);
  assert.deepEqual(execution.result, expected);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  assert.equal(
    historyEvents(
      execution.history,
      "workflowExecutionUpdateAcceptedEventAttributes",
    ).length,
    0,
  );
  assert.equal(
    historyEvents(
      execution.history,
      "timerStartedEventAttributes",
    ).length,
    1,
  );
  assert.equal(
    historyEvents(
      execution.history,
      "timerFiredEventAttributes",
    ).length,
    1,
  );

  await withDeadline(
    runner.replayHistory(
      execution.history,
      "intermediate-catch-timer-worker-restart-replay",
    ),
    10_000,
    "Intermediate Catch Timer history replay",
  );
});

test("timer-bypass mutation preserves pure observations but loses durable timer evidence", async () => {
  const scenario = await loadJson(timerScenarioUrl);
  const input = await compileExecutionInput(scenario, timerBpmnUrl);
  const expected = runScenario(input.scenario, input.semanticProcess);
  const execution = await withDeadline(
    runner.runTimerBypassMutation(
      input.scenario,
      input.semanticProcess,
      "intermediate-catch-timer-bypass-mutation",
    ),
    15_000,
    "Intermediate Catch Timer bypass mutation",
  );

  assert.deepEqual(execution.result, expected);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  assert.throws(
    () => requireDurableTimerHistory(execution.history, 1_000),
    /exactly one durable timer-started\/timer-fired pair/u,
  );
});

test("batch execution rejects duplicate Workflow identities before start", async () => {
  const input = await loadExecutionInput(scenarioUrls[0]);
  const duplicate = {
    ...input,
    options: {
      workflowId: "duplicate-workflow-id",
      completionDelivery: TemporalCompletionDelivery.Ordered,
      executionSchedule: TemporalExecutionSchedule.Normal,
      effectExecutionSchedule: null,
    },
  };

  await assert.rejects(
    runner.runScenarios([duplicate, duplicate]),
    /Workflow IDs must be unique/u,
  );
});


registerParallelTemporalTests(() => runner);
registerServiceTaskEffectTemporalTests(() => runner);
registerCreateDocumentDataTemporalTests(() => runner);
registerBoundaryErrorTemporalTests(() => runner);
