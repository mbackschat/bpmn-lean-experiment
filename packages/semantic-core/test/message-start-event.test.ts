import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CheckedNodeKind,
  CommandOutcome,
  MessageChannelKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  advanceScenario,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedStimulus,
  isWellFormedInitiateMessageOperation,
  isWellFormedSemanticProcessProgram,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  supportsSemanticProcessExecution,
  supportsSemanticProcessScenario,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  EnabledInteraction,
  OccurrenceId,
  ProcessStartStimulus,
  Scenario,
  SemanticProcessProgram,
  StateObservation,
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_OrderMessages",
  interfaceOperationId: "Operation_StartOrder",
  messageId: "Message_OrderRequested",
});

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.MessageStart,
    sourceId: "message-start-process",
    sourceOverlay: null,
    sourceSha256:
      "7777777777777777777777777777777777777777777777777777777777777777",
  },
  processId: "Process_MessageStart",
  controlPlaces: [
    controlPlace("Flow_StartToTask"),
    controlPlace("Flow_TaskToEnd"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_TaskToEnd",
    },
    {
      ...operationBase("StartEvent_Message"),
      kind: SemanticOperationKind.InitiateMessage,
      channel,
      outputs: ["place:Flow_StartToTask"],
    },
    {
      ...operationBase("UserTask_Review"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_StartToTask",
      output: "place:Flow_TaskToEnd",
      task: {
        elementId: "UserTask_Review",
        name: "Review order",
      },
    },
  ],
});

const trigger = Object.freeze({
  kind: StimulusKind.TriggerMessageStart,
  commandId: "start-order-message",
  processId: program.processId,
  instanceId: "MessageStartInstance_1",
  startEventId: "StartEvent_Message",
  channel,
}) satisfies TriggerMessageStartStimulus;

const manualStart = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-order-manually",
  processId: program.processId,
  instanceId: "ManualInstance_1",
  initialVariables: [],
});

const ordinaryProgram = rootScopedProgram({
  ...program,
  identity: {
    ...program.identity,
    semanticProfile: SemanticProfileId.UserTask,
    sourceId: "ordinary-none-start-process",
    sourceSha256:
      "8888888888888888888888888888888888888888888888888888888888888888",
  },
  processId: "Process_NoneStart",
  operations: program.operations.map((operation) =>
    operation.kind === SemanticOperationKind.InitiateMessage
      ? {
          ...operationBase("StartEvent_None"),
          kind: SemanticOperationKind.Initiate,
          output: "place:Flow_StartToTask",
        }
      : operation
  ),
});

const ordinaryStart = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-ordinary-process",
  processId: ordinaryProgram.processId,
  instanceId: "NoneStartInstance_1",
  initialVariables: [],
});

test("admits an exact operation-addressed Message start and closes at one User Task", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(trigger, program), true);

  const beforeFirstStep = applyStimulus(program, initialState, trigger, 0);
  assert.equal(beforeFirstStep.outcome, CommandOutcome.Committed);
  assert.equal(beforeFirstStep.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(program, beforeFirstStep.state), 1);

  const messageStart = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  assert.notEqual(messageStart, undefined);
  if (messageStart?.kind !== SemanticOperationKind.InitiateMessage) {
    throw new TypeError("Expected the Message initiation operation");
  }
  const beforeSecondStep = applyInternalOperation(
    program,
    messageStart,
    beforeFirstStep.state,
  );
  assert.notEqual(beforeSecondStep, null);
  if (beforeSecondStep === null) {
    throw new TypeError("Expected Message initiation to advance");
  }
  assert.equal(enabledInternalOperationCount(program, beforeSecondStep), 1);

  const oneStep = applyStimulus(program, initialState, trigger, 1);
  assert.equal(oneStep.internalStepBoundExceeded, true);

  const closed = applyStimulus(program, initialState, trigger);
  assert.equal(closed.outcome, CommandOutcome.Committed);
  assert.equal(closed.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, closed.state), 0);
  assert.equal(isStableStateResumable(closed.state), true);
  assert.deepEqual(closed.state.messageWaits, []);
  assert.deepEqual(closed.state.variables, {
    process: { bindings: [] },
    activities: [],
  });
  assert.deepEqual(closed.state.userTaskWaits, [{
    id: {
      processInstanceId: trigger.instanceId,
      elementId: "UserTask_Review",
      activation: 1,
    },
    owner: rootScopeOccurrence(program.processId, trigger.instanceId),
    name: "Review order",
    output: "place:Flow_TaskToEnd",
  }]);
});

