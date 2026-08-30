import assert from "node:assert/strict";
import test from "node:test";

import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  assessTemporalHostCapability,
  buildWorkflowChainRecoveryRequest,
  canonicalStimulusEncoding,
  requireExecutionPublicationPage,
  requireExecutionPublicationTransportResult,
} from "../dist/index.js";
import {
  definition,
  program as baseProgram,
  publicationPage,
  rootScope,
} from "./semantic-publication-fixture.ts";
import {
  programOccurrenceStartMatchesTransition,
} from "../dist/flow-node-occurrence-publication-program-validation.js";

const processInstanceId = "Instance_1";
const subscriptionId = {
  processInstanceId,
  elementId: "Catch_Message_1",
  activation: 1,
} as const;
const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_1",
  interfaceOperationId: "InterfaceOperation_1",
  messageId: "Message_1",
} as const;

function payloadDelivery(payload: { kind: VariableValueKind; value?: unknown }) {
  return {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "Deliver_Message_1",
    subscriptionId,
    channel,
    payload,
  } as const;
}

test("content-binds the exact tagged payload in command and recovery identity", () => {
  const text = payloadDelivery({
    kind: VariableValueKind.String,
    value: "settlement-123",
  });
  const explicitNull = payloadDelivery({ kind: VariableValueKind.Null });

  assert.equal(
    canonicalStimulusEncoding(text),
    '["deliverPayloadMessage","Deliver_Message_1",["Instance_1","Catch_Message_1",1],["operationMessage","Interface_1","InterfaceOperation_1","Message_1"],["string","settlement-123"]]',
  );
  assert.notEqual(
    canonicalStimulusEncoding(text),
    canonicalStimulusEncoding(explicitNull),
  );
  assert.notEqual(
    buildWorkflowChainRecoveryRequest(processInstanceId, text).stimulusSha256,
    buildWorkflowChainRecoveryRequest(processInstanceId, explicitNull).stimulusSha256,
  );
  assert.throws(
    () => buildWorkflowChainRecoveryRequest("Instance_Other", text),
    /mismatched Process-instance ID/u,
  );
});

test("binds each Message subscription interaction to its declaring Program arm", () => {
  const payloadProgram = messageProgram(SemanticOperationKind.AwaitPayloadMessage);
  const payloadPage = waitingPublication(StimulusKind.DeliverPayloadMessage);
  assert.deepEqual(
    requireExecutionPublicationPage(
      payloadPage,
      { program: payloadProgram, processInstanceId, limit: 1 },
    ),
    payloadPage,
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      waitingPublication(StimulusKind.DeliverMessage),
      { program: payloadProgram, processInstanceId, limit: 1 },
    ),
    /malformed execution publication page/u,
  );

  const legacyProgram = messageProgram(SemanticOperationKind.AwaitMessage);
  assert.deepEqual(
    requireExecutionPublicationPage(
      waitingPublication(StimulusKind.DeliverMessage),
      { program: legacyProgram, processInstanceId, limit: 1 },
    ),
    waitingPublication(StimulusKind.DeliverMessage),
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      payloadPage,
      { program: legacyProgram, processInstanceId, limit: 1 },
    ),
    /malformed execution publication page/u,
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      payloadPage,
      { program: baseProgram, processInstanceId, limit: 1 },
    ),
    /malformed execution publication page/u,
  );

  const transportContext = {
    definition,
    processId: "Process_1",
    processInstanceId,
    afterRevision: 0,
    limit: 1,
  } as const;
  for (const page of [
    waitingPublication(StimulusKind.DeliverMessage),
    payloadPage,
  ]) {
    assert.deepEqual(
      requireExecutionPublicationTransportResult(
        { kind: "available", page },
        transportContext,
      ),
      { kind: "available", page },
    );
  }

  assert.deepEqual(assessTemporalHostCapability(payloadProgram), {
    kind: "admitted",
  });
  const occurrence = {
    processId: "Process_1",
    elementId: subscriptionId.elementId,
    owner: rootScope,
  };
  assert.equal(programOccurrenceStartMatchesTransition(
    occurrence,
    payloadProgram,
    {
      transition: {
        kind: "internalOperation",
        operationId: "Operation_Await_Message_1",
        operationKind: SemanticOperationKind.AwaitPayloadMessage,
        origin: { kind: "bpmnElement", elementId: subscriptionId.elementId },
        owner: rootScope,
      },
    },
  ), true);
  assert.equal(programOccurrenceStartMatchesTransition(
    occurrence,
    payloadProgram,
    {
      transition: {
        kind: "externalStimulus",
        stimulus: payloadDelivery({
          kind: VariableValueKind.String,
          value: "settlement-123",
        }),
      },
    },
  ), false);
});

function messageProgram(
  kind:
    | SemanticOperationKind.AwaitMessage
    | SemanticOperationKind.AwaitPayloadMessage,
) {
  return {
    ...baseProgram,
    operations: [...baseProgram.operations, {
      id: "Operation_Await_Message_1",
      kind,
      origin: { kind: "bpmnElement", elementId: subscriptionId.elementId },
      input: "Place_Flow_1",
      output: "Place_Flow_1",
      message: {
        elementId: subscriptionId.elementId,
        channel,
      },
      ...(kind === SemanticOperationKind.AwaitPayloadMessage
        ? {
            directOutput: {
              associationId: "Association_1",
              sourceDataOutputId: "DataOutput_1",
              sourceDataOutputName: "payload",
              targetPropertyId: "Property_1",
            },
          }
        : {}),
    }],
    operationScopes: [...baseProgram.operationScopes, {
      operationId: "Operation_Await_Message_1",
      scopeId: "Scope_Process_1",
    }],
  } as const;
}

function waitingPublication(
  interactionKind:
    | StimulusKind.DeliverMessage
    | StimulusKind.DeliverPayloadMessage,
) {
  const page = structuredClone(publicationPage());
  page.current.state.activeWaits = [{
    elementId: subscriptionId.elementId,
    kind: "message",
    multiplicity: 1,
  }];
  page.current.state.openMessageSubscriptions = [{
    id: subscriptionId,
    channel,
  }];
  page.current.state.enabledInteractions = [{
    kind: interactionKind,
    subscriptionId,
    channel,
  }];
  return page;
}
