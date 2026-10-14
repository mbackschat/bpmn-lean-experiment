/**
 * The exact source reader for one payload-bearing Intermediate Catch Message Event.
 *
 * BPMN 2.0.2 Clause 10.5.1 makes the Event's DataOutput and its DataOutputAssociation two
 * distinct roles: the trigger fills the output and the association chooses the Process binding.
 * This reader therefore resolves every semantic edge against the parser's object graph. Neither an
 * identifier spelling nor the presentation-only DataOutput name participates in resolution.
 *
 * The closed payload-catch profile pins every identifier and presentation name of its reviewed settlement source. The
 * structured Message-payload profile admits the same structure under any spelling, because business names must not
 * enter admission (PBV-MSG-01); both read the structure through the single reader below.
 *
 * The profile requires optional typing and requiredness attributes physically absent. This matters
 * for `isCollection="false"`: bpmn-moddle exposes the same false value from the prototype when the
 * attribute is omitted, so value comparison alone would erase a source distinction the profile
 * explicitly closes.
 */
import {
  CheckedNodeKind,
  CheckedProcessKind,
  MessageChannelKind,
  SemanticProfileId,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  SourceOverlayIdentity,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  locateContainedElements,
  orderedElementDiagnostics,
} from "./admission-diagnostics.js";
import {
  projectCheckedNodes,
  projectCheckedSequenceFlows,
} from "./checked-element-projection.js";
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  foreignAttributeRejections,
} from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import type {
  ExactContainmentCardinality,
} from "./singleton-containment-admission.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const selectedTypes = Object.freeze({
  itemDefinition: "bpmn:ItemDefinition",
  property: "bpmn:Property",
  dataOutput: "bpmn:DataOutput",
  outputSet: "bpmn:OutputSet",
  dataOutputAssociation: "bpmn:DataOutputAssociation",
});

type PayloadSourceIds = Readonly<{
  definitions: string; targetNamespace: string; itemDefinition: string; message: string; messageName: string;
  interface: string; interfaceName: string; operation: string; operationName: string; process: string;
  property: string; start: string; startFlow: string; catchEvent: string; dataOutput: string; dataOutputName: string;
  association: string; outputSet: string; eventDefinition: string; catchFlow: string; task: string; taskName: string;
  taskFlow: string; end: string;
}>;

/** The closed payload-catch profile's reviewed settlement spellings. */
const settlementIds: PayloadSourceIds = Object.freeze({
  definitions: "Definitions_MessagePayloadSettlement",
  targetNamespace:
    "https://bpmn-lean.org/scenarios/message-payload-settlement",
  itemDefinition: "ItemDefinition_SettlementReference",
  message: "Message_SettlementConfirmed",
  messageName: "Settlement confirmed",
  interface: "Interface_ClearingHouse",
  interfaceName: "Clearing house",
  operation: "Operation_ConfirmSettlement",
  operationName: "Confirm settlement",
  process: "Process_MessagePayloadSettlement",
  property: "Property_SettlementReference",
  start: "StartEvent_PaymentInstructed",
  startFlow: "Flow_Instructed_Confirm",
  catchEvent: "MessageCatch_SettlementConfirmed",
  dataOutput: "DataOutput_ConfirmedReference",
  dataOutputName: "Confirmed settlement reference",
  association: "DataOutputAssociation_SettlementReference",
  outputSet: "OutputSet_SettlementConfirmed",
  eventDefinition: "MessageEventDefinition_SettlementConfirmed",
  catchFlow: "Flow_Confirm_Review",
  task: "UserTask_ReviewSettlement",
  taskName: "Review settlement",
  taskFlow: "Flow_Review_Recorded",
  end: "EndEvent_SettlementRecorded",
});

