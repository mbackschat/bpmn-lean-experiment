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
  executableIrFor,
  loadCase,
} from "./user-task-fixture.mjs";

test("derives the independently calibrated CIB and Lean trace", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );

  const result = runScenario(scenario, executableIrFor(scenario));

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
    executableIrFor(scenario),
    initialState,
    scenario.stimuli[0],
  );

  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.deepEqual(result.state, {
    control: {
      kind: ControlStateKind.WaitingUserTask,
      instanceId: "Instance_1",
      activation: 1,
    },
    logicalTimeMs: 0,
  });
});

test("incremental execution owns deployment and stable observations", async () => {
  const { scenario, expected } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const executableIr = executableIrFor(scenario);

  const deployment = deployScenario(scenario, executableIr);
  const step = advanceScenario(
    executableIr,
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
  const model = executableIrFor(scenario);
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
    logicalTimeMs: 0,
  });
});

test("non-matching occurrence completion is rejected without state change", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = executableIrFor(scenario);
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
    executableIrFor(scenario),
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

test("rejects an IR whose source identity does not match the scenario", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const executableIr = executableIrFor(scenario);
  executableIr.identity.sourceSha256 = "0".repeat(64);

  assert.equal(
    deployScenario(scenario, executableIr).outcome,
    CommandOutcome.Unsupported,
  );
});

test("rejects malformed current IR without throwing", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const malformedTopology = executableIrFor(scenario);
  malformedTopology.sequenceFlows[1].targetId = malformedTopology.startEventId;
  const malformedIdentity = executableIrFor(scenario);
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
