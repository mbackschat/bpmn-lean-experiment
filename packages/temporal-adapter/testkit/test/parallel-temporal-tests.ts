/**
 * Parallel and concurrent command-schedule refinement tests sharing the suite's live runner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  CommandOutcome,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalScenarioRunner } from "@bpmn-lean/temporal-testkit";
import {
  compileExecutionInput,
  commandOrderAfterStart,
  loadExecutionInput,
  parallelBpmnUrl,
  parallelScenario,
  requiredAt,
  requiredScenarioUrl,
  stateObservations,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  acceptedCompletionOrder,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";

export function registerParallelTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("concurrent distinct commands retain an unordered completion race witness", async () => {
    const input = await loadExecutionInput(requiredScenarioUrl(2));
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "user-task-concurrent-race",
        completionDelivery: TemporalCompletionDelivery.AcceptedBatch,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: null,
      }),
      15_000,
      "User Task concurrent completion race",
    );

    assert.deepEqual(
      [...execution.interactionEvidence.completionOutcomes].sort(),
      [CommandOutcome.Committed, CommandOutcome.Rejected].sort(),
    );
    const terminalStates = stateObservations(execution.result).slice(-2);
    assert.equal(terminalStates.length, 2);
    assert.deepEqual(terminalStates[0], terminalStates[1]);
    assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    assertUpdatesCompleteBeforeWorkflow(execution.history, 2);

    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "user-task-concurrent-race-replay",
      ),
      10_000,
      "User Task concurrent race history replay",
    );
  });

  test("parallel waits and both completion orders refine through Query, Update, and replay", async () => {
    const scenarios = [
      parallelScenario("UserTask_A", "UserTask_B"),
      parallelScenario("UserTask_B", "UserTask_A"),
    ];
    const inputs = await Promise.all(
      scenarios.map((scenario) =>
        compileExecutionInput(scenario, parallelBpmnUrl),
      ),
    );
    const executions = await withDeadline(
      getRunner().runScenarios(
        inputs.map(({ scenario, semanticProcess }, index) => ({
          scenario,
          semanticProcess,
          options: {
            workflowId: `parallel-ordered-${index}`,
            completionDelivery: TemporalCompletionDelivery.Ordered,
            executionSchedule:
              index === 0
                ? TemporalExecutionSchedule.DuplicateFirstCompletion
                : TemporalExecutionSchedule.Normal,
            effectExecutionSchedule: null,
          },
        })),
      ),
      15_000,
      "parallel ordered interaction batch",
    );

    assert.equal(executions.length, 2);
    for (const [index, execution] of executions.entries()) {
      const input = requiredAt(inputs, index, "parallel batch inputs");
      const expected = runScenario(input.scenario, input.semanticProcess);
      const states = stateObservations(expected);
      assert.equal(states.length, 3);
      assert.deepEqual(
        execution.interactionEvidence.openUserTasksAtWait,
        requiredAt(states, 0, "expected state observations").openUserTasks,
      );
      assert.deepEqual(
        execution.interactionEvidence.openUserTasksAfterCompletions,
        [requiredAt(states, 1, "expected state observations").openUserTasks],
      );
      assert.deepEqual(
        execution.interactionEvidence.completionOutcomes,
        [CommandOutcome.Committed, CommandOutcome.Committed],
      );
      assert.equal(
        execution.interactionEvidence.duplicateCompletionOutcome,
        index === 0 ? CommandOutcome.Committed : null,
      );
      assert.deepEqual(execution.result, expected);
      assert.equal(isCompletedProcessReceipt(execution.receipt), true);
      assertUpdatesCompleteBeforeWorkflow(
        execution.history,
        2,
      );
    }

    await withDeadline(
      getRunner().replayHistories(
        executions.map((execution, index) => ({
          history: execution.history,
          workflowId: `parallel-ordered-${index}`,
        })),
      ),
      10_000,
      "parallel ordered history replay",
    );
  });

  test("concurrent parallel completion submission realizes and replays one permitted order", async () => {
    const aThenB = parallelScenario("UserTask_A", "UserTask_B");
    const bThenA = parallelScenario("UserTask_B", "UserTask_A");
    const input = await compileExecutionInput(aThenB, parallelBpmnUrl);
    const expectedResults = [
      runScenario(aThenB, input.semanticProcess),
      runScenario(bThenA, input.semanticProcess),
    ];
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "parallel-concurrent",
        completionDelivery: TemporalCompletionDelivery.Concurrent,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: null,
      }),
      15_000,
      "parallel concurrent interaction",
    );

    assert.deepEqual(
      execution.interactionEvidence.openUserTasksAfterCompletions,
      [],
    );
    assert.deepEqual(
      execution.interactionEvidence.completionOutcomes,
      [CommandOutcome.Committed, CommandOutcome.Committed],
    );
    assert.equal(
      expectedResults.some((expected) =>
        isDeepStrictEqual(execution.result, expected)
      ),
      true,
    );
    assert.deepEqual(
      acceptedCompletionOrder(execution.history),
      commandOrderAfterStart(execution.result),
    );
    assertUpdatesCompleteBeforeWorkflow(execution.history, 2);
    assert.equal(isCompletedProcessReceipt(execution.receipt), true);

    await withDeadline(
      getRunner().replayHistory(execution.history, "parallel-concurrent"),
      10_000,
      "parallel concurrent history replay",
    );
  });
}
