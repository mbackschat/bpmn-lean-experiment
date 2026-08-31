/**
 * Exact source admission for one context-backed, single-property Message correlation key.
 *
 * BPMN 2.0.2 Clause 8.4.2 and Tables 8.31–8.35 make correlation a graph of references rather than
 * a collection of equal identifiers. This reader consequently accepts only the reviewed graph and
 * compares every semantic edge against the object identities resolved by the pinned moddle parser.
 */
import {
  CheckedNodeKind,
  CheckedProcessKind,
  CorrelationScalarPathLanguage,
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
  collaboration: "bpmn:Collaboration",
  participant: "bpmn:Participant",
  messageFlow: "bpmn:MessageFlow",
  conversation: "bpmn:Conversation",
  correlationKey: "bpmn:CorrelationKey",
  correlationProperty: "bpmn:CorrelationProperty",
  retrieval: "bpmn:CorrelationPropertyRetrievalExpression",
  subscription: "bpmn:CorrelationSubscription",
  binding: "bpmn:CorrelationPropertyBinding",
  formalExpression: "bpmn:FormalExpression",
});

const ids = Object.freeze({
  definitions: "Definitions_MessageKeyCorrelation",
  targetNamespace: "https://bpmn-lean.org/scenarios/message-key-correlation",
  itemDefinition: "ItemDefinition_SettlementReference",
  message: "Message_SettlementConfirmed",
  interface: "Interface_ClearingHouse",
  operation: "Operation_ConfirmSettlement",
  correlationProperty: "CorrelationProperty_SettlementReference",
  retrieval: "RetrievalExpression_SettlementReference",
  messagePath: "MessagePath_SettlementReference",
  process: "Process_SettlementCorrelation",
  property: "Property_SettlementReference",
  subscription: "CorrelationSubscription_SettlementReference",
  binding: "CorrelationPropertyBinding_SettlementReference",
  dataPath: "DataPath_SettlementReference",
  start: "StartEvent_PaymentInstructed",
  startFlow: "Flow_Instructed_InitialSettlement",
  initialCatch: "MessageCatch_InitialSettlement",
  initialEventDefinition: "MessageEventDefinition_InitialSettlement",
  dataOutput: "DataOutput_InitialSettlementReference",
  association: "DataOutputAssociation_SettlementReference",
  outputSet: "OutputSet_InitialSettlement",
  initialFlow: "Flow_Initial_Correlated",
  correlatedCatch: "MessageCatch_CorrelatedSettlement",
  correlatedEventDefinition: "MessageEventDefinition_CorrelatedSettlement",
  correlatedFlow: "Flow_Correlated_Review",
  task: "UserTask_ReviewSettlement",
  taskFlow: "Flow_Review_Recorded",
  end: "EndEvent_SettlementRecorded",
  collaboration: "Collaboration_SettlementCorrelation",
  externalParticipant: "Participant_ExternalClearingHouse",
  processParticipant: "Participant_SettlementProcess",
  initialMessageFlow: "MessageFlow_InitialSettlement",
  correlatedMessageFlow: "MessageFlow_CorrelatedSettlement",
  conversation: "Conversation_Settlement",
  correlationKey: "CorrelationKey_SettlementReference",
});

