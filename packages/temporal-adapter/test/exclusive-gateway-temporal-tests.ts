/**
 * Simple Boolean Exclusive Gateway hosting and hostile branch-substitution
 * guards sharing the suite's live Temporal environment.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  Scenario,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-adapter";
import type {
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-adapter";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  withDeadline,
} from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../scenarios/exclusive-gateway-simple-boolean/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/exclusive-gateway-simple-boolean/process.bpmn",
  import.meta.url,
);

function stateAt(
  observations: ReadonlyArray<CanonicalObservation>,
  index: number,
): StateObservation {
  const observation = requiredAt(
    observations,
    index,
    "Simple Boolean trace",
  );
  if (observation.kind !== CanonicalObservationKind.State) {
    throw new Error(
      `Simple Boolean trace index ${index} is not a state`,
    );
  }
  return observation;
}

export function registerExclusiveGatewayTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("Simple Boolean choice completes and replays the selected branch", async () => {
    const scenario = await loadJson<Scenario>(scenarioUrl);
    const input = await compileExecutionInput(scenario, bpmnUrl);
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "simple-boolean-exclusive-gateway",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: null,
      }),
      15_000,
      "Simple Boolean Exclusive Gateway execution",
    );

    assert.deepEqual(execution.waitTrace, expected.trace.slice(0, 3));
    assert.deepEqual(execution.result, expected);
    assert.equal(
      stateAt(execution.waitTrace, 2).openUserTasks[0]?.id.elementId,
      "Task_First",
    );
    assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "simple-boolean-exclusive-gateway-replay",
      ),
      10_000,
      "Simple Boolean Exclusive Gateway replay",
    );
  });

  test("branch-bypass Workflow mutation exposes the wrong selected task", async () => {
    const scenario = await loadJson<Scenario>(scenarioUrl);
    const input = await compileExecutionInput(scenario, bpmnUrl);
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().probes.runBranchBypassMutation(
        input.scenario,
        input.semanticProcess,
        "simple-boolean-exclusive-gateway-branch-bypass",
      ),
      15_000,
      "Simple Boolean branch-bypass mutation",
    );
    const expectedState = stateAt(expected.trace, 2);
    const mutatedState = stateAt(execution.waitTrace, 2);

    assert.equal(
      expectedState.openUserTasks[0]?.id.elementId,
      "Task_First",
    );
    assert.equal(
      mutatedState.openUserTasks[0]?.id.elementId,
      "Task_Second",
    );
    assert.notDeepEqual(mutatedState, expectedState);
  });
}
