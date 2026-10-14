/**
 * Neutral fixtures for the structured Message-payload profile: the shipment-manifest intake source, rendered from one
 * identifier table so a renamed variant differs only in identifier and name spelling, and the manifest value whose
 * shape defeats deduplication, reordering, rounding, flattening and null-dropping implementations.
 */
import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { MessageChannelKind, SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { BusinessValue, DeliverPayloadMessageStimulus, StartProcessStimulus, VariableValue } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

export const messagePayloadProfile = SemanticProfileId.PortableBusinessMessagePayload;

export type PayloadSourceIds = Readonly<{
  definitions: string; targetNamespace: string; itemDefinition: string; message: string; messageName: string;
  interface: string; interfaceName: string; operation: string; operationName: string; process: string;
  property: string; start: string; startFlow: string; catchEvent: string; dataOutput: string; dataOutputName: string;
  association: string; outputSet: string; eventDefinition: string; catchFlow: string; task: string; taskName: string;
  taskFlow: string; end: string;
}>;

export const shipmentIds: PayloadSourceIds = {
  definitions: "Definitions_ShipmentManifestIntake",
  targetNamespace: "https://bpmn-lean.org/scenarios/shipment-manifest-intake",
  itemDefinition: "ItemDefinition_ShipmentManifest",
  message: "Message_ManifestReceived", messageName: "Manifest received",
  interface: "Interface_Carrier", interfaceName: "Carrier",
  operation: "Operation_SubmitManifest", operationName: "Submit manifest",
  process: "Process_ShipmentManifestIntake",
  property: "Property_ShipmentManifest",
  start: "StartEvent_ShipmentBooked", startFlow: "Flow_Booked_Manifest",
  catchEvent: "MessageCatch_ManifestReceived",
  dataOutput: "DataOutput_Manifest", dataOutputName: "Received manifest",
  association: "DataOutputAssociation_Manifest", outputSet: "OutputSet_ManifestReceived",
  eventDefinition: "MessageEventDefinition_ManifestReceived", catchFlow: "Flow_Manifest_Review",
  task: "UserTask_ReviewManifest", taskName: "Review manifest",
  taskFlow: "Flow_Review_Accepted", end: "EndEvent_ManifestAccepted",
};

/** Every identifier and name respelled; the structure is unchanged, so admission must not depend on spelling. */
export const renamedIds: PayloadSourceIds = {
  definitions: "D7", targetNamespace: "urn:renamed", itemDefinition: "I3", message: "M5", messageName: "m",
  interface: "If2", interfaceName: "i", operation: "Op4", operationName: "o", process: "P9", property: "V1",
  start: "S", startFlow: "F2", catchEvent: "C8", dataOutput: "Out6", dataOutputName: "d", association: "A4",
  outputSet: "OS1", eventDefinition: "ED3", catchFlow: "F1", task: "T5", taskName: "t", taskFlow: "F0", end: "E",
};

/** The reviewed payload-catch source shape, with every identifier and presentation name taken from `ids`. */
export function payloadSourceXml(ids: PayloadSourceIds): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="${ids.definitions}" targetNamespace="${ids.targetNamespace}">
  <bpmn:itemDefinition id="${ids.itemDefinition}" />
  <bpmn:message id="${ids.message}" name="${ids.messageName}" itemRef="${ids.itemDefinition}" />
  <bpmn:interface id="${ids.interface}" name="${ids.interfaceName}">
    <bpmn:operation id="${ids.operation}" name="${ids.operationName}"><bpmn:inMessageRef>${ids.message}</bpmn:inMessageRef></bpmn:operation>
  </bpmn:interface>
  <bpmn:process id="${ids.process}" isExecutable="true">
    <bpmn:property id="${ids.property}" />
    <bpmn:startEvent id="${ids.start}"><bpmn:outgoing>${ids.startFlow}</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="${ids.startFlow}" sourceRef="${ids.start}" targetRef="${ids.catchEvent}" />
    <bpmn:intermediateCatchEvent id="${ids.catchEvent}">
      <bpmn:incoming>${ids.startFlow}</bpmn:incoming>
      <bpmn:outgoing>${ids.catchFlow}</bpmn:outgoing>
      <bpmn:dataOutput id="${ids.dataOutput}" name="${ids.dataOutputName}" itemSubjectRef="${ids.itemDefinition}" />
      <bpmn:dataOutputAssociation id="${ids.association}">
        <bpmn:sourceRef>${ids.dataOutput}</bpmn:sourceRef>
        <bpmn:targetRef>${ids.property}</bpmn:targetRef>
      </bpmn:dataOutputAssociation>
      <bpmn:outputSet id="${ids.outputSet}"><bpmn:dataOutputRefs>${ids.dataOutput}</bpmn:dataOutputRefs></bpmn:outputSet>
      <bpmn:messageEventDefinition id="${ids.eventDefinition}" messageRef="${ids.message}" operationRef="${ids.operation}" />
    </bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="${ids.catchFlow}" sourceRef="${ids.catchEvent}" targetRef="${ids.task}" />
    <bpmn:userTask id="${ids.task}" name="${ids.taskName}">
      <bpmn:incoming>${ids.catchFlow}</bpmn:incoming>
      <bpmn:outgoing>${ids.taskFlow}</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="${ids.taskFlow}" sourceRef="${ids.task}" targetRef="${ids.end}" />
    <bpmn:endEvent id="${ids.end}"><bpmn:incoming>${ids.taskFlow}</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
`;
}

export async function compilePayloadSource(
  ids: PayloadSourceIds = shipmentIds,
  semanticProfile: string = messagePayloadProfile,
): Promise<Awaited<ReturnType<typeof compileBpmnToSemanticProcess>>> {
  return await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(payloadSourceXml(ids)),
    sourceId: "shipment-manifest-intake",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

export const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
export const truth = (value: boolean): BusinessValue => ({ kind: VariableValueKind.Boolean, value });
export const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
export const decimal = (coefficient: string, scale: number): BusinessValue =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale });
export const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
export const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });

const parcel = (reference: string, kilograms: number): BusinessValue =>
  map(["reference", text(reference)], ["weightKg", integer(kilograms)]);

/** Two equal parcels then a different one, a negative scale-two Decimal, a nested Map with present Null, a Boolean. */
export function manifest(): BusinessValue {
  return map(
    ["consignee", map(["line1", text("Harbour Road 4")], ["line2", { kind: VariableValueKind.Null }])],
    ["declaredValue", decimal("-123455", 2)],
    ["hazardous", truth(false)],
    ["parcels", list(parcel("P-1", 12), parcel("P-1", 12), parcel("P-2", 3))],
  );
}

export function startFor(ids: PayloadSourceIds, instanceId: string): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId: `start-${instanceId}`, processId: ids.process, instanceId, initialVariables: [] };
}

export function deliveryFor(
  ids: PayloadSourceIds,
  instanceId: string,
  payload: VariableValue,
  commandId = `deliver-${instanceId}`,
): DeliverPayloadMessageStimulus {
  return {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId,
    subscriptionId: { processInstanceId: instanceId, elementId: ids.catchEvent, activation: 1 },
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: ids.interface,
      interfaceOperationId: ids.operation,
      messageId: ids.message,
    },
    payload,
  };
}