const exactContainmentCardinalities: ReadonlyArray<ExactContainmentCardinality> =
  Object.freeze([
    exactCardinality(
      "Definitions.rootElements[ItemDefinition]",
      selectedTypes.itemDefinition,
      "itemDefinition",
      1,
    ),
    exactCardinality(
      "Definitions.rootElements[Message]",
      bpmnTypes.messageType,
      "message",
      1,
    ),
    exactCardinality(
      "Definitions.rootElements[Interface]",
      bpmnTypes.interfaceType,
      "interface",
      1,
    ),
    exactCardinality(
      "Interface.operations",
      bpmnTypes.operationType,
      "operation",
      1,
    ),
    exactCardinality(
      "Definitions.rootElements[Process]",
      bpmnTypes.processType,
      "process",
      1,
    ),
    exactCardinality(
      "Process.properties",
      selectedTypes.property,
      "property",
      1,
    ),
    exactCardinality(
      "CatchEvent.dataOutputs",
      selectedTypes.dataOutput,
      "dataOutput",
      1,
    ),
    exactCardinality(
      "CatchEvent.dataOutputAssociations",
      selectedTypes.dataOutputAssociation,
      "dataOutputAssociation",
      1,
    ),
    exactCardinality(
      "CatchEvent.outputSet",
      selectedTypes.outputSet,
      "outputSet",
      1,
    ),
    exactCardinality(
      "CatchEvent.eventDefinitions[MessageEventDefinition]",
      bpmnTypes.messageEventDefinitionType,
      "messageEventDefinition",
      1,
    ),
  ]);

type ExactSource = Readonly<{
  ids: PayloadSourceIds;
  definitions: ElementRecord;
  process: ElementRecord;
  message: ElementRecord;
  interface: ElementRecord;
  operation: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  payloadNode: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.PayloadMessageCatchEvent }
  >;
}>;

/** Raw/imported cardinality locks for the exact catch-Event data interface. */
export function messagePayloadCatchContainmentCardinalities(
  semanticProfile: string,
): ReadonlyArray<ExactContainmentCardinality> {
  return isPayloadCatchProfile(semanticProfile)
    ? exactContainmentCardinalities
    : [];
}

export type PayloadCatchProfile =
  | typeof SemanticProfileId.MessagePayloadCatch
  | typeof SemanticProfileId.PortableBusinessMessagePayload;

function isPayloadCatchProfile(semanticProfile: string): semanticProfile is PayloadCatchProfile {
  return semanticProfile === SemanticProfileId.MessagePayloadCatch ||
    semanticProfile === SemanticProfileId.PortableBusinessMessagePayload;
}

function admitsIdentifiers(semanticProfile: PayloadCatchProfile, ids: PayloadSourceIds): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.MessagePayloadCatch:
      return (Object.keys(settlementIds) as Array<keyof PayloadSourceIds>).every((key) => ids[key] === settlementIds[key]);
    case SemanticProfileId.PortableBusinessMessagePayload:
      return true;
    default:
      return assertNever(semanticProfile);
  }
}

export function compileMessagePayloadCatchCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
  semanticProfile: PayloadCatchProfile,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined || !admitsIdentifiers(semanticProfile, exact.ids)) {
    return unsupported(
      "Message payload catch source must match the reviewed ItemDefinition, Message operation, direct Event DataOutput, required OutputSet, and Process Property association exactly.",
    );
  }
  const foreignAttributes = foreignAttributeRejections(
    exact.definitions,
    locateContainedElements(exact.definitions),
    new Set(),
  );
  if (foreignAttributes.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(foreignAttributes),
    };
  }
  const sequenceFlows = projectCheckedSequenceFlows(
    exact.sequenceFlows,
    exact.definitions.expressionLanguage,
    undefined,
  );
  const ordinaryNodes = sequenceFlows === undefined
    ? undefined
    : projectCheckedNodes(
        exact.ordinaryNodes,
        sequenceFlows,
        exact.definitions,
        {
          process: exact.process,
          messageArtifacts: [{
            message: exact.message,
            interface: exact.interface,
            operation: exact.operation,
            channel: exact.payloadNode.channel,
          }],
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        semanticProfile,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.payloadNode].sort(compareIds);
  const { ids } = exact;
  const scopeId = definitionScopeId(ids.process);
  const definitionScopes = [{
    id: scopeId,
    parentScopeId: null,
    originElementId: ids.process,
  }];
  const nodeScopes = nodes.map(({ id }) => ({ nodeId: id, scopeId }));
  const flows = [...sequenceFlows].sort(compareIds);
  const sequenceFlowScopes = flows.map(({ id }) => ({
    sequenceFlowId: id,
    scopeId,
  }));
  if (
    !isAdmittedCheckedProcess(
      {
        processId: ids.process,
        definitionScopes,
        nodeScopes,
        sequenceFlowScopes,
        nodes,
        flows,
      },
      exact.definitions.expressionLanguage,
      semanticProfile,
    )
  ) {
    return unsupported(
      "The Message payload catch control route must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
        sourceOverlay,
      },
      processId: ids.process,
      definitionScopes,
      nodeScopes,
      sequenceFlowScopes,
      nodes,
      sequenceFlows: flows,
    },
    diagnostics: [],
  };
}

