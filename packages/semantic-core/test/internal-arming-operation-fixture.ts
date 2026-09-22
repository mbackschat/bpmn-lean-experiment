import { CorrelationScalarPathLanguage, MessageChannelKind, SemanticOperationKind as Kind,
  SemanticOriginKind, compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

export const internalArmingKinds = [Kind.AwaitUserTask, Kind.AwaitTimer, Kind.AwaitDataInputOutputUserTask,
  Kind.AwaitMessage, Kind.AwaitPayloadMessage, Kind.AwaitCorrelatedPayloadMessage, Kind.AwaitEffect,
  Kind.AwaitBoundedUserTask, Kind.AwaitMonitoredUserTask] as const;
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
    case Kind.AwaitBoundedUserTask:
    case Kind.AwaitMonitoredUserTask:
      return { ...operationBase("Side_Task"), kind, input, task: { ...ordinary.task, output },
        boundaryTimer: { elementId: "Side_Deadline", durationMs: 1000, output: "place:Side_Deadline_Flow",
          origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Side_Deadline_Flow" } } };
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

export function withInternalArmingBoundaryRoute(program: SemanticProcessProgram,
    operation: SemanticOperation): SemanticProcessProgram {
  if (operation.kind !== Kind.AwaitBoundedUserTask && operation.kind !== Kind.AwaitMonitoredUserTask) return program;
  const scope = program.operationScopes.find(({ operationId }) => operationId === operation.id);
  if (scope === undefined) throw new Error("Timer-task fixture must have an operation scope");
  const boundaryPlace = controlPlace(operation.boundaryTimer.origin.elementId);
  const boundaryEnd = { ...operationBase("Side_Deadline_End"), kind: Kind.ReachNoneEnd,
    input: boundaryPlace.id } as const;
  return { ...program,
    controlPlaces: [...program.controlPlaces, boundaryPlace].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...program.controlPlaceScopes, { controlPlaceId: boundaryPlace.id, scopeId: scope.scopeId }]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    operations: [...program.operations, boundaryEnd].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...program.operationScopes, { operationId: boundaryEnd.id, scopeId: scope.scopeId }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
  };
}
