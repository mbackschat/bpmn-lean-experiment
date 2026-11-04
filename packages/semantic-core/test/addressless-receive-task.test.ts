/**
 * Locks the addressless Receive Task account (ARECV-*) on the parcel-handover Program: the field-free
 * unspecified channel is resumed only by a delivery naming the published occurrence with that channel.
 */
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
  isCorrelatedMessageAddress,
  isMessageChannel,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  sameMessageChannel,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { DeliverMessageStimulus, MessageChannel } from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";
import { stateObservationAt } from "./canonical-observations.ts";

const unspecified = Object.freeze({ kind: MessageChannelKind.UnspecifiedMessage });
const direct = Object.freeze({ kind: MessageChannelKind.DirectMessage, messageId: "Message_CourierPickup" });
const operation = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_Courier",
  interfaceOperationId: "Operation_Pickup",
  messageId: "Message_CourierPickup",
});

function parcelHandover(channel: MessageChannel, semanticProfile = "cibseven-2.2.0-addressless-receive-task-draft") {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile,
      sourceId: "addressless-receive-task-process",
      sourceOverlay: null,
      sourceSha256: "5555555555555555555555555555555555555555555555555555555555555555",
    },
    processId: "Process_ParcelHandover",
    controlPlaces: [controlPlace("SequenceFlow_PickupToHandedOver"), controlPlace("SequenceFlow_RequestedToPickup")],
    operations: [
      {
        ...operationBase("EndEvent_ParcelHandedOver"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:SequenceFlow_PickupToHandedOver",
      },
      {
        ...operationBase("ReceiveTask_AwaitCourierPickup"),
        kind: SemanticOperationKind.AwaitMessage,
        input: "place:SequenceFlow_RequestedToPickup",
        output: "place:SequenceFlow_PickupToHandedOver",
        message: { elementId: "ReceiveTask_AwaitCourierPickup", channel },
      },
      {
        ...operationBase("StartEvent_HandoverRequested"),
        kind: SemanticOperationKind.Initiate,
        output: "place:SequenceFlow_RequestedToPickup",
      },
    ],
  });
}

const program = parcelHandover(unspecified);
const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "request-handover",
  processId: program.processId,
  instanceId: "Handover_1",
  initialVariables: [],
});
const subscriptionId = Object.freeze({
  processInstanceId: start.instanceId,
  elementId: "ReceiveTask_AwaitCourierPickup",
  activation: 1,
});
const pickup = Object.freeze({
  kind: StimulusKind.DeliverMessage,
  commandId: "courier-scanned",
  subscriptionId,
  channel: unspecified,
}) satisfies DeliverMessageStimulus;

test("ARECV-WAIT-01 and ARECV-RESUME-01: one unspecified wait, resumed once by its occurrence", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  const waitingStep = advanceScenario(program, initialState, start);
  const observed = stateObservationAt(waitingStep.observations, 1);
  assert.equal(observed.kind, CanonicalObservationKind.State);
  assert.deepEqual(observed.activeWaits, [{ elementId: subscriptionId.elementId, kind: WaitKind.Message, multiplicity: 1 }]);
  assert.deepEqual(observed.openMessageSubscriptions, [{ id: subscriptionId, channel: unspecified }]);
  assert.deepEqual(observed.enabledInteractions, [{ kind: StimulusKind.DeliverMessage, subscriptionId, channel: unspecified }]);

  const waiting = applyStimulus(program, initialState, start);
  assert.deepEqual(waiting.state.messageWaits, [{
    id: subscriptionId,
    owner: rootScopeOccurrence(program.processId, start.instanceId),
    channel: unspecified,
    output: "place:SequenceFlow_PickupToHandedOver",
  }]);
  const completed = applyStimulus(program, waiting.state, pickup);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.messageWaits, []);
  assert.deepEqual(completed.state.control, { kind: ControlStateKind.Completed, instanceId: start.instanceId });
  assert.equal(stateObservationAt(advanceScenario(program, waiting.state, pickup).observations, 1).status, ProcessStatus.Completed);
});

