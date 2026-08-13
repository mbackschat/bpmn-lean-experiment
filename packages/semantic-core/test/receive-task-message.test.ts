import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  ProcessStatus,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  WaitKind,
  advanceScenario,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";
import { stateObservationAt } from "./canonical-observations.ts";

const profile = "cibseven-2.2.0-message-addressed-receive-task-draft";
const channel = Object.freeze({
  kind: MessageChannelKind.DirectMessage,
  messageId: "Message_NewInvoice",
});
const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: profile,
    sourceId: "message-addressed-receive-task-process",
    sourceOverlay: null,
    sourceSha256:
      "4444444444444444444444444444444444444444444444444444444444444444",
  },
  processId: "Process_MessageAddressedReceiveTaskProbe",
  controlPlaces: [
    controlPlace("SequenceFlow_ReceiveToEnd"),
    controlPlace("SequenceFlow_StartToReceive"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_ProcessCompleted"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:SequenceFlow_ReceiveToEnd",
    },
    {
      ...operationBase("ReceiveTask_WaitForInvoice"),
      kind: SemanticOperationKind.AwaitMessage,
      input: "place:SequenceFlow_StartToReceive",
      output: "place:SequenceFlow_ReceiveToEnd",
      message: {
        elementId: "ReceiveTask_WaitForInvoice",
        channel,
      },
    },
    {
      ...operationBase("StartEvent_ProcessStarted"),
      kind: SemanticOperationKind.Initiate,
      output: "place:SequenceFlow_StartToReceive",
    },
  ],
});
const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-receive-task",
  processId: program.processId,
  instanceId: "ReceiveTaskInstance_1",
  initialVariables: [],
});
const subscriptionId = Object.freeze({
  processInstanceId: start.instanceId,
  elementId: "ReceiveTask_WaitForInvoice",
  activation: 1,
});
const delivery = Object.freeze({
  kind: StimulusKind.DeliverMessage,
  commandId: "deliver-receive-task-message",
  subscriptionId,
  channel,
}) satisfies DeliverMessageStimulus;

test("reuses awaitMessage to wait and complete one direct Receive Task", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  const waiting = applyStimulus(program, initialState, start);
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(waiting.state.messageWaits, [{
    id: subscriptionId,
    owner: rootScopeOccurrence(program.processId, start.instanceId),
    channel,
    output: "place:SequenceFlow_ReceiveToEnd",
  }]);

  const completed = applyStimulus(program, waiting.state, delivery);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.messageWaits, []);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: start.instanceId,
  });
});

test("projects the direct Receive Task subscription and interaction", () => {
  const waitingStep = advanceScenario(program, initialState, start);
  assert.deepEqual(stateObservationAt(waitingStep.observations, 1), {
    kind: CanonicalObservationKind.State,
    instanceId: start.instanceId,
    status: ProcessStatus.Running,
    activeWaits: [{
      elementId: subscriptionId.elementId,
      kind: WaitKind.Message,
      multiplicity: 1,
    }],
    openUserTasks: [],
    openMessageSubscriptions: [{ id: subscriptionId, channel }],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [{
      kind: StimulusKind.DeliverMessage,
      subscriptionId,
      channel,
    }],
    logicalTimeMs: 0,
  });

  const waiting = applyStimulus(program, initialState, start);
  const completedStep = advanceScenario(program, waiting.state, delivery);
  assert.deepEqual(stateObservationAt(completedStep.observations, 1), {
    kind: CanonicalObservationKind.State,
    instanceId: start.instanceId,
    status: ProcessStatus.Completed,
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  });
});

test("exact channel equality separates direct and operation-addressed Messages", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const mismatches: ReadonlyArray<DeliverMessageStimulus> = [
    {
      ...delivery,
      commandId: "wrong-message",
      channel: { ...channel, messageId: "Message_Other" },
    },
    {
      ...delivery,
      commandId: "wrong-kind",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_ProcessMessages",
        interfaceOperationId: "Operation_ReceiveApprovalRequest",
        messageId: channel.messageId,
      },
    },
  ];

  for (const stimulus of mismatches) {
    const rejected = applyStimulus(program, waiting, stimulus);
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("early and consumed direct deliveries reject with exact state preservation", () => {
  const early = applyStimulus(program, initialState, delivery);
  assert.equal(early.outcome, CommandOutcome.Rejected);
  assert.deepEqual(early.state, initialState);

  const waiting = applyStimulus(program, initialState, start);
  const completed = applyStimulus(program, waiting.state, delivery);
  const stale = applyStimulus(program, completed.state, {
    ...delivery,
    commandId: "stale-delivery",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed.state);
});

test("program admission rejects malformed or mixed Message channel arms", () => {
  const awaitMessageIndex = program.operations.findIndex(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessage,
  );
  assert.notEqual(awaitMessageIndex, -1);

  for (const channelMutation of [
    { kind: "directMessage" },
    {
      kind: "directMessage",
      messageId: "Message_NewInvoice",
      interfaceId: "Interface_Forbidden",
    },
    {
      kind: "operationMessage",
      messageId: "Message_NewInvoice",
      interfaceOperationId: "Operation_Incomplete",
    },
    { kind: "unknownMessage", messageId: "Message_NewInvoice" },
  ]) {
    const operation = program.operations[awaitMessageIndex];
    assert.equal(operation?.kind, SemanticOperationKind.AwaitMessage);
    if (operation?.kind !== SemanticOperationKind.AwaitMessage) {
      throw new Error("missing Receive Task wait");
    }
    const mutatedOperation = {
      ...operation,
      message: { ...operation.message, channel: channelMutation },
    };
    const operations = [
      ...program.operations.slice(0, awaitMessageIndex),
      mutatedOperation,
      ...program.operations.slice(awaitMessageIndex + 1),
    ];
    assert.equal(
      isWellFormedSemanticProcessProgram({ ...program, operations }),
      false,
    );
  }
});
