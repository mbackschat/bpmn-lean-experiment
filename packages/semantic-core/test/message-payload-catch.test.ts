import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  ProcessStatus,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  observeStableState,
  runtimeStateDefects,
  sameStimulus,
  supportsSemanticProcessExecution,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitPayloadMessageOperation,
  DeliverPayloadMessageStimulus,
  SemanticProcessProgram,
  VariableValue,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopeOccurrence,
  rootScopedProgram,
} from "./root-scope-fixture.ts";

const processId = "Process_MessagePayloadSettlement";
const instanceId = "Instance_MessagePayloadCatch";
const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const satisfies AwaitPayloadMessageOperation["message"]["channel"]);

function awaitPayloadMessage(
  selectedChannel: AwaitPayloadMessageOperation["message"]["channel"] = channel,
): AwaitPayloadMessageOperation {
  return {
    ...operationBase("MessageCatch_SettlementConfirmed"),
    kind: SemanticOperationKind.AwaitPayloadMessage,
    input: "place:Flow_Instructed_Confirm",
    output: "place:Flow_Confirm_Review",
    message: {
      elementId: "MessageCatch_SettlementConfirmed",
      channel: selectedChannel,
    },
    directOutput: {
      associationId: "DataOutputAssociation_SettlementReference",
      sourceDataOutputId: "DataOutput_ConfirmedReference",
      sourceDataOutputName: "Confirmed settlement reference",
      targetPropertyId: "Property_SettlementReference",
    },
  };
}

function payloadProgram(
  operation: AwaitPayloadMessageOperation = awaitPayloadMessage(),
): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.MessagePayloadCatch,
      sourceId: "message-payload-catch-process",
      sourceOverlay: null,
      sourceSha256:
        "9999999999999999999999999999999999999999999999999999999999999999",
    },
    processId,
    controlPlaces: [
      controlPlace("Flow_Confirm_Review"),
      controlPlace("Flow_Instructed_Confirm"),
      controlPlace("Flow_Review_Recorded"),
    ],
    operations: [
      {
        ...operationBase("StartEvent_PaymentInstructed"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Instructed_Confirm",
      },
      operation,
      {
        ...operationBase("UserTask_ReviewSettlement"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Confirm_Review",
        output: "place:Flow_Review_Recorded",
        task: {
          elementId: "UserTask_ReviewSettlement",
          name: "Review settlement",
        },
      },
      {
        ...operationBase("EndEvent_SettlementRecorded"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Review_Recorded",
      },
    ],
  });
}

const owner = rootScopeOccurrence(processId, instanceId);
const subscriptionId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "MessageCatch_SettlementConfirmed",
  activation: 1,
});
const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-message-payload-catch",
  processId,
  instanceId,
  initialVariables: [],
});

const delivery = Object.freeze({
  kind: StimulusKind.DeliverPayloadMessage,
  commandId: "deliver-settlement-reference",
  subscriptionId,
  channel,
  payload: {
    kind: VariableValueKind.String,
    value: "Property_SettlementReference",
  },
} as const satisfies DeliverPayloadMessageStimulus);

test("admits only the operation-addressed payload-catch IL identity chain", () => {
  assert.equal(isWellFormedSemanticProcessProgram(payloadProgram()), true);
  const validOperation = awaitPayloadMessage();
  const directMessageOperation = {
    ...validOperation,
    message: {
      ...validOperation.message,
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId: channel.messageId,
      },
    },
  } as unknown as AwaitPayloadMessageOperation;
  assert.equal(
    isWellFormedSemanticProcessProgram(payloadProgram(directMessageOperation)),
    false,
  );
  assert.equal(
    isWellFormedSemanticProcessProgram(payloadProgram(awaitPayloadMessage({
      ...channel,
      messageId: "DataOutput_ConfirmedReference",
    }))),
    false,
  );
});

test("binds payload delivery identity to the exact delivered value", () => {
  assert.equal(isWellFormedStimulus(delivery), true);
  assert.equal(stimulusCommandId(delivery), delivery.commandId);
  assert.equal(sameStimulus(delivery, structuredClone(delivery)), true);
  assert.equal(sameStimulus(delivery, {
    ...delivery,
    payload: { kind: VariableValueKind.String, value: "different" },
  }), false);
  assert.equal(isWellFormedStimulus({ ...delivery, payload: null }), false);
  assert.equal(isWellFormedStimulus({ ...delivery, extra: true }), false);
});

test("arms one ordinary Message wait and publishes the payload-bearing interaction", () => {
  const program = payloadProgram();
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  const waiting = applyStimulus(program, initialState, start);
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(waiting.state.messageWaits, [{
    id: subscriptionId,
    owner,
    channel,
    output: "place:Flow_Confirm_Review",
  }]);
  assert.deepEqual(runtimeStateDefects(program, instanceId, waiting.state), []);

  const observation = observeStableState(program, waiting.state);
  assert.deepEqual(observation?.openMessageSubscriptions, [{
    id: subscriptionId,
    channel,
  }]);
  assert.deepEqual(observation?.enabledInteractions, [{
    kind: StimulusKind.DeliverPayloadMessage,
    subscriptionId,
    channel,
  }]);

  const payloadFreeResult = applyStimulus(program, waiting.state, {
    kind: StimulusKind.DeliverMessage,
    commandId: "deliver-without-required-payload",
    subscriptionId,
    channel,
  });
  assert.equal(payloadFreeResult.outcome, CommandOutcome.Rejected);
  assert.deepEqual(payloadFreeResult.state, waiting.state);
});

