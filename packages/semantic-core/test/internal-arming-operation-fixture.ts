import { CorrelationScalarPathLanguage, MessageChannelKind, SemanticOperationKind as Kind } from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import { operationBase } from "./semantic-program-parts.ts";

export const internalArmingKinds = [Kind.AwaitUserTask, Kind.AwaitTimer, Kind.AwaitDataInputOutputUserTask,
  Kind.AwaitMessage, Kind.AwaitPayloadMessage, Kind.AwaitCorrelatedPayloadMessage, Kind.AwaitEffect] as const;
export type InternalArmingKind = typeof internalArmingKinds[number];

export function internalArmingOperation(kind: InternalArmingKind, input: string, output: string):
    Extract<SemanticOperation, { kind: InternalArmingKind }> {
  const ordinary = { ...operationBase("Side_Task"), kind: Kind.AwaitUserTask, input, output,
    task: { elementId: "Side_Task", name: "Side_Task" } } as const;
  const message = { elementId: "Side_Message", channel: { kind: MessageChannelKind.OperationMessage,
    interfaceId: "Side_Interface", interfaceOperationId: "Side_Operation", messageId: "Side_Definition" } } as const;
  const messageBase = { ...operationBase(message.elementId), input, output, message };
  switch (kind) {
    case Kind.AwaitUserTask:
      return ordinary;
    case Kind.AwaitTimer:
      return { ...operationBase("Side_Timer"), kind, input, output,
        timer: { elementId: "Side_Timer", durationMs: 1000 } };
    case Kind.AwaitDataInputOutputUserTask:
      return { ...ordinary, kind,
        directInput: { associationId: "Input_Association", sourcePropertyId: "details", targetDataInputId: "Input", targetDataInputName: "Details" },
        directOutput: { associationId: "Output_Association", sourceDataOutputId: "Output", sourceDataOutputName: "Decision", targetPropertyId: "decision" } };
    case Kind.AwaitMessage:
      return { ...messageBase, kind };
    case Kind.AwaitPayloadMessage:
      return { ...messageBase, kind, directOutput: { associationId: "Message_Output_Association", sourceDataOutputId: "Message_Output",
        sourceDataOutputName: "Response", targetPropertyId: "response" } };
    case Kind.AwaitCorrelatedPayloadMessage:
      return { ...messageBase, kind, correlationKeyId: "Side_Key", correlationPropertyId: "Side_Property",
        payloadSelector: { language: CorrelationScalarPathLanguage, body: "payload" },
        processPropertySelector: { language: CorrelationScalarPathLanguage, body: "property:details", propertyId: "details" } };
    case Kind.AwaitEffect:
      return { ...operationBase("Side_Effect"), kind, input, output, bpmnErrorRoute: null,
        effect: { elementId: "Side_Effect", inputMappings: [], outputMappings: [],
          descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:probe-v1" } } };
  }
}
