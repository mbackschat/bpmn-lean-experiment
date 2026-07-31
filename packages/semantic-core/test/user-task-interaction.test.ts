import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  StimulusKind,
  UserTaskLifecycleState,
  advanceScenario,
  applyStimulus,
  deployScenario,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  semanticProcessFor,
  loadCase,
} from "./user-task-fixture.ts";
import {
  requiredAt,
  stateObservationAt,
} from "./canonical-observations.ts";
import { operationBase } from "./semantic-program-parts.ts";

test("derives the exact retained User Task occurrence result", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  assert.deepEqual(runScenario(scenario, semanticProcessFor(scenario)), expected);
});

test("rejects a wrong activation and preserves its exact open task", async () => {
  const { scenario, expected } = await loadCase(
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  );

  const result = runScenario(scenario, semanticProcessFor(scenario));

  assert.deepEqual(result, expected);
  assert.deepEqual(result.trace[2], result.trace[4]);
});

test("rejects stale completion without reactivating the completed task", async () => {
  const { scenario, expected } = await loadCase(
    "stale-completion.scenario.json",
    "stale-completion.cibseven-evidence.json",
  );

  const result = runScenario(scenario, semanticProcessFor(scenario));

  assert.deepEqual(result, expected);
  assert.deepEqual(result.trace[4], result.trace[6]);
});

test("derives enabled interaction only from current state", async () => {
  const { scenario } = await loadCase(
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  );
  const step = advanceScenario(
    semanticProcessFor(scenario),
    initialState,
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
  );
  const waiting = stateObservationAt(step.observations, 1);

  assert.deepEqual(waiting.enabledInteractions, [
    {
      kind: StimulusKind.CompleteUserTaskInstance,
      taskId: {
        processInstanceId: "Instance_1",
        elementId: "UserTask_Approve",
        activation: 1,
      },
    },
  ]);
  assert.equal(
    requiredAt(waiting.openUserTasks, 0, "open User Tasks").state,
    UserTaskLifecycleState.Active,
  );
});

test("requires the full active task occurrence for completion", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = semanticProcessFor(scenario);
  const started = applyStimulus(
    model,
    initialState,
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
  );
  assert.equal(started.state.control.kind, ControlStateKind.Running);
  assert.deepEqual(requiredAt(
    started.state.userTaskWaits,
    0,
    "User Task waits",
  ).id, {
    processInstanceId: "Instance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  });

  for (const taskId of [
    {
      processInstanceId: "Other_Instance",
      elementId: "UserTask_Approve",
      activation: 1,
    },
    {
      processInstanceId: "Instance_1",
      elementId: "Other_Task",
      activation: 1,
    },
    {
      processInstanceId: "Instance_1",
      elementId: "UserTask_Approve",
      activation: 2,
    },
  ]) {
    const result = applyStimulus(model, started.state, {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "invalid-completion",
      taskId,
    });
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, started.state);
  }
});

test("preserves an omitted BPMN task name as null", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  const result = runScenario(
    {
      ...scenario,
      stimuli: scenario.stimuli.slice(0, 1),
    },
    semanticProcessFor(scenario, null),
  );

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(
    requiredAt(
      stateObservationAt(result.trace, 2).openUserTasks,
      0,
      "open User Tasks",
    ).name,
    null,
  );
});

test("rejects a malformed User Task name at deployment", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const admitted = semanticProcessFor(scenario);
  // A numeric task name cannot be expressed by the contract, so this
  // perturbation deliberately leaves it: deployment must reject the program at
  // runtime rather than the compiler rejecting the test.
  const malformedModel = {
    ...admitted,
    operations: [
      ...admitted.operations.slice(0, 2),
      {
        ...operationBase("UserTask_Approve"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_StartToTask",
        output: "place:Flow_TaskToEnd",
        task: { elementId: "UserTask_Approve", name: 42 },
      },
    ],
  } as unknown as SemanticProcessProgram;

  assert.equal(
    deployScenario(scenario, malformedModel).outcome,
    CommandOutcome.Unsupported,
  );
});

test("rejects a structurally compatible program under an unknown profile", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const compatibleScenario = {
    ...scenario,
    profile: "compatible-profile-under-calibration",
  };

  assert.equal(
    deployScenario(
      compatibleScenario,
      semanticProcessFor(compatibleScenario),
    ).outcome,
    CommandOutcome.Unsupported,
  );
});
