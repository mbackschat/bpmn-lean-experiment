import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  applyStimulus,
  deployScenario,
  initialState,
  runScenario,
  runScenarioWithClosureLimit,
} from "../dist/index.js";
import {
  semanticProcessFor,
  loadCase,
} from "./user-task-fixture.mjs";

test("derives the independently calibrated CIB and Lean trace", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  const result = runScenario(scenario, semanticProcessFor(scenario));

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(result, expected);
});

test("start closes at one stable User Task wait", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  const result = applyStimulus(
    semanticProcessFor(scenario),
    initialState,
    scenario.stimuli[0],
  );

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.deepEqual(result.state, {
    control: {
      kind: ControlStateKind.Running,
      instanceId: "Instance_1",
    },
    initiationPending: false,
    controlTokens: [],
    userTaskWaits: [
      {
        id: {
          processInstanceId: "Instance_1",
          elementId: "UserTask_Approve",
          activation: 1,
        },
        name: "Approve",
        output: "place:Flow_TaskToEnd",
      },
    ],
    timerWaits: [],
    taskActivations: [
      { elementId: "UserTask_Approve", count: 1 },
    ],
    timerActivations: [],
    endOccurrences: 0,
    logicalTimeMs: 0,
  });
});

test("incremental execution owns deployment and stable observations", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const semanticProcess = semanticProcessFor(scenario);

  const deployment = deployScenario(scenario, semanticProcess);
  const step = advanceScenario(
    semanticProcess,
    initialState,
    scenario.stimuli[0],
  );

  assert.deepEqual(deployment, {
    outcome: CommandOutcome.Committed,
    observation: expected.trace[0],
  });
  assert.equal(step.kind, ScenarioStepKind.Committed);
  assert.deepEqual(step.observations, expected.trace.slice(1, 3));
});

test("matching occurrence completion closes the Process", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = semanticProcessFor(scenario);
  const started = applyStimulus(model, initialState, scenario.stimuli[0]);

  const completed = applyStimulus(
    model,
    started.state,
    scenario.stimuli[1],
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.deepEqual(completed.state, {
    control: {
      kind: ControlStateKind.Completed,
      instanceId: "Instance_1",
    },
    initiationPending: false,
    controlTokens: [],
    userTaskWaits: [],
    timerWaits: [],
    taskActivations: [
      { elementId: "UserTask_Approve", count: 1 },
    ],
    timerActivations: [],
    endOccurrences: 1,
    logicalTimeMs: 0,
  });
});

test("non-matching occurrence completion is rejected without state change", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = semanticProcessFor(scenario);
  const started = applyStimulus(model, initialState, scenario.stimuli[0]);

  const rejected = applyStimulus(model, started.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "wrong-completion",
    taskId: {
      processInstanceId: "Instance_1",
      elementId: "Other_Task",
      activation: 1,
    },
  });

  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.equal(rejected.internalStepBoundExceeded, false);
  assert.deepEqual(rejected.state, started.state);
});

test("closure-bound exhaustion exposes no committed command", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  const result = runScenarioWithClosureLimit(
    0,
    scenario,
    semanticProcessFor(scenario),
  );

  assert.deepEqual(result, {
    outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
    trace: [
      {
        kind: CanonicalObservationKind.Deployment,
        outcome: CommandOutcome.Committed,
      },
    ],
  });
});

test("rejects a program whose source identity does not match the scenario", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const semanticProcess = semanticProcessFor(scenario);
  semanticProcess.identity.sourceSha256 = "0".repeat(64);

  assert.equal(
    deployScenario(scenario, semanticProcess).outcome,
    CommandOutcome.Unsupported,
  );
});

test("rejects a malformed current program without throwing", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const malformedTopology = semanticProcessFor(scenario);
  malformedTopology.operations[0].input = "place:Missing";
  const malformedIdentity = semanticProcessFor(scenario);
  malformedIdentity.identity = null;

  assert.equal(
    deployScenario(scenario, malformedTopology).outcome,
    CommandOutcome.Unsupported,
  );
  assert.equal(
    deployScenario(scenario, malformedIdentity).outcome,
    CommandOutcome.Unsupported,
  );
});
