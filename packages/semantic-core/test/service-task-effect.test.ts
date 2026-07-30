import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  EffectExecutionResultKind,
  ControlStateKind,
  ObservationRequestKind,
  ProcessStatus,
  ScenarioDocumentKind,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  WaitKind,
  applyStimulus,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

const descriptor = Object.freeze({
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
});

const effectProgram: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    sourceId: "service-task-effect-process",
    sourceSha256:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  processId: "Process_ServiceTaskEffect",
  controlPlaces: [
    controlPlace("Flow_ServiceToEnd"),
    controlPlace("Flow_StartToService"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_ServiceToEnd",
    },
    {
      ...operationBase("ServiceTask_Record"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToService",
      output: "place:Flow_ServiceToEnd",
      effect: {
        elementId: "ServiceTask_Record",
        descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToService",
    },
  ],
};

const effectId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: effectProgram.processId,
  instanceId: effectId.processInstanceId,
} as const) satisfies StartProcessStimulus;

const complete = Object.freeze({
  kind: StimulusKind.CompleteEffect,
  commandId: "complete-effect",
  effectId,
  result: {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  },
} as const) satisfies CompleteEffectStimulus;

const effectScenario: Scenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "service-task-effect-success",
  profile: effectProgram.identity.semanticProfile,
  bpmn: {
    id: effectProgram.identity.sourceId,
    relativePath: "scenarios/service-task-effect/process.bpmn",
    sha256: effectProgram.identity.sourceSha256,
  },
  stimuli: [start, complete],
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
    normativeRefs: ["BPMN 2.0.2 §13.3.3"],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: ["ServiceTaskActivityBehavior.java"],
  },
};

test("start closes at one structured effect intent without producing output", () => {
  const started = applyStimulus(effectProgram, initialState, start);

  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(started.state.control, {
    kind: ControlStateKind.Running,
    instanceId: effectId.processInstanceId,
  });
  assert.deepEqual(started.state.effectWaits, [
    {
      id: effectId,
      descriptor,
      arguments: [],
      outputMappings: [],
      bpmnErrorRoute: null,
      output: "place:Flow_ServiceToEnd",
    },
  ]);
  assert.deepEqual(started.state.controlTokens, []);
  assert.equal(started.state.logicalTimeMs, 0);
});

test("exact effect completion consumes the intent and completes", () => {
  const waiting = applyStimulus(effectProgram, initialState, start).state;
  const completed = applyStimulus(effectProgram, waiting, complete);

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: effectId.processInstanceId,
  });
  assert.deepEqual(completed.state.effectWaits, []);
  assert.equal(completed.state.endOccurrences, 1);
});

test("every effect identity mismatch rejects with exact state preservation", () => {
  const waiting = applyStimulus(effectProgram, initialState, start).state;
  const mutations = [
    { processInstanceId: "Other_Instance" },
    { elementId: "Other_Effect" },
    { activation: 2 },
  ];

  for (const mutation of mutations) {
    const rejected = applyStimulus(effectProgram, waiting, {
      ...complete,
      commandId: `reject-${JSON.stringify(mutation)}`,
      effectId: { ...effectId, ...mutation },
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }

  const accepted = applyStimulus(effectProgram, waiting, complete);
  const stale = applyStimulus(effectProgram, accepted.state, {
    ...complete,
    commandId: "stale-effect-result",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, accepted.state);
});

test("scenario exposes the effect intent without a caller interaction", () => {
  const result = runScenario(effectScenario, effectProgram);

  assert.deepEqual(result.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(result.trace[2], {
    kind: CanonicalObservationKind.State,
    instanceId: effectId.processInstanceId,
    status: ProcessStatus.Running,
    activeWaits: [
      {
        elementId: effectId.elementId,
        kind: WaitKind.Effect,
        multiplicity: 1,
      },
    ],
    openUserTasks: [],
    openTimers: [],
    openEffects: [{ id: effectId, descriptor, arguments: [] }],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  });
  assert.deepEqual(result.trace[4], {
    kind: CanonicalObservationKind.State,
    instanceId: effectId.processInstanceId,
    status: ProcessStatus.Completed,
    activeWaits: [],
    openUserTasks: [],
    openTimers: [],
    openEffects: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  });
});

test("projects transport material only from admitted definition and committed intent", () => {
  const waiting = applyStimulus(effectProgram, initialState, start).state;
  const [openEffect] = projectOpenEffects(waiting);

  assert.ok(openEffect !== undefined, "the waiting state must expose one effect");
  assert.deepEqual(
    projectEffectTransportMaterial(effectProgram, openEffect),
    {
      definition: {
        semanticProfile: effectProgram.identity.semanticProfile,
        sourceId: effectProgram.identity.sourceId,
        sourceSha256: effectProgram.identity.sourceSha256,
        processId: effectProgram.processId,
      },
      occurrence: effectId,
      descriptor,
      arguments: [],
    },
  );
});
