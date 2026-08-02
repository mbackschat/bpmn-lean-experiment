/**
 * Inclusive Gateway hosting, completion-order, replay, and hostile
 * selection-substitution evidence sharing the suite's live Temporal runner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-adapter";
import type { TemporalScenarioRunner } from "@bpmn-lean/temporal-adapter";

import {
  compileExecutionInput,
  commandOrderAfterStart,
  loadJson,
  requiredAt,
  stateObservationAt,
  stateObservations,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  acceptedCompletionOrder,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";

const capsuleUrl = new URL(
  "../../../scenarios/inclusive-gateway-selected-branches/",
  import.meta.url,
);
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const scenarioCases = [
  {
    name: "one-true",
    scenarioUrl: new URL("one-true.scenario.json", capsuleUrl),
    expectedInitialTaskIds: ["Task_A"],
  },
  {
    name: "both-true-a-then-b",
    scenarioUrl: new URL("both-true-a-then-b.scenario.json", capsuleUrl),
    expectedInitialTaskIds: ["Task_A", "Task_B"],
  },
  {
    name: "both-true-b-then-a",
    scenarioUrl: new URL("both-true-b-then-a.scenario.json", capsuleUrl),
    expectedInitialTaskIds: ["Task_A", "Task_B"],
  },
  {
    name: "default",
    scenarioUrl: new URL("default.scenario.json", capsuleUrl),
    expectedInitialTaskIds: ["Task_Default"],
  },
] as const;

export function registerInclusiveGatewayTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("Inclusive Gateway selections and both completion orders refine and replay", async () => {
    const scenarios = await Promise.all(
      scenarioCases.map(({ scenarioUrl }) => loadJson<Scenario>(scenarioUrl)),
    );
    const inputs = await Promise.all(
      scenarios.map((scenario) => compileExecutionInput(scenario, bpmnUrl)),
    );
    const executions = await withDeadline(
      getRunner().runScenarios(
        inputs.map(({ scenario, semanticProcess }, index) => ({
          scenario,
          semanticProcess,
          options: {
            workflowId: `inclusive-gateway-${requiredAt(scenarioCases, index, "Inclusive cases").name}`,
            completionDelivery: TemporalCompletionDelivery.Ordered,
            executionSchedule: TemporalExecutionSchedule.Normal,
            effectExecutionSchedule: null,
          },
        })),
      ),
      15_000,
      "Inclusive Gateway interaction batch",
    );

    assert.equal(executions.length, inputs.length);
    for (const [index, execution] of executions.entries()) {
      const input = requiredAt(inputs, index, "Inclusive Gateway inputs");
      const scenarioCase = requiredAt(
        scenarioCases,
        index,
        "Inclusive Gateway cases",
      );
      const expected = runScenario(input.scenario, input.semanticProcess);
      const expectedStates = stateObservations(expected);
      const completionCount = input.scenario.stimuli.length - 1;

      assert.deepEqual(execution.waitTrace, expected.trace.slice(0, 3));
      assert.deepEqual(execution.result, expected);
      assert.deepEqual(
        execution.interactionEvidence.openUserTasksAtWait,
        requiredAt(expectedStates, 0, "Inclusive Gateway states").openUserTasks,
      );
      assert.deepEqual(
        execution.interactionEvidence.openUserTasksAtWait.map(
          ({ id }) => id.elementId,
        ),
        scenarioCase.expectedInitialTaskIds,
      );
      assert.deepEqual(
        execution.interactionEvidence.openUserTasksAfterCompletions,
        expectedStates
          .slice(1, -1)
          .map(({ openUserTasks }) => openUserTasks),
      );
      assert.deepEqual(
        execution.interactionEvidence.completionOutcomes,
        Array.from({ length: completionCount }, () => CommandOutcome.Committed),
      );
      assert.equal(isCompletedProcessReceipt(execution.receipt), true);
      assert.deepEqual(
        acceptedCompletionOrder(execution.history),
        commandOrderAfterStart(expected),
      );
      assertUpdatesCompleteBeforeWorkflow(execution.history, completionCount);
    }

    const aThenB = requiredAt(executions, 1, "Inclusive executions");
    const bThenA = requiredAt(executions, 2, "Inclusive executions");
    const aThenBFinal = requiredAt(
      stateObservations(aThenB.result),
      2,
      "A-then-B states",
    );
    const bThenAFinal = requiredAt(
      stateObservations(bThenA.result),
      2,
      "B-then-A states",
    );
    assert.deepEqual(
      { ...aThenBFinal, instanceId: "normalized-instance" },
      { ...bThenAFinal, instanceId: "normalized-instance" },
    );

    await withDeadline(
      getRunner().replayHistories(
        executions.map((execution, index) => ({
          history: execution.history,
          workflowId:
            `inclusive-gateway-replay-${requiredAt(scenarioCases, index, "Inclusive replay cases").name}`,
        })),
      ),
      10_000,
      "Inclusive Gateway history replay",
    );
  });

  test("selection-bypass Workflow mutation drops one true Inclusive branch", async () => {
    const scenario = await loadJson<Scenario>(requiredAt(
      scenarioCases,
      1,
      "Inclusive Gateway scenarios",
    ).scenarioUrl);
    const input = await compileExecutionInput(scenario, bpmnUrl);
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runBranchBypassMutation(
        input.scenario,
        input.semanticProcess,
        "inclusive-gateway-selection-bypass",
      ),
      15_000,
      "Inclusive Gateway selection-bypass mutation",
    );
    const expectedState = stateObservationAt(expected.trace, 2);
    const mutatedState = stateObservationAt(execution.waitTrace, 2);

    assert.deepEqual(
      expectedState.openUserTasks.map(({ id }) => id.elementId),
      ["Task_A", "Task_B"],
    );
    assert.deepEqual(
      mutatedState.openUserTasks.map(({ id }) => id.elementId),
      ["Task_A"],
    );
    assert.notDeepEqual(mutatedState, expectedState);
  });
}
