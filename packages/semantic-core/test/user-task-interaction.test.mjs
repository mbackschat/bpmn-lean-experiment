import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  ScenarioOutcomeKind,
  StimulusKind,
  UserTaskLifecycleState,
  advanceScenario,
  applyStimulus,
  deployScenario,
  initialState,
  runScenario,
} from "../dist/index.js";
import {
  executableIrFor,
  loadCase,
} from "./user-task-fixture.mjs";

test("derives the exact retained User Task occurrence result", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  assert.deepEqual(runScenario(scenario, executableIrFor(scenario)), expected);
});

test("rejects a wrong activation and preserves its exact open task", async () => {
  const { scenario, expected } = await loadCase(
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  );

  const result = runScenario(scenario, executableIrFor(scenario));

  assert.deepEqual(result, expected);
  assert.deepEqual(result.trace[2], result.trace[4]);
});

test("rejects stale completion without reactivating the completed task", async () => {
  const { scenario, expected } = await loadCase(
    "stale-completion.scenario.json",
    "stale-completion.cibseven-evidence.json",
  );

  const result = runScenario(scenario, executableIrFor(scenario));

  assert.deepEqual(result, expected);
  assert.deepEqual(result.trace[4], result.trace[6]);
});

test("derives enabled interaction only from current state", async () => {
  const { scenario } = await loadCase(
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  );
  const step = advanceScenario(
    executableIrFor(scenario),
    initialState,
    scenario.stimuli[0],
  );

  assert.deepEqual(step.observations[1].enabledInteractions, [
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
    step.observations[1].openUserTasks[0].state,
    UserTaskLifecycleState.Active,
  );
});

test("requires the full active task occurrence for completion", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = executableIrFor(scenario);
  const started = applyStimulus(model, initialState, scenario.stimuli[0]);
  assert.deepEqual(started.state.control, {
    kind: ControlStateKind.WaitingUserTask,
    instanceId: "Instance_1",
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
    executableIrFor(scenario, null),
  );

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(result.trace[2].openUserTasks[0].name, null);
});

test("rejects a malformed User Task name at deployment", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const malformedModel = executableIrFor(scenario);
  malformedModel.userTask.name = 42;

  assert.equal(
    deployScenario(scenario, malformedModel).outcome,
    CommandOutcome.Unsupported,
  );
});

test("admits a structurally compatible profile without profile-specific routing", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const compatibleScenario = {
    ...scenario,
    profile: "compatible-profile-under-calibration",
  };

  assert.deepEqual(
    runScenario(
      compatibleScenario,
      executableIrFor(compatibleScenario),
    ),
    expected,
  );
});