const exactContainmentCardinalities: ReadonlyArray<ExactContainmentCardinality> =
  Object.freeze([
    exactCardinality("Definitions.rootElements[ItemDefinition]", selectedTypes.itemDefinition, "itemDefinition", 1),
    exactCardinality("Definitions.rootElements[Message]", bpmnTypes.messageType, "message", 1),
    exactCardinality("Definitions.rootElements[Interface]", bpmnTypes.interfaceType, "interface", 1),
    exactCardinality("Interface.operations", bpmnTypes.operationType, "operation", 1),
    exactCardinality("Definitions.rootElements[CorrelationProperty]", selectedTypes.correlationProperty, "correlationProperty", 1),
    exactCardinality("CorrelationProperty.retrievalExpressions", selectedTypes.retrieval, "correlationPropertyRetrievalExpression", 1),
    exactCardinality("Definitions.rootElements[Process]", bpmnTypes.processType, "process", 1),
    exactCardinality("Process.properties", selectedTypes.property, "property", 1),
    exactCardinality("CatchEvent.dataOutputs", selectedTypes.dataOutput, "dataOutput", 1),
    exactCardinality("CatchEvent.dataOutputAssociations", selectedTypes.dataOutputAssociation, "dataOutputAssociation", 1),
    exactCardinality("CatchEvent.outputSet", selectedTypes.outputSet, "outputSet", 1),
    exactCardinality("CatchEvent.eventDefinitions[MessageEventDefinition]", bpmnTypes.messageEventDefinitionType, "messageEventDefinition", 2),
    exactCardinality("Process.correlationSubscriptions", selectedTypes.subscription, "correlationSubscription", 1),
    exactCardinality("CorrelationSubscription.bindings", selectedTypes.binding, "correlationPropertyBinding", 1),
    exactCardinality("Definitions.rootElements[Collaboration]", selectedTypes.collaboration, "collaboration", 1),
    exactCardinality("Collaboration.participants", selectedTypes.participant, "participant", 2),
    exactCardinality("Collaboration.messageFlows", selectedTypes.messageFlow, "messageFlow", 2),
    exactCardinality("Collaboration.conversations", selectedTypes.conversation, "conversation", 1),
    exactCardinality("Conversation.correlationKeys", selectedTypes.correlationKey, "correlationKey", 1),
  ]);

type PayloadNode = Extract<
  CheckedNode,
  { kind: CheckedNodeKind.PayloadMessageCatchEvent }
>;
type CorrelatedNode = Extract<
  CheckedNode,
  { kind: CheckedNodeKind.CorrelatedPayloadMessageCatchEvent }
>;

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  message: ElementRecord;
  interface: ElementRecord;
  operation: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  payloadNode: PayloadNode;
  correlatedNode: CorrelatedNode;
}>;

/** Raw/imported cardinality locks for the exact correlation source graph. */
export function messageKeyCorrelationContainmentCardinalities(
  semanticProfile: string,
): ReadonlyArray<ExactContainmentCardinality> {
  return semanticProfile === SemanticProfileId.MessageKeyCorrelation
    ? exactContainmentCardinalities
    : [];
}

export function compileMessageKeyCorrelationCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Message key correlation source must match the reviewed Collaboration, correlation graph, two operation-addressed catches, direct initial output, and context binding exactly.",
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
          messageArtifacts: {
            message: exact.message,
            interface: exact.interface,
            operation: exact.operation,
            channel: exact.payloadNode.channel,
          },
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        SemanticProfileId.MessageKeyCorrelation,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [
    ...ordinaryNodes,
    exact.payloadNode,
    exact.correlatedNode,
  ].sort(compareIds);
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
      SemanticProfileId.MessageKeyCorrelation,
    )
  ) {
    return unsupported(
      "The Message key correlation route must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: SemanticProfileId.MessageKeyCorrelation,
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
    !hasOnlyModelledKeys(definitions, ["$type", "id", "targetNamespace", "rootElements"]) ||
    readId(definitions) !== ids.definitions ||
    definitions.targetNamespace !== ids.targetNamespace
  ) {
    return undefined;
  }
  const roots = asElementArray(definitions.rootElements);
  const [itemDefinition, message, interface_, correlationProperty, process, collaboration] =
    roots ?? [];
  if (
    roots?.length !== 6 ||
    itemDefinition === undefined || message === undefined ||
    interface_ === undefined || correlationProperty === undefined ||
    process === undefined || collaboration === undefined ||
    !isExactItemDefinition(itemDefinition) ||
    !isExactMessage(message, itemDefinition)
  ) {
    return undefined;
  }
  const operation = readExactOperation(interface_, message);
  const property = only(asElementArray(process.properties));
  const elements = asElementArray(process.flowElements);
  if (
    operation === undefined || property === undefined ||
    !isExactProperty(property) || elements?.length !== 9
  ) {
    return undefined;
  }
  const [start, startFlow, initialCatch, initialFlow, correlatedCatch, correlatedFlow, task, taskFlow, end] =
    elements;
  if (
    start === undefined || startFlow === undefined || initialCatch === undefined ||
    initialFlow === undefined || correlatedCatch === undefined || correlatedFlow === undefined ||
    task === undefined || taskFlow === undefined || end === undefined ||
    !isExactPlainNode(start, bpmnTypes.startEventType, ids.start) ||
    !isExactPlainNode(task, bpmnTypes.userTaskType, ids.task) ||
    !isExactPlainNode(end, bpmnTypes.endEventType, ids.end) ||
    !isExactFlow(startFlow, ids.startFlow, start, initialCatch) ||
    !isExactFlow(initialFlow, ids.initialFlow, initialCatch, correlatedCatch) ||
    !isExactFlow(correlatedFlow, ids.correlatedFlow, correlatedCatch, task) ||
    !isExactFlow(taskFlow, ids.taskFlow, task, end) ||
    !hasExactNodeReferences(start, [], [startFlow]) ||
    !hasExactNodeReferences(initialCatch, [startFlow], [initialFlow]) ||
    !hasExactNodeReferences(correlatedCatch, [initialFlow], [correlatedFlow]) ||
    !hasExactNodeReferences(task, [correlatedFlow], [taskFlow]) ||
    !hasExactNodeReferences(end, [taskFlow], [])
  ) {
    return undefined;
  }
  const correlation = readExactCorrelationGraph(
    correlationProperty,
    process,
    collaboration,
    property,
    itemDefinition,
    message,
    initialCatch,
    correlatedCatch,
  );
  if (correlation === undefined) {
    return undefined;
  }
  const payloadNode = projectInitialCatch(
    initialCatch,
    property,
    itemDefinition,
    message,
    operation,
  );
  const correlatedNode = projectCorrelatedCatch(
    correlatedCatch,
    correlation.key,
    correlationProperty,
    property,
    message,
    operation,
  );
  return payloadNode === undefined || correlatedNode === undefined
    ? undefined
    : {
        definitions,
        process,
        message,
        interface: interface_,
        operation,
        ordinaryNodes: [start, task, end],
        sequenceFlows: [startFlow, initialFlow, correlatedFlow, taskFlow],
        payloadNode,
        correlatedNode,
      };
}

