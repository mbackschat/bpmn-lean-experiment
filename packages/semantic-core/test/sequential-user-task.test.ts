import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  advanceScenario,
  applyStimulus,
  deployScenario,
  initialState,
  runScenario,
  runScenarioWithClosureLimit,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  semanticProcessFor,
  loadCase,
} from "./user-task-fixture.ts";
import { requiredAt } from "./canonical-observations.ts";
import { operationBase } from "./semantic-program-parts.ts";

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
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
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
    effectWaits: [],
    variables: {
      process: { bindings: [] },
      activities: [],
    },
    taskActivations: [
      { elementId: "UserTask_Approve", count: 1 },
    ],
    timerActivations: [],
    effectActivations: [],
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
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
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
  const started = applyStimulus(
    model,
    initialState,
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
  );

  const completed = applyStimulus(
    model,
    started.state,
    requiredAt(scenario.stimuli, 1, "scenario stimuli"),
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
    effectWaits: [],
    variables: {
      process: { bindings: [] },
      activities: [],
    },
    taskActivations: [
      { elementId: "UserTask_Approve", count: 1 },
    ],
    timerActivations: [],
    effectActivations: [],
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
  const started = applyStimulus(
    model,
    initialState,
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
  );

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
  const admitted = semanticProcessFor(scenario);
  const semanticProcess: SemanticProcessProgram = {
    ...admitted,
    identity: { ...admitted.identity, sourceSha256: "0".repeat(64) },
  };

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
  const admitted = semanticProcessFor(scenario);
  // The End Event consumes a control place the program never declares.
  const malformedTopology: SemanticProcessProgram = {
    ...admitted,
    operations: [
      {
        ...operationBase("EndEvent_1"),
        kind: SemanticOperationKind.Terminate,
        input: "place:Missing",
      },
      ...admitted.operations.slice(1),
    ],
  };
  // A null identity cannot be expressed by the contract, so this perturbation
  // deliberately leaves it: the semantic core must reject the program at
  // runtime rather than the compiler rejecting the test.
  const malformedIdentity = {
    ...admitted,
    identity: null,
  } as unknown as SemanticProcessProgram;

  assert.equal(
    deployScenario(scenario, malformedTopology).outcome,
    CommandOutcome.Unsupported,
  );
  assert.equal(
    deployScenario(scenario, malformedIdentity).outcome,
    CommandOutcome.Unsupported,
  );
});