function readExactSource(rootElement: unknown): ExactSource | undefined {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "rootElements",
    ]) ||
    readId(definitions) === undefined ||
    typeof definitions.targetNamespace !== "string"
  ) {
    return undefined;
  }
  const roots = asElementArray(definitions.rootElements);
  const itemDefinition = roots?.[0];
  const message = roots?.[1];
  const interface_ = roots?.[2];
  const process = roots?.[3];
  if (
    roots?.length !== 4 ||
    itemDefinition === undefined ||
    message === undefined ||
    interface_ === undefined ||
    process === undefined ||
    !isExactItemDefinition(itemDefinition) ||
    !isExactMessage(message, itemDefinition) ||
    !isExactProcess(process)
  ) {
    return undefined;
  }
  const operation = readExactOperation(interface_, message);
  const properties = asElementArray(process.properties);
  const property = properties?.[0];
  const elements = asElementArray(process.flowElements);
  if (
    operation === undefined ||
    properties?.length !== 1 ||
    property === undefined ||
    !isExactProperty(property) ||
    elements?.length !== 7
  ) {
    return undefined;
  }
  const [start, startFlow, catchEvent, catchFlow, task, taskFlow, end] = elements;
  if (
    start === undefined ||
    startFlow === undefined ||
    catchEvent === undefined ||
    catchFlow === undefined ||
    task === undefined ||
    taskFlow === undefined ||
    end === undefined ||
    !isExactPlainNode(start, bpmnTypes.startEventType, false) ||
    !isExactPlainNode(task, bpmnTypes.userTaskType, true) ||
    !isExactPlainNode(end, bpmnTypes.endEventType, false) ||
    !isExactFlow(startFlow, start, catchEvent) ||
    !isExactFlow(catchFlow, catchEvent, task) ||
    !isExactFlow(taskFlow, task, end) ||
    !hasExactNodeReferences(start, [], [startFlow]) ||
    !hasExactNodeReferences(catchEvent, [startFlow], [catchFlow]) ||
    !hasExactNodeReferences(task, [catchFlow], [taskFlow]) ||
    !hasExactNodeReferences(end, [taskFlow], [])
  ) {
    return undefined;
  }
  const payload = readPayloadCatchInterface(
    catchEvent,
    property,
    itemDefinition,
    message,
    operation,
  );
  if (payload === undefined) {
    return undefined;
  }
  const ids = {
    definitions: definitions.id,
    targetNamespace: definitions.targetNamespace,
    itemDefinition: itemDefinition.id,
    message: message.id,
    messageName: message.name,
    interface: interface_.id,
    interfaceName: interface_.name,
    operation: operation.id,
    operationName: operation.name,
    process: process.id,
    property: property.id,
    start: start.id,
    startFlow: startFlow.id,
    catchEvent: catchEvent.id,
    dataOutput: payload.dataOutput.id,
    dataOutputName: payload.dataOutput.name,
    association: payload.association.id,
    outputSet: payload.outputSet.id,
    eventDefinition: payload.eventDefinition.id,
    catchFlow: catchFlow.id,
    task: task.id,
    taskName: task.name,
    taskFlow: taskFlow.id,
    end: end.id,
  };
  return !hasOnlyNonEmptyStrings(ids) ? undefined : {
    ids,
    definitions,
    process,
    message,
    interface: interface_,
    operation,
    ordinaryNodes: [start, task, end],
    sequenceFlows: [startFlow, catchFlow, taskFlow],
    payloadNode: payloadMessageCatchEvent(ids),
  };
}