function readExactCorrelationGraph(
  correlationProperty: ElementRecord,
  process: ElementRecord,
  collaboration: ElementRecord,
  property: ElementRecord | undefined,
  itemDefinition: ElementRecord,
  message: ElementRecord,
  initialCatch: ElementRecord,
  correlatedCatch: ElementRecord,
): Readonly<{ key: ElementRecord }> | undefined {
  if (
    property === undefined ||
    !isExactCorrelationProperty(correlationProperty, itemDefinition, message) ||
    collaboration.$type !== selectedTypes.collaboration ||
    readId(collaboration) !== ids.collaboration ||
    !hasOnlyModelledKeys(collaboration, ["$type", "id", "participants", "messageFlows", "conversations"]) ||
    process.$type !== bpmnTypes.processType ||
    readId(process) !== ids.process || process.isExecutable !== true ||
    !hasOnlyModelledKeys(process, ["$type", "id", "isExecutable", "properties", "flowElements", "correlationSubscriptions"]) ||
    process.definitionalCollaborationRef !== collaboration
  ) {
    return undefined;
  }
  const participants = asElementArray(collaboration.participants);
  const messageFlows = asElementArray(collaboration.messageFlows);
  const conversation = only(asElementArray(collaboration.conversations));
  const [externalParticipant, processParticipant] = participants ?? [];
  const [initialMessageFlow, correlatedMessageFlow] = messageFlows ?? [];
  if (
    participants?.length !== 2 || messageFlows?.length !== 2 ||
    externalParticipant === undefined || processParticipant === undefined ||
    initialMessageFlow === undefined || correlatedMessageFlow === undefined ||
    conversation === undefined ||
    !isExactParticipant(externalParticipant, ids.externalParticipant, undefined) ||
    !isExactParticipant(processParticipant, ids.processParticipant, process) ||
    !isExactMessageFlow(initialMessageFlow, ids.initialMessageFlow, externalParticipant, initialCatch, message) ||
    !isExactMessageFlow(correlatedMessageFlow, ids.correlatedMessageFlow, externalParticipant, correlatedCatch, message) ||
    conversation.$type !== selectedTypes.conversation ||
    readId(conversation) !== ids.conversation ||
    !hasOnlyModelledKeys(conversation, ["$type", "id", "name", "correlationKeys"]) ||
    !sameReferences(conversation.participantRef, [externalParticipant, processParticipant]) ||
    !sameReferences(conversation.messageFlowRef, [initialMessageFlow, correlatedMessageFlow])
  ) {
    return undefined;
  }
  const key = only(asElementArray(conversation.correlationKeys));
  const subscription = only(asElementArray(process.correlationSubscriptions));
  if (
    key === undefined || subscription === undefined ||
    key.$type !== selectedTypes.correlationKey || readId(key) !== ids.correlationKey ||
    !optionalName(key.name) || !hasOnlyModelledKeys(key, ["$type", "id", "name"]) ||
    !sameReferences(key.correlationPropertyRef, [correlationProperty]) ||
    subscription.$type !== selectedTypes.subscription ||
    readId(subscription) !== ids.subscription ||
    !hasOnlyModelledKeys(subscription, ["$type", "id", "correlationPropertyBinding"]) ||
    subscription.correlationKeyRef !== key
  ) {
    return undefined;
  }
  const binding = only(asElementArray(subscription.correlationPropertyBinding));
  const dataPath = binding === undefined ? undefined : asElement(binding.dataPath);
  return binding !== undefined && dataPath !== undefined &&
      binding.$type === selectedTypes.binding && readId(binding) === ids.binding &&
      hasOnlyModelledKeys(binding, ["$type", "id", "dataPath"]) &&
      binding.correlationPropertyRef === correlationProperty &&
      isExactFormalExpression(
        dataPath,
        ids.dataPath,
        `property:${ids.property}`,
      )
    ? { key }
    : undefined;
}

function isExactCorrelationProperty(
  value: ElementRecord,
  itemDefinition: ElementRecord,
  message: ElementRecord,
): boolean {
  const retrieval = only(asElementArray(value.correlationPropertyRetrievalExpression));
  const messagePath = retrieval === undefined ? undefined : asElement(retrieval.messagePath);
  return value.$type === selectedTypes.correlationProperty &&
    readId(value) === ids.correlationProperty && optionalName(value.name) &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "correlationPropertyRetrievalExpression"]) &&
    (value.type === undefined || value.type === itemDefinition) &&
    retrieval !== undefined && retrieval.$type === selectedTypes.retrieval &&
    readId(retrieval) === ids.retrieval &&
    hasOnlyModelledKeys(retrieval, ["$type", "id", "messagePath"]) &&
    retrieval.messageRef === message && messagePath !== undefined &&
    isExactFormalExpression(messagePath, ids.messagePath, "payload");
}

