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
  isWellFormedSemanticProcessProgram,
  projectEffectTransportMaterial,
  projectOpenEffects,
  runScenario,
  supportsSemanticProcessScenario,
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
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const descriptor = Object.freeze({
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
});

const effectProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    sourceId: "service-task-effect-process",
    sourceOverlay: null,
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
      kind: SemanticOperationKind.ReachNoneEnd,
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
});

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
  initialVariables: [],
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

const overlayProgram = {
  ...effectProgram,
  identity: {
    ...effectProgram.identity,
    sourceOverlay: {
      id: "mapped-service-task-adoption",
      sha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  },
} as unknown as SemanticProcessProgram;

const effectScenario: Scenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "service-task-effect-success",
  profile: effectProgram.identity.semanticProfile,
  bpmn: {
    id: effectProgram.identity.sourceId,
    relativePath: "scenarios/service-task-effect/process.bpmn",
    sha256: effectProgram.identity.sourceSha256,
    sourceOverlay: null,
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
      owner: rootScopeOccurrence(effectProgram.processId, start.instanceId),
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
    openMessageSubscriptions: [],
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
    openMessageSubscriptions: [],
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
        sourceOverlay: null,
        processId: effectProgram.processId,
      },
      occurrence: effectId,
      descriptor,
      arguments: [],
    },
  );
});

test("admits an exact source-overlay identity", () => {
  assert.equal(isWellFormedSemanticProcessProgram(effectProgram), true);
  assert.equal(isWellFormedSemanticProcessProgram(overlayProgram), true);

  const overlayScenario = {
    ...effectScenario,
    bpmn: {
      ...effectScenario.bpmn,
      sourceOverlay: overlayProgram.identity.sourceOverlay,
    },
  };
  const overlayIdentity = overlayScenario.bpmn.sourceOverlay;
  if (overlayIdentity === null) {
    throw new Error("overlay fixture omitted its exact identity");
  }
  assert.equal(
    supportsSemanticProcessScenario(overlayScenario, overlayProgram),
    true,
  );
  assert.equal(
    supportsSemanticProcessScenario(
      {
        ...overlayScenario,
        bpmn: {
          ...overlayScenario.bpmn,
          sourceOverlay: {
            id: overlayIdentity.id,
            sha256: "b".repeat(64),
          },
        },
      },
      overlayProgram,
    ),
    false,
  );
});

test("rejects missing, extra, malformed, and noncanonical source-overlay identity data", () => {
  const { sourceOverlay: _omitted, ...missingOverlay } = effectProgram.identity;
  const malformedIdentities: ReadonlyArray<unknown> = [
    missingOverlay,
    { ...effectProgram.identity, sourceOverlay: undefined },
    {
      ...effectProgram.identity,
      sourceOverlay: {
        id: "",
        sha256: "a".repeat(64),
      },
    },
    {
      ...effectProgram.identity,
      sourceOverlay: {
        id: "bad\ud800id",
        sha256: "a".repeat(64),
      },
    },
    {
      ...effectProgram.identity,
      sourceOverlay: {
        id: "mapped-service-task-adoption",
        sha256: "A".repeat(64),
      },
    },
    {
      ...effectProgram.identity,
      sourceOverlay: {
        id: "mapped-service-task-adoption",
        sha256: "a".repeat(63),
      },
    },
    {
      ...effectProgram.identity,
      sourceOverlay: {
        id: "mapped-service-task-adoption",
        sha256: "a".repeat(64),
        extra: true,
      },
    },
    { ...effectProgram.identity, extra: true },
  ];

  for (const identity of malformedIdentities) {
    assert.equal(
      isWellFormedSemanticProcessProgram({ ...effectProgram, identity }),
      false,
    );
  }

  const { sourceOverlay: _omittedScenario, ...missingScenarioOverlay } =
    effectScenario.bpmn;
  const malformedScenarioResources: ReadonlyArray<unknown> = [
    missingScenarioOverlay,
    { ...effectScenario.bpmn, sourceOverlay: undefined },
    {
      ...effectScenario.bpmn,
      sourceOverlay: {
        id: "mapped-service-task-adoption",
        sha256: "A".repeat(64),
      },
    },
    {
      ...effectScenario.bpmn,
      sourceOverlay: null,
      extra: true,
    },
  ];
  for (const bpmn of malformedScenarioResources) {
    assert.equal(
      supportsSemanticProcessScenario(
        { ...effectScenario, bpmn } as unknown as Scenario,
        effectProgram,
      ),
      false,
    );
  }
});

test("binds the source-overlay digest into effect transport material", () => {
  const waiting = applyStimulus(effectProgram, initialState, start).state;
  const [openEffect] = projectOpenEffects(waiting);
  assert.ok(openEffect !== undefined, "the waiting state must expose one effect");

  const changedDigestProgram = {
    ...overlayProgram,
    identity: {
      ...overlayProgram.identity,
      sourceOverlay: {
        ...overlayProgram.identity.sourceOverlay,
        sha256:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
  } as SemanticProcessProgram;
  assert.notDeepEqual(
    projectEffectTransportMaterial(overlayProgram, openEffect),
    projectEffectTransportMaterial(changedDigestProgram, openEffect),
  );
  assert.deepEqual(
    applyStimulus(overlayProgram, initialState, start),
    applyStimulus(changedDigestProgram, initialState, start),
  );
});