function hasOnlyNonEmptyStrings<K extends string>(
  value: Readonly<Record<K, unknown>>,
): value is Readonly<Record<K, string>> {
  return Object.values(value).every((entry) => typeof entry === "string" && entry.length > 0);
}

function isExactItemDefinition(value: ElementRecord): boolean {
  return value.$type === selectedTypes.itemDefinition &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    !Object.hasOwn(value, "structureRef") &&
    !Object.hasOwn(value, "itemKind") &&
    !Object.hasOwn(value, "isCollection");
}

function isExactMessage(
  value: ElementRecord,
  itemDefinition: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.messageType &&
    readId(value) !== undefined &&
    typeof value.name === "string" &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.itemRef === itemDefinition;
}

function readExactOperation(
  value: ElementRecord,
  message: ElementRecord,
): ElementRecord | undefined {
  if (
    value.$type !== bpmnTypes.interfaceType ||
    readId(value) === undefined ||
    typeof value.name !== "string" ||
    !hasOnlyModelledKeys(value, ["$type", "id", "name", "operations"])
  ) {
    return undefined;
  }
  const operations = asElementArray(value.operations);
  const operation = operations?.[0];
  return operations?.length === 1 &&
      operation !== undefined &&
      operation.$type === bpmnTypes.operationType &&
      readId(operation) !== undefined &&
      typeof operation.name === "string" &&
      hasOnlyModelledKeys(operation, ["$type", "id", "name"]) &&
      operation.inMessageRef === message &&
      operation.outMessageRef === undefined &&
      operation.errorRefs === undefined &&
      operation.implementationRef === undefined
    ? operation
    : undefined;
}

function isExactProcess(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.processType &&
    readId(value) !== undefined &&
    value.isExecutable === true &&
    hasOnlyModelledKeys(value, [
      "$type",
      "id",
      "isExecutable",
      "properties",
      "flowElements",
    ]);
}

