import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ObservationRequestKind,
  ProcessStatus,
  ScenarioDocumentKind,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  WaitKind,
  applyStimulus,
  initialState,
  runScenario,
} from "../dist/index.js";

const sourceSha256 =
  "b3389192ebed301b9756441dbbbe860ca489917793287cf6ce907a273ce919d5";
const timerCommandId =
  "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b";

const timerProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "cibseven-2.2.0-intermediate-catch-timer-draft",
    sourceId: "intermediate-catch-timer-pt1s-process",
    sourceSha256,
  },
  processId: "Process_IntermediateCatchTimer",
  controlPlaces: [
    controlPlace("Flow_StartToTimer"),
    controlPlace("Flow_TimerToEnd"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_TimerToEnd",
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToTimer",
    },
    {
      ...operationBase("TimerCatch_PT1S"),
      kind: SemanticOperationKind.AwaitTimer,
      input: "place:Flow_StartToTimer",
      output: "place:Flow_TimerToEnd",
      timer: {
        elementId: "TimerCatch_PT1S",
        durationMs: 1000,
      },
    },
  ],
};

const timerId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "TimerCatch_PT1S",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: timerProgram.processId,
  instanceId: "Instance_1",
});

const exactFire = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: timerCommandId,
  timerId,
  logicalTimeMs: 1000,
});

const timerScenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "intermediate-catch-timer-pt1s",
  profile: timerProgram.identity.semanticProfile,
  bpmn: {
    id: timerProgram.identity.sourceId,
    relativePath: "scenarios/intermediate-catch-timer/process.bpmn",
    sha256: sourceSha256,
  },
  stimuli: [start, exactFire],
  observations: [
    ObservationRequestKind.Deployment,
    ObservationRequestKind.CommandResults,
    ObservationRequestKind.ProcessStatus,
    ObservationRequestKind.ActiveWaits,
    ObservationRequestKind.OpenUserTasks,
    ObservationRequestKind.OpenTimers,
    ObservationRequestKind.OpenEffects,
    ObservationRequestKind.Variables,
    ObservationRequestKind.EnabledInteractions,
    ObservationRequestKind.LogicalTime,
  ],
  provenance: {
    normativeRefs: ["BPMN 2.0.2 §10.5.4"],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: [
      "engine/src/main/java/org/cibseven/bpm/engine/impl/jobexecutor/TimerCatchIntermediateEventJobHandler.java",
    ],
  },
};

test("start closes at one PT1S timer occurrence without advancing time", () => {
  const started = applyStimulus(timerProgram, initialState, start);

  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(started.state.control, {
    kind: ControlStateKind.Running,
    instanceId: "Instance_1",
  });
  assert.equal(started.state.logicalTimeMs, 0);
  assert.deepEqual(started.state.timerWaits, [
    {
      id: timerId,
      deadlineMs: 1000,
      output: "place:Flow_TimerToEnd",
    },
  ]);
  assert.deepEqual(started.state.controlTokens, []);
});

test("exact deadline firing commits and completes at semantic time 1000", () => {
  const waiting = applyStimulus(timerProgram, initialState, start).state;
  const fired = applyStimulus(timerProgram, waiting, exactFire);

  assert.equal(fired.outcome, CommandOutcome.Committed);
  assert.deepEqual(fired.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: "Instance_1",
  });
  assert.deepEqual(fired.state.timerWaits, []);
  assert.equal(fired.state.logicalTimeMs, 1000);
  assert.equal(fired.state.endOccurrences, 1);
});

test("every timer identity or logical-time mismatch rejects with exact state preservation", () => {
  const waiting = applyStimulus(timerProgram, initialState, start).state;
  const mutations = [
    { timerId: { ...timerId, processInstanceId: "Other_Instance" } },
    { timerId: { ...timerId, elementId: "Other_Timer" } },
    { timerId: { ...timerId, activation: 2 } },
    { logicalTimeMs: 999 },
    { logicalTimeMs: 1001 },
  ];

  for (const mutation of mutations) {
    const rejected = applyStimulus(timerProgram, waiting, {
      ...exactFire,
      ...mutation,
      commandId: `reject-${JSON.stringify(mutation)}`,
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("scenario projects the timer wait and exact command observation across the public boundary", () => {
  const result = runScenario(timerScenario, timerProgram);

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(result.trace, [
    {
      kind: CanonicalObservationKind.Deployment,
      outcome: CommandOutcome.Committed,
    },
    {
      kind: CanonicalObservationKind.Command,
      commandId: "start-process",
      outcome: CommandOutcome.Committed,
    },
    {
      kind: CanonicalObservationKind.State,
      instanceId: "Instance_1",
      status: ProcessStatus.Running,
      activeWaits: [
        {
          elementId: "TimerCatch_PT1S",
          kind: WaitKind.Timer,
          multiplicity: 1,
        },
      ],
      openUserTasks: [],
      openTimers: [{ id: timerId, deadlineMs: 1000 }],
      openEffects: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
    {
      kind: CanonicalObservationKind.Command,
      commandId: timerCommandId,
      outcome: CommandOutcome.Committed,
    },
    {
      kind: CanonicalObservationKind.State,
      instanceId: "Instance_1",
      status: ProcessStatus.Completed,
      activeWaits: [],
      openUserTasks: [],
      openTimers: [],
      openEffects: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 1000,
    },
  ]);
});

function controlPlace(elementId) {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

function operationBase(elementId) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}