test("routes the payload through the association and completes the catch atomically", () => {
  const program = payloadProgram();
  const waiting = applyStimulus(program, initialState, start).state;

  const payloadResult = applyStimulus(program, waiting, delivery);
  assert.equal(payloadResult.outcome, CommandOutcome.Committed);
  assert.deepEqual(payloadResult.state.messageWaits, []);
  assert.deepEqual(payloadResult.state.variables.process.bindings, [{
    name: "Property_SettlementReference",
    value: delivery.payload,
  }]);
  assert.equal(
    payloadResult.state.variables.process.bindings.some(({ name }) =>
      name === "DataOutput_ConfirmedReference" ||
      name === "Message_SettlementConfirmed"
    ),
    false,
  );
  assert.deepEqual(payloadResult.state.userTaskWaits.map(({ id }) => id), [{
    processInstanceId: instanceId,
    elementId: "UserTask_ReviewSettlement",
    activation: 1,
  }]);
  assert.deepEqual(runtimeStateDefects(program, instanceId, payloadResult.state), []);

  const observation = observeStableState(program, payloadResult.state);
  assert.equal(observation?.status, ProcessStatus.Running);
  assert.deepEqual(observation?.variables, [{
    name: "Property_SettlementReference",
    value: delivery.payload,
  }]);

  const stale = applyStimulus(program, payloadResult.state, {
    ...delivery,
    commandId: "deliver-stale-payload",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, payloadResult.state);
});

test("commits every scalar payload including explicit null and refuses a collection", () => {
  const program = payloadProgram();
  const scalarPayloads: ReadonlyArray<VariableValue> = [
    { kind: VariableValueKind.Boolean, value: true },
    { kind: VariableValueKind.Integer, value: 7 },
    { kind: VariableValueKind.String, value: "settlement-reference-123" },
    { kind: VariableValueKind.Null },
  ];
  for (const [index, payload] of scalarPayloads.entries()) {
    const selectedInstanceId = `${instanceId}_Scalar_${index}`;
    const selectedStart = {
      ...start,
      commandId: `start-scalar-${index}`,
      instanceId: selectedInstanceId,
    };
    const waiting = applyStimulus(program, initialState, selectedStart).state;
    const result = applyStimulus(program, waiting, {
      ...delivery,
      commandId: `deliver-scalar-${index}`,
      subscriptionId: { ...subscriptionId, processInstanceId: selectedInstanceId },
      payload,
    });
    assert.equal(result.outcome, CommandOutcome.Committed, payload.kind);
    assert.deepEqual(result.state.variables.process.bindings, [{
      name: "Property_SettlementReference",
      value: payload,
    }]);
  }

  const waiting = applyStimulus(program, initialState, start).state;
  const collection = applyStimulus(program, waiting, {
    ...delivery,
    commandId: "deliver-collection",
    payload: { kind: VariableValueKind.StringList, value: ["one"] },
  });
  assert.equal(collection.outcome, CommandOutcome.Rejected);
  assert.deepEqual(collection.state, waiting);
});

test("refuses every subscription or channel mismatch with exact state preservation", () => {
  const program = payloadProgram();
  const waiting = applyStimulus(program, initialState, start).state;
  const mutations: ReadonlyArray<Partial<DeliverPayloadMessageStimulus>> = [
    { subscriptionId: { ...subscriptionId, processInstanceId: "OtherInstance" } },
    { subscriptionId: { ...subscriptionId, elementId: "OtherCatch" } },
    { subscriptionId: { ...subscriptionId, activation: 2 } },
    { channel: { ...channel, interfaceId: "OtherInterface" } },
    { channel: { ...channel, interfaceOperationId: "OtherOperation" } },
    { channel: { ...channel, messageId: "OtherMessage" } },
  ];
  for (const [index, mutation] of mutations.entries()) {
    const result = applyStimulus(program, waiting, {
      ...delivery,
      ...mutation,
      commandId: `deliver-mismatch-${index}`,
    });
    assert.equal(result.outcome, CommandOutcome.Rejected, result.state.control.kind);
    assert.deepEqual(result.state, waiting);
  }
});

test("publishes one completed catch lifecycle for payload delivery", () => {
  const program = payloadProgram();
  const waiting = applyStimulus(program, initialState, start).state;

  const traced = applyStimulusWithTrace(program, waiting, delivery);

  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  assert.equal(traced.committedTransitions.length > 0, true);
  assert.deepEqual(traced.flowNodeOccurrenceLifecycles[0]?.ended, [{
    anchor: { kind: "wait", id: subscriptionId },
    terminal: "completed",
  }]);
});