function isExactProperty(value: ElementRecord): boolean {
  return value.$type === selectedTypes.property &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

function isExactPlainNode(
  value: ElementRecord,
  type: string,
  named: boolean,
): boolean {
  return value.$type === type &&
    readId(value) !== undefined &&
    (named ? typeof value.name === "string" : value.name === undefined) &&
    hasOnlyModelledKeys(value, named
      ? ["$type", "id", "name"]
      : ["$type", "id"]);
}

function isExactFlow(
  value: ElementRecord,
  source: ElementRecord,
  target: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.sequenceFlowType &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.sourceRef === source &&
    value.targetRef === target &&
    value.conditionExpression === undefined;
}

function hasExactNodeReferences(
  value: ElementRecord,
  incoming: ReadonlyArray<ElementRecord>,
  outgoing: ReadonlyArray<ElementRecord>,
): boolean {
  return (incoming.length === 0
      ? value.incoming === undefined
      : sameReferences(value.incoming, incoming)) &&
    (outgoing.length === 0
      ? value.outgoing === undefined
      : sameReferences(value.outgoing, outgoing));
}

type PayloadCatchInterface = Readonly<{
  dataOutput: ElementRecord;
  association: ElementRecord;
  outputSet: ElementRecord;
  eventDefinition: ElementRecord;
}>;

function readPayloadCatchInterface(
  event: ElementRecord,
  property: ElementRecord,
  itemDefinition: ElementRecord,
  message: ElementRecord,
  operation: ElementRecord,
): PayloadCatchInterface | undefined {
  if (
    event.$type !== bpmnTypes.intermediateCatchEventType ||
    readId(event) === undefined ||
    !hasOnlyModelledKeys(event, [
      "$type",
      "id",
      "dataOutputs",
      "dataOutputAssociations",
      "outputSet",
      "eventDefinitions",
    ]) ||
    Object.hasOwn(event, "parallelMultiple") ||
    event.eventDefinitionRef !== undefined ||
    event.ioSpecification !== undefined ||
    event.inputSet !== undefined ||
    event.dataInputs !== undefined
  ) {
    return undefined;
  }
  const definitions = asElementArray(event.eventDefinitions);
  const definition = definitions?.[0];
  const outputs = asElementArray(event.dataOutputs);
  const dataOutput = outputs?.[0];
  const outputSet = asElement(event.outputSet);
  const associations = asElementArray(event.dataOutputAssociations);
  if (
    definitions?.length !== 1 ||
    definition === undefined ||
    !isExactEventDefinition(definition, message, operation) ||
    outputs?.length !== 1 ||
    dataOutput === undefined ||
    !isExactDataOutput(dataOutput, itemDefinition) ||
    outputSet === undefined ||
    !isExactOutputSet(outputSet, dataOutput) ||
    !hasExactAssociation(associations, dataOutput, property)
  ) {
    return undefined;
  }
  const association = associations?.[0];
  return association === undefined
    ? undefined
    : { dataOutput, association, outputSet, eventDefinition: definition };
}

function payloadMessageCatchEvent(ids: PayloadSourceIds): ExactSource["payloadNode"] {
  return {
    kind: CheckedNodeKind.PayloadMessageCatchEvent,
    id: ids.catchEvent,
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: ids.interface,
      interfaceOperationId: ids.operation,
      messageId: ids.message,
    },
    directOutput: {
      associationId: ids.association,
      sourceDataOutputId: ids.dataOutput,
      sourceDataOutputName: ids.dataOutputName,
      targetPropertyId: ids.property,
    },
  };
}

function isExactEventDefinition(
  value: ElementRecord,
  message: ElementRecord,
  operation: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.messageEventDefinitionType &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.messageRef === message &&
    value.operationRef === operation &&
    value.eventDefinitionRef === undefined;
}

function isExactDataOutput(
  value: ElementRecord,
  itemDefinition: ElementRecord,
): boolean {
  return value.$type === selectedTypes.dataOutput &&
    readId(value) !== undefined &&
    typeof value.name === "string" &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    !Object.hasOwn(value, "isCollection") &&
    value.itemSubjectRef === itemDefinition &&
    value.dataState === undefined;
}

function isExactOutputSet(
  value: ElementRecord,
  dataOutput: ElementRecord,
): boolean {
  return value.$type === selectedTypes.outputSet &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    sameReferences(value.dataOutputRefs, [dataOutput]) &&
    value.optionalOutputRefs === undefined &&
    value.whileExecutingOutputRefs === undefined &&
    value.inputSetRefs === undefined;
}

function hasExactAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  dataOutput: ElementRecord,
  property: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 &&
    association !== undefined &&
    association.$type === selectedTypes.dataOutputAssociation &&
    readId(association) !== undefined &&
    hasOnlyModelledKeys(association, ["$type", "id"]) &&
    sameReferences(association.sourceRef, [dataOutput]) &&
    association.targetRef === property &&
    association.transformation === undefined &&
    association.assignment === undefined;
}

function sameReferences(
  value: unknown,
  expected: ReadonlyArray<ElementRecord>,
): boolean {
  const actual = asElementArray(value);
  return actual?.length === expected.length &&
    actual.every((entry, index) => entry === expected[index]);
}

function exactCardinality(
  property: string,
  projectedType: string,
  xmlLocalName: string,
  expectedOccurrences: number,
): ExactContainmentCardinality {
  return { property, projectedType, xmlLocalName, expectedOccurrences };
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported payload-catch profile: ${String(value)}`);
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}