function projectInitialCatch(
  event: ElementRecord,
  property: ElementRecord,
  itemDefinition: ElementRecord,
  message: ElementRecord,
  operation: ElementRecord,
): PayloadNode | undefined {
  if (!isExactCatchEvent(event, ids.initialCatch)) {
    return undefined;
  }
  const definition = only(asElementArray(event.eventDefinitions));
  const dataOutput = only(asElementArray(event.dataOutputs));
  const outputSet = asElement(event.outputSet);
  const association = only(asElementArray(event.dataOutputAssociations));
  if (
    definition === undefined ||
    !isExactEventDefinition(definition, ids.initialEventDefinition, message, operation) ||
    dataOutput === undefined || dataOutput.$type !== selectedTypes.dataOutput ||
    readId(dataOutput) !== ids.dataOutput || !optionalName(dataOutput.name) ||
    !hasOnlyModelledKeys(dataOutput, ["$type", "id", "name"]) ||
    Object.hasOwn(dataOutput, "isCollection") ||
    dataOutput.itemSubjectRef !== itemDefinition || dataOutput.dataState !== undefined ||
    outputSet === undefined || outputSet.$type !== selectedTypes.outputSet ||
    readId(outputSet) !== ids.outputSet || !hasOnlyModelledKeys(outputSet, ["$type", "id"]) ||
    !sameReferences(outputSet.dataOutputRefs, [dataOutput]) ||
    outputSet.optionalOutputRefs !== undefined ||
    outputSet.whileExecutingOutputRefs !== undefined || outputSet.inputSetRefs !== undefined ||
    association === undefined || association.$type !== selectedTypes.dataOutputAssociation ||
    readId(association) !== ids.association ||
    !hasOnlyModelledKeys(association, ["$type", "id"]) ||
    !sameReferences(association.sourceRef, [dataOutput]) || association.targetRef !== property ||
    association.transformation !== undefined || association.assignment !== undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.PayloadMessageCatchEvent,
    id: ids.initialCatch,
    channel: operationChannel(),
    directOutput: {
      associationId: ids.association,
      sourceDataOutputId: ids.dataOutput,
      sourceDataOutputName: typeof dataOutput.name === "string" ? dataOutput.name : null,
      targetPropertyId: ids.property,
    },
  };
}

function projectCorrelatedCatch(
  event: ElementRecord,
  key: ElementRecord,
  correlationProperty: ElementRecord,
  property: ElementRecord,
  message: ElementRecord,
  operation: ElementRecord,
): CorrelatedNode | undefined {
  const definition = only(asElementArray(event.eventDefinitions));
  if (
    !isExactCatchEvent(event, ids.correlatedCatch) ||
    definition === undefined ||
    !isExactEventDefinition(definition, ids.correlatedEventDefinition, message, operation) ||
    event.dataOutputs !== undefined || event.outputSet !== undefined ||
    event.dataOutputAssociations !== undefined || event.ioSpecification !== undefined ||
    event.inputSet !== undefined || event.dataInputs !== undefined ||
    readId(key) !== ids.correlationKey || readId(correlationProperty) !== ids.correlationProperty ||
    readId(property) !== ids.property
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.CorrelatedPayloadMessageCatchEvent,
    id: ids.correlatedCatch,
    channel: operationChannel(),
    correlationKeyId: ids.correlationKey,
    correlationPropertyId: ids.correlationProperty,
    payloadSelector: {
      language: CorrelationScalarPathLanguage,
      body: "payload",
    },
    processPropertySelector: {
      language: CorrelationScalarPathLanguage,
      body: `property:${ids.property}`,
      propertyId: ids.property,
    },
  };
}

function isExactCatchEvent(value: ElementRecord, id: string): boolean {
  return value.$type === bpmnTypes.intermediateCatchEventType &&
    readId(value) === id &&
    hasOnlyModelledKeys(value, [
      "$type",
      "id",
      "name",
      "dataOutputs",
      "dataOutputAssociations",
      "outputSet",
      "eventDefinitions",
    ]) &&
    optionalName(value.name) && !Object.hasOwn(value, "parallelMultiple") &&
    value.eventDefinitionRef === undefined;
}

function isExactEventDefinition(
  value: ElementRecord,
  id: string,
  message: ElementRecord,
  operation: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.messageEventDefinitionType &&
    readId(value) === id && hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.messageRef === message && value.operationRef === operation &&
    value.eventDefinitionRef === undefined;
}

function isExactFormalExpression(
  value: ElementRecord,
  id: string,
  body: string,
): boolean {
  return value.$type === selectedTypes.formalExpression &&
    readId(value) === id && value.language === CorrelationScalarPathLanguage &&
    value.body === body &&
    hasOnlyModelledKeys(value, ["$type", "id", "language", "body"]) &&
    value.evaluatesToTypeRef === undefined;
}