test("ARECV-REFUSE-01: named, wrong, early and stale deliveries leave the state unchanged", () => {
  const early = applyStimulus(program, initialState, pickup);
  assert.equal(early.outcome, CommandOutcome.Rejected);
  assert.deepEqual(early.state, initialState);

  const waiting = applyStimulus(program, initialState, start).state;
  const refused: ReadonlyArray<DeliverMessageStimulus> = [
    { ...pickup, commandId: "named-direct", channel: direct },
    { ...pickup, commandId: "named-operation", channel: operation },
    { ...pickup, commandId: "other-activation", subscriptionId: { ...subscriptionId, activation: 2 } },
    { ...pickup, commandId: "other-instance", subscriptionId: { ...subscriptionId, processInstanceId: "Handover_2" } },
    { ...pickup, commandId: "other-element", subscriptionId: { ...subscriptionId, elementId: "EndEvent_ParcelHandedOver" } },
  ];
  for (const stimulus of refused) {
    const result = applyStimulus(program, waiting, stimulus);
    assert.equal(result.outcome, CommandOutcome.Rejected, stimulus.commandId);
    assert.deepEqual(result.state, waiting, stimulus.commandId);
  }

  const completed = applyStimulus(program, waiting, pickup).state;
  const stale = applyStimulus(program, completed, { ...pickup, commandId: "stale" });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed);
});

// Locks the project restriction of CIB-INT-0004: CIB's legacy signal would complete a Message-addressed
// Receive Task, but an unspecified delivery addresses only an addressless wait.
test("a direct Receive Task wait refuses an unspecified delivery", () => {
  const directProgram = parcelHandover(direct, "cibseven-2.2.0-message-addressed-receive-task-draft");
  const waiting = applyStimulus(directProgram, initialState, start).state;
  const result = applyStimulus(directProgram, waiting, pickup);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, waiting);
});

test("the unspecified arm is field-free and equals only itself", () => {
  assert.equal(isMessageChannel(unspecified), true);
  assert.equal(isMessageChannel({ kind: MessageChannelKind.UnspecifiedMessage, messageId: "Message_CourierPickup" }), false);
  assert.equal(sameMessageChannel(unspecified, { kind: MessageChannelKind.UnspecifiedMessage }), true);
  assert.equal(sameMessageChannel(unspecified, direct), false);
  assert.equal(sameMessageChannel(direct, unspecified), false);
  assert.equal(sameMessageChannel(operation, unspecified), false);
});

test("ARECV-ADDRESS-02: the unspecified arm is refused outside the Receive Task positions", () => {
  assert.equal(isWellFormedStimulus({
    kind: StimulusKind.TriggerMessageStart,
    commandId: "message-start",
    processId: program.processId,
    instanceId: "Handover_1",
    startEventId: "StartEvent_HandoverRequested",
    channel: unspecified,
  }), false);
  assert.equal(isCorrelatedMessageAddress({
    definition: program.identity,
    processId: program.processId,
    channel: unspecified,
    correlationKeyId: "CorrelationKey_Parcel",
  }), false);
  assert.equal(isCorrelatedMessageAddress({
    definition: program.identity,
    processId: program.processId,
    channel: operation,
    correlationKeyId: "CorrelationKey_Parcel",
  }), true, "the operation arm is the address the refusal is measured against");
});

test("ARECV-ADDRESS-02: the unspecified wait belongs to the addressless profile alone", () => {
  const admitted = (candidate: ReturnType<typeof parcelHandover>) => supportsSemanticProcessExecution(start, candidate);
  assert.equal(admitted(parcelHandover(unspecified, "cibseven-2.2.0-message-addressed-receive-task-draft")), false);
  assert.equal(admitted(parcelHandover(unspecified, "bpmn-2.0.2-repeatable-event-subscriptions-draft")), false);
  assert.equal(admitted(parcelHandover(direct)), false);
  assert.equal(admitted(parcelHandover(direct, "cibseven-2.2.0-message-addressed-receive-task-draft")), true);
});