test("matches the ordinary None-start downstream canonical observation", () => {
  const messageStep = advanceScenario(program, initialState, trigger);
  const ordinaryStep = advanceScenario(
    ordinaryProgram,
    initialState,
    ordinaryStart,
  );
  assert.equal(messageStep.kind, ScenarioStepKind.Committed);
  assert.equal(ordinaryStep.kind, ScenarioStepKind.Committed);
  if (
    messageStep.kind !== ScenarioStepKind.Committed ||
    ordinaryStep.kind !== ScenarioStepKind.Committed
  ) {
    throw new TypeError("Expected both starts to commit");
  }
  const messageState = messageStep.observations.find(
    ({ kind }) => kind === CanonicalObservationKind.State,
  );
  const ordinaryState = ordinaryStep.observations.find(
    ({ kind }) => kind === CanonicalObservationKind.State,
  );
  assert.notEqual(messageState, undefined);
  assert.notEqual(ordinaryState, undefined);
  assert.notEqual(program.identity.sourceId, ordinaryProgram.identity.sourceId);
  assert.notEqual(trigger.instanceId, ordinaryStart.instanceId);
  if (
    messageState?.kind !== CanonicalObservationKind.State ||
    ordinaryState?.kind !== CanonicalObservationKind.State
  ) {
    throw new TypeError("Expected both starts to publish state observations");
  }
  assert.deepEqual(
    normalizeSemanticInstanceIdentity(messageState),
    normalizeSemanticInstanceIdentity(ordinaryState),
  );
});

test("rejects every exact Message-start identity mismatch without a transition", () => {
  const mutations: ReadonlyArray<TriggerMessageStartStimulus> = [
    { ...trigger, processId: "OtherProcess" },
    { ...trigger, startEventId: "OtherStart" },
    { ...trigger, channel: { ...channel, messageId: "OtherMessage" } },
    { ...trigger, channel: { ...channel, interfaceId: "OtherInterface" } },
    {
      ...trigger,
      channel: { ...channel, interfaceOperationId: "OtherOperation" },
    },
  ];

  for (const mutation of mutations) {
    const rejected = applyStimulus(program, initialState, mutation);
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.equal(rejected.state, initialState);
    assert.equal(rejected.internalStepBoundExceeded, false);
  }
});

test("strictly validates and compares the complete resolved trigger wire", () => {
  assert.equal(isWellFormedStimulus(trigger), true);
  assert.equal(stimulusCommandId(trigger), trigger.commandId);
  assert.equal(sameStimulus(trigger, { ...trigger }), true);
  assert.equal(
    sameStimulus(trigger, {
      ...trigger,
      channel: { ...channel, interfaceOperationId: "OtherOperation" },
    }),
    false,
  );
  assert.equal(isWellFormedStimulus({ ...trigger, payload: null }), false);
  assert.equal(
    isWellFormedStimulus({
      ...trigger,
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId: channel.messageId,
      },
    }),
    false,
  );
});

test("rejects cross-kind and repeated starts with exact state identity", () => {
  const manualAgainstMessage = applyStimulus(
    program,
    initialState,
    manualStart,
  );
  assert.equal(manualAgainstMessage.outcome, CommandOutcome.Rejected);
  assert.equal(manualAgainstMessage.state, initialState);

  const manualProgram = rootScopedProgram({
    ...program,
    identity: {
      ...program.identity,
      semanticProfile: "cibseven-2.2.0-user-task-process-data-draft",
    },
    operations: program.operations.map((operation) =>
      operation.kind === SemanticOperationKind.InitiateMessage
        ? {
            ...operationBase("StartEvent_Message"),
            kind: SemanticOperationKind.Initiate,
            output: "place:Flow_StartToTask",
          }
        : operation
    ),
  });
  const messageAgainstManual = applyStimulus(
    manualProgram,
    initialState,
    trigger,
  );
  assert.equal(messageAgainstManual.outcome, CommandOutcome.Rejected);
  assert.equal(messageAgainstManual.state, initialState);
  assert.equal(supportsSemanticProcessExecution(trigger, manualProgram), false);
  assert.equal(supportsSemanticProcessExecution(manualStart, program), false);

  for (const malformedProgram of [
    {
      ...program,
      identity: {
        ...program.identity,
        semanticProfile: SemanticProfileId.UserTask,
      },
    },
    {
      ...program,
      definitionScopes: program.definitionScopes.map((scope) => ({
        ...scope,
        originElementId: "OtherProcess",
      })),
    },
    {
      ...program,
      operationScopes: program.operationScopes.map((ownership) =>
        ownership.operationId === "operation:StartEvent_Message"
          ? { ...ownership, scopeId: "scope:OtherProcess" }
          : ownership
      ),
    },
    {
      ...program,
      operations: [
        ...program.operations,
        {
          ...operationBase("EndEvent_Extra"),
          kind: SemanticOperationKind.ReachNoneEnd,
          input: "place:Flow_TaskToEnd",
        },
      ],
    },
  ] satisfies ReadonlyArray<SemanticProcessProgram>) {
    const rejected = applyStimulus(
      malformedProgram,
      initialState,
      trigger,
    );
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.equal(rejected.state, initialState);
  }

  const started = applyStimulus(program, initialState, trigger);
  const repeated = applyStimulus(program, started.state, {
    ...trigger,
    commandId: "repeat-start-order-message",
  });
  assert.equal(repeated.outcome, CommandOutcome.Rejected);
  assert.equal(repeated.state, started.state);
});

