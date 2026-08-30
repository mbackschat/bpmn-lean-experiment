import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitPayloadMessageOperation,
  DeliverPayloadMessageStimulus,
  MessageChannel,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopeOccurrence,
  rootScopedProgram,
} from "./root-scope-fixture.ts";

const processId = "Process_MessagePayloadCatch";
const instanceId = "Instance_MessagePayloadCatch";
const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
});

function awaitPayloadMessage(
  selectedChannel: MessageChannel = channel,
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
      controlPlace("Flow_Review_End"),
      controlPlace("Flow_Start_Confirm"),
    ],
    operations: [
      {
        ...operationBase("StartEvent_InstructionReceived"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Start_Confirm",
      },
      {
        ...operationBase("UserTask_ConfirmInstruction"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Start_Confirm",
        output: "place:Flow_Instructed_Confirm",
        task: {
          elementId: "UserTask_ConfirmInstruction",
          name: "Confirm settlement instruction",
        },
      },
      operation,
      {
        ...operationBase("UserTask_ReviewConfirmation"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Confirm_Review",
        output: "place:Flow_Review_End",
        task: {
          elementId: "UserTask_ReviewConfirmation",
          name: "Review settlement confirmation",
        },
      },
      {
        ...operationBase("EndEvent_Settled"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Review_End",
      },
    ],
  });
}

const owner = rootScopeOccurrence(processId, instanceId);
const payloadFrontier: RuntimeState = {
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId },
  scopeOccurrences: [{ id: owner, parent: null }],
  controlTokens: [{
    placeId: "place:Flow_Instructed_Confirm",
    owner,
    multiplicity: 1,
  }],
  scopeActivations: [{ elementId: processId, count: 1 }],
};

const delivery = Object.freeze({
  kind: StimulusKind.DeliverPayloadMessage,
  commandId: "deliver-settlement-reference",
  subscriptionId: {
    processInstanceId: instanceId,
    elementId: "MessageCatch_SettlementConfirmed",
    activation: 1,
  },
  channel,
  payload: {
    kind: VariableValueKind.String,
    value: "settlement-reference-123",
  },
}) satisfies DeliverPayloadMessageStimulus;

test("admits only the operation-addressed payload-catch IL identity chain", () => {
  assert.equal(isWellFormedSemanticProcessProgram(payloadProgram()), true);
  assert.equal(
    isWellFormedSemanticProcessProgram(payloadProgram(awaitPayloadMessage({
      kind: MessageChannelKind.DirectMessage,
      messageId: channel.messageId,
    }))),
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

test("keeps payload-catch execution fail-closed at the source checkpoint", () => {
  const program = payloadProgram();
  const operation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitPayloadMessage,
  );
  assert.ok(operation !== undefined);
  assert.equal(applyInternalOperation(program, operation, payloadFrontier), null);

  const payloadResult = applyStimulus(program, payloadFrontier, delivery);
  assert.equal(payloadResult.outcome, CommandOutcome.Rejected);
  assert.deepEqual(payloadResult.state, payloadFrontier);

  const payloadFreeResult = applyStimulus(program, payloadFrontier, {
    kind: StimulusKind.DeliverMessage,
    commandId: delivery.commandId,
    subscriptionId: delivery.subscriptionId,
    channel: delivery.channel,
  });
  assert.equal(payloadFreeResult.outcome, CommandOutcome.Rejected);
  assert.deepEqual(payloadFreeResult.state, payloadFrontier);
});