function isExactItemDefinition(value: ElementRecord): boolean {
  return value.$type === selectedTypes.itemDefinition &&
    readId(value) === ids.itemDefinition &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    !Object.hasOwn(value, "structureRef") && !Object.hasOwn(value, "itemKind") &&
    !Object.hasOwn(value, "isCollection");
}

function isExactMessage(value: ElementRecord, itemDefinition: ElementRecord): boolean {
  return value.$type === bpmnTypes.messageType && readId(value) === ids.message &&
    optionalName(value.name) && hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.itemRef === itemDefinition;
}

function readExactOperation(
  value: ElementRecord,
  message: ElementRecord,
): ElementRecord | undefined {
  const operation = only(asElementArray(value.operations));
  return value.$type === bpmnTypes.interfaceType && readId(value) === ids.interface &&
      typeof value.name === "string" &&
      hasOnlyModelledKeys(value, ["$type", "id", "name", "operations"]) &&
      operation !== undefined && operation.$type === bpmnTypes.operationType &&
      readId(operation) === ids.operation && typeof operation.name === "string" &&
      hasOnlyModelledKeys(operation, ["$type", "id", "name"]) &&
      operation.inMessageRef === message && operation.outMessageRef === undefined &&
      operation.errorRefs === undefined && operation.implementationRef === undefined
    ? operation
    : undefined;
}

function isExactProperty(value: ElementRecord): boolean {
  return value.$type === selectedTypes.property && readId(value) === ids.property &&
    optionalName(value.name) && hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.itemSubjectRef === undefined && value.dataState === undefined;
}

function isExactPlainNode(value: ElementRecord, type: string, id: string): boolean {
  return value.$type === type && readId(value) === id && optionalName(value.name) &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]);
}

function isExactFlow(
  value: ElementRecord,
  id: string,
  source: ElementRecord,
  target: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.sequenceFlowType && readId(value) === id &&
    optionalName(value.name) && hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.sourceRef === source && value.targetRef === target &&
    value.conditionExpression === undefined;
}

function isExactParticipant(
  value: ElementRecord,
  id: string,
  process: ElementRecord | undefined,
): boolean {
  return value.$type === selectedTypes.participant && readId(value) === id &&
    optionalName(value.name) && hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.processRef === process && value.interfaceRef === undefined &&
    value.participantMultiplicity === undefined && value.endPointRefs === undefined;
}

function isExactMessageFlow(
  value: ElementRecord,
  id: string,
  source: ElementRecord,
  target: ElementRecord,
  message: ElementRecord,
): boolean {
  return value.$type === selectedTypes.messageFlow && readId(value) === id &&
    optionalName(value.name) && hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.sourceRef === source && value.targetRef === target &&
    value.messageRef === message;
}

function hasExactNodeReferences(
  value: ElementRecord,
  incoming: ReadonlyArray<ElementRecord>,
  outgoing: ReadonlyArray<ElementRecord>,
): boolean {
  return (incoming.length === 0 ? value.incoming === undefined : sameReferences(value.incoming, incoming)) &&
    (outgoing.length === 0 ? value.outgoing === undefined : sameReferences(value.outgoing, outgoing));
}

function sameReferences(value: unknown, expected: ReadonlyArray<ElementRecord>): boolean {
  const actual = asElementArray(value);
  return actual?.length === expected.length &&
    actual.every((entry, index) => entry === expected[index]);
}

function only(values: ReadonlyArray<ElementRecord> | undefined): ElementRecord | undefined {
  return values?.length === 1 ? values[0] : undefined;
}

function optionalName(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function operationChannel() {
  return {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: ids.interface,
    interfaceOperationId: ids.operation,
    messageId: ids.message,
  } as const;
}

function exactCardinality(
  property: string,
  projectedType: string,
  xmlLocalName: string,
  expectedOccurrences: number,
): ExactContainmentCardinality {
  return { property, projectedType, xmlLocalName, expectedOccurrences };
}

function compareIds(left: Readonly<{ id: string }>, right: Readonly<{ id: string }>): number {
  return compareCanonicalStrings(left.id, right.id);
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }],
  };
}