test("keeps generic Message initiation outputs canonical while the profile is exact-one", () => {
  const genericOperation = {
    ...operationBase("StartEvent_Message"),
    kind: SemanticOperationKind.InitiateMessage,
    channel,
    outputs: ["place:Flow_A", "place:Flow_B"],
  } as const;
  const places = new Set(genericOperation.outputs);
  const pending = applyStimulus(program, initialState, trigger, 0).state;
  const branched = applyInternalOperation(program, genericOperation, pending);

  assert.deepEqual(branched?.controlTokens, genericOperation.outputs.map(
    (placeId) => ({
      placeId,
      owner: rootScopeOccurrence(program.processId, trigger.instanceId),
      multiplicity: 1,
    }),
  ));
  assert.equal(
    isWellFormedInitiateMessageOperation(
      genericOperation,
      places,
    ),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      SemanticProfileId.MessageStart,
      [
        genericOperation,
        ...program.operations.filter(
          ({ kind }) => kind !== SemanticOperationKind.InitiateMessage,
        ),
      ],
      1,
    ),
    false,
  );

  for (const outputs of [
    [],
    ["place:Flow_A", "place:Flow_A"],
    ["place:Flow_B", "place:Flow_A"],
  ]) {
    assert.equal(
      isWellFormedInitiateMessageOperation(
        { ...genericOperation, outputs },
        places,
      ),
      false,
    );
  }
});

test("creates distinct root ownership for distinct fresh instances", () => {
  const first = applyStimulus(program, initialState, trigger);
  const secondTrigger = {
    ...trigger,
    commandId: "start-second-order-message",
    instanceId: "MessageStartInstance_2",
  } as const satisfies TriggerMessageStartStimulus;
  const second = applyStimulus(program, initialState, secondTrigger);

  assert.notDeepEqual(first.state.scopeOccurrences, second.state.scopeOccurrences);
  assert.deepEqual(first.state.userTaskWaits[0]?.owner, rootScopeOccurrence(
    program.processId,
    trigger.instanceId,
  ));
  assert.deepEqual(second.state.userTaskWaits[0]?.owner, rootScopeOccurrence(
    program.processId,
    secondTrigger.instanceId,
  ));
});

test("admits exactly one supported start stimulus at scenario index zero", () => {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: "message-start-profile",
    profile: SemanticProfileId.MessageStart,
    bpmn: {
      id: program.identity.sourceId,
      relativePath: "message-start.bpmn",
      sha256: program.identity.sourceSha256,
      sourceOverlay: null,
    },
    stimuli: [trigger],
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
      normativeRefs: [],
      cibRevision: "not-applicable",
      cibRefs: [],
    },
  } as const satisfies Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, program), true);

  for (const stimuli of [
    [manualStart],
    [trigger, trigger],
    [trigger, manualStart],
  ] satisfies ReadonlyArray<ReadonlyArray<ProcessStartStimulus>>) {
    assert.equal(
      supportsSemanticProcessScenario({ ...scenario, stimuli }, program),
      false,
    );
  }
});

test("registers Message Start in the product profile catalog", () => {
  assert.equal(
    Object.values(SemanticProfileId).includes(SemanticProfileId.MessageStart),
    true,
  );
});

test("admits the exact checked Message Start node shape", () => {
  assert.equal(
    profileAllowsCheckedProcessShape(
      SemanticProfileId.MessageStart,
      [
        {
          kind: CheckedNodeKind.MessageStartEvent,
          id: "StartEvent_Message",
          channel,
        },
        {
          kind: CheckedNodeKind.UserTask,
          id: "UserTask_Review",
          name: "Review order",
        },
        { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
      ],
      1,
    ),
    true,
  );
});

function normalizeSemanticInstanceIdentity(
  observation: StateObservation,
): StateObservation {
  return {
    ...observation,
    instanceId: "NormalizedInstance",
    openUserTasks: observation.openUserTasks.map((task) => ({
      ...task,
      id: normalizeOccurrenceId(task.id),
    })),
    openMessageSubscriptions: observation.openMessageSubscriptions.map(
      (subscription) => ({
        ...subscription,
        id: normalizeOccurrenceId(subscription.id),
      }),
    ),
    openTimers: observation.openTimers.map((timer) => ({
      ...timer,
      id: normalizeOccurrenceId(timer.id),
    })),
    openEffects: observation.openEffects.map((effect) => ({
      ...effect,
      id: normalizeOccurrenceId(effect.id),
    })),
    enabledInteractions: observation.enabledInteractions.map(
      normalizeEnabledInteraction,
    ),
  };
}

function normalizeEnabledInteraction(
  interaction: EnabledInteraction,
): EnabledInteraction {
  switch (interaction.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      return { ...interaction, taskId: normalizeOccurrenceId(interaction.taskId) };
    case StimulusKind.DeliverMessage:
      return {
        ...interaction,
        subscriptionId: normalizeOccurrenceId(interaction.subscriptionId),
      };
    default:
      return assertNever(interaction);
  }
}

function normalizeOccurrenceId(id: OccurrenceId): OccurrenceId {
  return { ...id, processInstanceId: "NormalizedInstance" };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported interaction: ${JSON.stringify(value)}`);
}
