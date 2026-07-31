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
  ProcessStatus,
  ScenarioDocumentKind,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  StateObservation,
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
} from "@bpmn-lean/temporal-adapter";
import {
  serviceTaskEffectInput,
  serviceTaskEffectKey,
  serviceTaskEffectRequest,
} from "./service-task-effect-fixture.ts";

import {
  bpmnUrl,
  compileExecutionInput,
  loadExecutionInput,
  loadJson,
  requiredAt,
  requiredScenarioUrl,
  semanticPrefixThroughCompletion,
  stateObservationAt,
  stateObservations,
  temporalCacheDirectory,
  timerBpmnUrl,
  timerScenarioUrl,
  timerUserTaskCompositionBpmnUrl,
  timerUserTaskCompositionScenarioUrl,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  assertExactCompletionUpdateHistory,
  collectTemporalIdentities,
  expectedTemporalIdentity,
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  registerParallelTemporalTests,
} from "./parallel-temporal-tests.ts";
import {
  registerServiceTaskEffectTemporalTests,
} from "./service-task-effect-temporal-tests.ts";
import {
  registerCreateDocumentDataTemporalTests,
} from "./create-document-data-temporal-tests.ts";
import {
  registerBoundaryErrorTemporalTests,
} from "./boundary-error-temporal-tests.ts";
import {
  registerExclusiveGatewayTemporalTests,
} from "./exclusive-gateway-temporal-tests.ts";

let runner: TemporalScenarioRunner | undefined;

/** The runner the `before` hook created for this suite. */
function activeRunner(): TemporalScenarioRunner {
  assert.ok(runner !== undefined, "the Temporal runner is not started");
  return runner;
}

before(async () => {
  runner = await withDeadline(
    TemporalScenarioRunner.create({
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
  const inputs = await Promise.all(
    [0, 1, 2].map((index) => loadExecutionInput(requiredScenarioUrl(index))),
  );
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
    activeRunner().runScenarios(batchItems),
    15_000,
    "Temporal interaction batch",
  );

  assert.equal(executions.length, inputs.length);
  assertExactCompletionUpdateHistory(
    requiredAt(executions, 0, "batch executions").history,
    requiredAt(inputs, 0, "batch inputs"),
  );
  for (const [index, execution] of executions.entries()) {
    const input = requiredAt(inputs, index, "batch inputs");
    const semanticCoreResult = runScenario(
      input.scenario,
      input.semanticProcess,
    );
    const waitingState = semanticCoreResult.trace.find(
      (observation): observation is StateObservation =>
        observation.kind === CanonicalObservationKind.State &&
        observation.status === ProcessStatus.Running,
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

    assert.ok(waitingState !== undefined, "the run has no waiting state");
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
      const stimuli = input.scenario.stimuli;
      assert.equal(
        execution.interactionEvidence.postTerminalResult?.commandId,
        requiredAt(stimuli, stimuli.length - 1, "scenario stimuli").commandId,
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
    activeRunner().replayHistories(
      executions.map((execution, index) => ({
        history: execution.history,
        workflowId: `user-task-batch-${index}`,
      })),
    ),
    10_000,
    "current history batch replay",
  );
});

test("completion-data bypass writes outside the core but fails durable reconciliation", async () => {
  const input = await loadExecutionInput(requiredScenarioUrl(0));

  await assert.rejects(
    activeRunner().runCompletionDataBypassMutation(
      input.scenario,
      input.semanticProcess,
      "user-task-completion-data-bypass",
    ),
    /Query trace and durable Event History contain different completed Update commands/u,
  );
});

test("durable timer survives Worker absence at due time and replays exactly", async () => {
  const scenario = await loadJson<Scenario>(timerScenarioUrl);
  const input = await compileExecutionInput(scenario, timerBpmnUrl);
  const expected = runScenario(input.scenario, input.semanticProcess);
  const execution = await withDeadline(
    activeRunner().runScenario(input.scenario, input.semanticProcess, {
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
    stateObservationAt(expected.trace, 2).openTimers,
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
    activeRunner().replayHistory(
      execution.history,
      "intermediate-catch-timer-worker-restart-replay",
    ),
    10_000,
    "Intermediate Catch Timer history replay",
  );
});

test("durably composes a timer wait with later User Task ingress", async () => {
  const scenario = await loadJson<Scenario>(
    timerUserTaskCompositionScenarioUrl,
  );
  const input = await compileExecutionInput(
    scenario,
    timerUserTaskCompositionBpmnUrl,
  );
  const expected = runScenario(input.scenario, input.semanticProcess);
  const execution = await withDeadline(
    activeRunner().runScenario(input.scenario, input.semanticProcess, {
      workflowId: "timer-user-task-composition",
      completionDelivery: TemporalCompletionDelivery.Ordered,
      executionSchedule: TemporalExecutionSchedule.Normal,
      effectExecutionSchedule: null,
    }),
    15_000,
    "timer and User Task composition execution",
  );

  assert.deepEqual(execution.result, expected);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  assert.deepEqual(
    execution.interactionEvidence.openTimersAtWait,
    stateObservationAt(expected.trace, 2).openTimers,
  );
  assert.deepEqual(
    execution.interactionEvidence.openUserTasksAtWait,
    stateObservationAt(expected.trace, 4).openUserTasks,
  );
  requireDurableTimerHistory(execution.history, 1_000);

  await withDeadline(
    activeRunner().replayHistory(
      execution.history,
      "timer-user-task-composition-replay",
    ),
    10_000,
    "timer and User Task composition history replay",
  );
});

test("timer-bypass mutation preserves pure observations but loses durable timer evidence", async () => {
  const scenario = await loadJson<Scenario>(timerScenarioUrl);
  const input = await compileExecutionInput(scenario, timerBpmnUrl);
  const expected = runScenario(input.scenario, input.semanticProcess);
  const execution = await withDeadline(
    activeRunner().runTimerBypassMutation(
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
  const input = await loadExecutionInput(requiredScenarioUrl(0));
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
    activeRunner().runScenarios([duplicate, duplicate]),
    /Workflow IDs must be unique/u,
  );
});


registerParallelTemporalTests(activeRunner);
registerServiceTaskEffectTemporalTests(activeRunner);
registerCreateDocumentDataTemporalTests(activeRunner);
registerBoundaryErrorTemporalTests(activeRunner);
registerExclusiveGatewayTemporalTests(activeRunner);
