import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  sequentialUserTaskModel,
} from "../dist/index.js";

const scenarioUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/scenario.json",
  import.meta.url,
);

async function loadScenario() {
  return JSON.parse(await readFile(scenarioUrl, "utf8"));
}

test("derives the independently calibrated CIB and Lean trace", async () => {
  const scenario = await loadScenario();

  const result = runScenario(scenario);

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(result.trace, scenario.calibration.expectedTrace);
});

test("does not read the calibration answer while deriving the trace", async () => {
  const scenario = await loadScenario();
  const expectedTrace = scenario.calibration.expectedTrace;
  scenario.calibration.expectedTrace = [];

  const result = runScenario(scenario);

  assert.deepEqual(result.trace, expectedTrace);
});

test("start closes at one stable User Task wait", async () => {
  const scenario = await loadScenario();

  const result = applyStimulus(
    sequentialUserTaskModel,
    initialState,
    scenario.stimuli[0],
  );

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.deepEqual(result.state, {
    control: {
      kind: ControlStateKind.WaitingUserTask,
      instanceId: "Instance_1",
    },
    logicalTimeMs: 0,
  });
});

test("incremental execution owns deployment and stable observations", async () => {
  const scenario = await loadScenario();

  const deployment = deployScenario(scenario);
  const step = advanceScenario(
    sequentialUserTaskModel,
    initialState,
    scenario.stimuli[0],
    scenario.stimuli.slice(1),
  );

  assert.deepEqual(deployment, {
    outcome: CommandOutcome.Committed,
    observation: scenario.calibration.expectedTrace[0],
  });
  assert.equal(step.kind, ScenarioStepKind.Committed);
  assert.deepEqual(
    step.observations,
    scenario.calibration.expectedTrace.slice(1, 3),
  );
  assert.deepEqual(step.state, {
    control: {
      kind: ControlStateKind.WaitingUserTask,
      instanceId: "Instance_1",
    },
    logicalTimeMs: 0,
  });
});

test("matching completion closes the Process", async () => {
  const scenario = await loadScenario();
  const started = applyStimulus(
    sequentialUserTaskModel,
    initialState,
    scenario.stimuli[0],
  );

  const completed = applyStimulus(
    sequentialUserTaskModel,
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
    logicalTimeMs: 0,
  });
});

test("non-matching completion is rejected without state change", async () => {
  const scenario = await loadScenario();
  const started = applyStimulus(
    sequentialUserTaskModel,
    initialState,
    scenario.stimuli[0],
  );

  const rejected = applyStimulus(sequentialUserTaskModel, started.state, {
    kind: StimulusKind.CompleteUserTask,
    commandId: "wrong-completion",
    elementId: "Other_Task",
  });

  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.equal(rejected.internalStepBoundExceeded, false);
  assert.deepEqual(rejected.state, started.state);
});

test("closure-bound exhaustion exposes no committed command", async () => {
  const scenario = await loadScenario();

  const result = runScenarioWithClosureLimit(0, scenario);

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
