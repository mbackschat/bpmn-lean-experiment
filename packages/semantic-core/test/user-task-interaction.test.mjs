import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnExecutableIrKind,
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

const capsuleUrl = new URL(
  "../../../scenarios/m1-user-task-discovery-completion/",
  import.meta.url,
);

async function loadJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, capsuleUrl), "utf8"),
  );
}

async function loadCase(scenarioName, evidenceName) {
  const [scenario, evidence] = await Promise.all([
    loadJson(scenarioName),
    loadJson(evidenceName),
  ]);
  return { scenario, expected: evidence.result };
}

function executableIrFor(scenario, name = "Approve") {
  return {
    schemaVersion: "0.2.0",
    kind: BpmnExecutableIrKind.SequentialUserTask,
    identity: {
      compiler: "bpmn-source-sequential-user-task@0.2.0",
      semanticProfile: scenario.profile,
      sourceId: scenario.bpmn.id,
      sourceSha256: scenario.bpmn.sha256,
    },
    processId: "Process_SequentialUserTask",
    startEventId: "StartEvent_1",
    userTask: {
      id: "UserTask_Approve",
      name,
    },
    endEventId: "EndEvent_1",
    sequenceFlows: [
      {
        id: "Flow_StartToTask",
        sourceId: "StartEvent_1",
        targetId: "UserTask_Approve",
      },
      {
        id: "Flow_TaskToEnd",
        sourceId: "UserTask_Approve",
        targetId: "EndEvent_1",
      },
    ],
  };
}

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

test("derives enabled interaction from state rather than future commands", async () => {
  const { scenario } = await loadCase(
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  );
  const model = executableIrFor(scenario);
  const step = advanceScenario(
    model,
    initialState,
    scenario.stimuli[0],
    scenario.stimuli.slice(1),
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
  assert.equal(step.observations[1].openUserTasks[0].state, UserTaskLifecycleState.Active);
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
  const namelessModel = executableIrFor(scenario, null);

  const result = runScenario(
    {
      ...scenario,
      stimuli: scenario.stimuli.slice(0, 1),
    },
    namelessModel,
  );

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.equal(result.trace[2].openUserTasks[0].name, null);
});

test("requires named-task IR v0.2 for the interaction profile", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const retainedModel = executableIrFor(scenario);
  retainedModel.schemaVersion = "0.1.0";
  retainedModel.identity.compiler =
    "bpmn-source-sequential-user-task@0.1.0";
  retainedModel.userTaskId = retainedModel.userTask.id;
  delete retainedModel.userTask;

  const deployment = deployScenario(scenario, retainedModel);

  assert.equal(deployment.outcome, CommandOutcome.Unsupported);
});

test("rejects a malformed User Task name at deployment", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const malformedModel = executableIrFor(scenario);
  malformedModel.userTask.name = 42;

  const deployment = deployScenario(scenario, malformedModel);

  assert.equal(deployment.outcome, CommandOutcome.Unsupported);
});
