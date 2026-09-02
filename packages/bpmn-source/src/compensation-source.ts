/** Exact BPMN source admission for the reviewed Compensation source checkpoint. */
import {
  CheckedNodeKind,
  CheckedProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedCompensation,
  CheckedCompensationSubject,
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
import {
  COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compensationSingleEffectDescriptor,
  compensationSourceIds as ids,
  compensationSourceLimits,
} from "./compensation-source-profile.js";
import { readCompensationSourceProvenance } from "./compensation-source-provenance.js";
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
const types = Object.freeze({
  itemDefinition: "bpmn:ItemDefinition",
  property: "bpmn:Property",
  inputOutputSpecification: "bpmn:InputOutputSpecification",
  dataInput: "bpmn:DataInput",
  inputSet: "bpmn:InputSet",
  outputSet: "bpmn:OutputSet",
  dataInputAssociation: "bpmn:DataInputAssociation",
});

const exactContainmentCardinalities: ReadonlyArray<ExactContainmentCardinality> =
  Object.freeze([
    exactCardinality("Definitions.rootElements[ItemDefinition]", types.itemDefinition, "itemDefinition", 1),
    exactCardinality("Definitions.rootElements[Process]", bpmnTypes.processType, "process", 1),
    exactCardinality("Process.properties", types.property, "property", 1),
    exactCardinality("FlowElements[BoundaryEvent]", bpmnTypes.boundaryEventType, "boundaryEvent", 2),
    exactCardinality("FlowElements[SubProcess]", bpmnTypes.subProcessType, "subProcess", 2),
    exactCardinality("FlowElements[ServiceTask]", bpmnTypes.serviceTaskType, "serviceTask", 3),
    exactCardinality(
      "FlowElements[IntermediateThrowEvent]",
      bpmnTypes.intermediateThrowEventType,
      "intermediateThrowEvent",
      1,
    ),
    exactCardinality(
      "EventDefinitions[CompensateEventDefinition]",
      bpmnTypes.compensateEventDefinitionType,
      "compensateEventDefinition",
      4,
    ),
    exactCardinality("Process.artifacts[Association]", bpmnTypes.associationType, "association", 2),
    exactCardinality("ServiceTask.ioSpecification", types.inputOutputSpecification, "ioSpecification", 1),
    exactCardinality("IoSpecification.dataInputs", types.dataInput, "dataInput", 1),
    exactCardinality("IoSpecification.inputSets", types.inputSet, "inputSet", 1),
    exactCardinality("IoSpecification.outputSets", types.outputSet, "outputSet", 1),
    exactCardinality("ServiceTask.dataInputAssociations", types.dataInputAssociation, "dataInputAssociation", 1),
  ]);

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  ordinaryFlows: ReadonlyArray<ElementRecord>;
  compensation: CheckedCompensation;
}>;

export function compensationSourceContainmentCardinalities(
  semanticProfile: string,
): ReadonlyArray<ExactContainmentCardinality> {
  return semanticProfile === COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID
    ? exactContainmentCardinalities
    : [];
}

export function compileCompensationSourceCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Compensation source must match the reviewed global throw, two boundary handlers, one Event Sub-Process handler, direct restored binding, and dependency exactly.",
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
    exact.ordinaryFlows,
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
          messageArtifacts: undefined,
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary Compensation checkpoint node and Sequence Flow must retain its exact plain shape and resolved references.",
    );
  }

  const nodes: CheckedNode[] = [
    ...ordinaryNodes,
    {
      kind: CheckedNodeKind.GlobalSynchronousCompensationThrowEvent,
      id: ids.trigger,
    },
  ];
  nodes.sort(compareIds);
  const flows = [...sequenceFlows].sort(compareIds);
  const rootScopeId = definitionScopeId(ids.process);
  const parentScopeId = definitionScopeId(ids.arrangeGroundTravel);
  const handlerScopeId = definitionScopeId(ids.eventHandler);
  const definitionScopes = [
    { id: rootScopeId, parentScopeId: null, originElementId: ids.process },
    {
      id: parentScopeId,
      parentScopeId: rootScopeId,
      originElementId: ids.arrangeGroundTravel,
    },
    {
      id: handlerScopeId,
      parentScopeId,
      originElementId: ids.eventHandler,
    },
  ].sort(compareIds);
  const childNodeIds = new Set<string>([
    ids.arrangeStart,
    ids.arrangeTask,
    ids.arrangeEnd,
  ]);
  const childFlowIds = new Set<string>([
    ids.arrangeStartFlow,
    ids.arrangeEndFlow,
  ]);
  const nodeScopes = nodes.map(({ id }) => ({
    nodeId: id,
    scopeId: childNodeIds.has(id) ? parentScopeId : rootScopeId,
  }));
  const sequenceFlowScopes = flows.map(({ id }) => ({
    sequenceFlowId: id,
    scopeId: childFlowIds.has(id) ? parentScopeId : rootScopeId,
  }));
  const graph = {
    processId: ids.process,
    definitionScopes,
    nodeScopes,
    sequenceFlowScopes,
    nodes,
    flows,
    compensation: exact.compensation,
  };
  if (!isAdmittedCheckedProcess(
    graph,
    exact.definitions.expressionLanguage,
    COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  )) {
    return unsupported(
      "The Compensation checked graph must preserve the selected scopes, dormant handler, topology, bodies, dependency, and limits.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
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
      compensation: exact.compensation,
    },
    diagnostics: [],
  };
}

function readExactSource(rootElement: unknown): ExactSource | undefined {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    readId(definitions) !== ids.definitions ||
    definitions.targetNamespace !== ids.targetNamespace ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "rootElements",
    ])
  ) {
    return undefined;
  }
  const located = locateContainedElements(definitions);
  const indexed = uniqueIdIndex(located.keys());
  const roots = asElementArray(definitions.rootElements);
  const itemDefinition = indexed?.get(ids.itemDefinition);
  const process = indexed?.get(ids.process);
  if (
    indexed === undefined || roots === undefined ||
    itemDefinition === undefined || process === undefined ||
    !isExactItemDefinition(itemDefinition) || !isExactProcess(process)
  ) {
    return undefined;
  }
  const property = onlyElements(process.properties)?.[0];
  const provenance = readCompensationSourceProvenance(process);
  if (
    property === undefined || !isExactProperty(property, itemDefinition) ||
    provenance === undefined || !isExactProvenance(provenance)
  ) {
    return undefined;
  }

  const get = (id: string) => indexed.get(id);
  const reserve = get(ids.reserveHotel);
  const reserveBoundary = get(ids.reserveBoundary);
  const reserveHandler = get(ids.reserveHandler);
  const arrange = get(ids.arrangeGroundTravel);
  const eventHandler = get(ids.eventHandler);
  const eventStart = get(ids.eventHandlerStart);
  const eventEffect = get(ids.eventHandlerEffect);
  const eventEnd = get(ids.eventHandlerEnd);
  const insurance = get(ids.issueInsurance);
  const insuranceBoundary = get(ids.insuranceBoundary);
  const insuranceHandler = get(ids.insuranceHandler);
  const trigger = get(ids.trigger);
  if (
    reserve === undefined || reserveBoundary === undefined ||
    reserveHandler === undefined || arrange === undefined ||
    eventHandler === undefined || eventStart === undefined ||
    eventEffect === undefined || eventEnd === undefined ||
    insurance === undefined || insuranceBoundary === undefined ||
    insuranceHandler === undefined || trigger === undefined ||
    !hasExactRootContents(process, indexed) ||
    !hasExactArrangeContents(arrange, indexed) ||
    !hasExactHandlerContents(eventHandler, indexed) ||
    !isExactBoundary(reserveBoundary, reserve) ||
    !isExactBoundary(insuranceBoundary, insurance) ||
    !isExactBoundaryHandler(reserveHandler) ||
    !isExactBoundaryHandler(insuranceHandler) ||
    !isExactEventHandler(eventHandler, arrange) ||
    !isExactEventStart(eventStart) ||
    !isExactEventEnd(eventEnd) ||
    !isExactEventEffect(eventEffect, property, itemDefinition, indexed) ||
    !isExactGlobalThrow(trigger)
  ) {
    return undefined;
  }

  const effectiveDefinitions = [
    effectiveCompensationDefinition(reserveBoundary, ids.reserveDefinition, false),
    effectiveCompensationDefinition(insuranceBoundary, ids.insuranceDefinition, false),
    effectiveCompensationDefinition(eventStart, ids.eventHandlerDefinition, false),
    effectiveCompensationDefinition(trigger, ids.globalDefinition, true),
  ];
  if (
    effectiveDefinitions.some((definition) => definition === undefined) ||
    new Set(effectiveDefinitions).size !== 4
  ) {
    return undefined;
  }
  const permittedRoots = new Set<ElementRecord>([
    itemDefinition,
    process,
    ...effectiveDefinitions.flatMap((definition) =>
      definition !== undefined && roots.includes(definition) ? [definition] : []
    ),
  ]);
  if (roots.length !== permittedRoots.size || roots.some((root) => !permittedRoots.has(root))) {
    return undefined;
  }

  const ordinaryNodeIds = [
    ids.rootStart,
    ids.split,
    ids.reserveHotel,
    ids.arrangeGroundTravel,
    ids.issueInsurance,
    ids.join,
    ids.rootEnd,
    ids.arrangeStart,
    ids.arrangeTask,
    ids.arrangeEnd,
  ];
  const ordinaryFlowIds = [
    ids.rootStartFlow,
    ids.splitReserveFlow,
    ids.reserveArrangeFlow,
    ids.arrangeJoinFlow,
    ids.splitInsuranceFlow,
    ids.insuranceJoinFlow,
    ids.joinTriggerFlow,
    ids.triggerEndFlow,
    ids.arrangeStartFlow,
    ids.arrangeEndFlow,
  ];
  const ordinaryNodes = selectElements(indexed, ordinaryNodeIds);
  const ordinaryFlows = selectElements(indexed, ordinaryFlowIds);
  if (
    ordinaryNodes === undefined || ordinaryFlows === undefined ||
    !hasExactErasedHandlerFlow(indexed, ids.handlerStartFlow, eventStart, eventEffect) ||
    !hasExactErasedHandlerFlow(indexed, ids.handlerEndFlow, eventEffect, eventEnd) ||
    !hasExactAssociations(
      process,
      indexed,
      reserveBoundary,
      reserveHandler,
      insuranceBoundary,
      insuranceHandler,
    )
  ) {
    return undefined;
  }
  return {
    definitions,
    process,
    ordinaryNodes,
    ordinaryFlows,
    compensation: checkedCompensation(),
  };
}

function checkedCompensation(): CheckedCompensation {
  const subjects: CheckedCompensationSubject[] = [
    {
      kind: "boundaryActivity",
      subjectElementId: ids.reserveHotel,
      boundaryEventElementId: ids.reserveBoundary,
      body: {
        kind: "singleEffect",
        handlerElementId: ids.reserveHandler,
        effectElementId: ids.reserveHandler,
        descriptor: compensationSingleEffectDescriptor,
        input: { kind: "empty" },
      },
    },
    {
      kind: "eventSubProcess",
      parentElementId: ids.arrangeGroundTravel,
      parentScopeId: definitionScopeId(ids.arrangeGroundTravel),
      handlerScopeId: definitionScopeId(ids.eventHandler),
      body: {
        kind: "singleEffect",
        handlerElementId: ids.eventHandler,
        effectElementId: ids.eventHandlerEffect,
        descriptor: compensationSingleEffectDescriptor,
        input: {
          kind: "directRestoredProcessBinding",
          sourcePropertyId: ids.property,
          targetDataInputId: ids.dataInput,
        },
      },
    },
    {
      kind: "boundaryActivity",
      subjectElementId: ids.issueInsurance,
      boundaryEventElementId: ids.insuranceBoundary,
      body: {
        kind: "singleEffect",
        handlerElementId: ids.insuranceHandler,
        effectElementId: ids.insuranceHandler,
        descriptor: compensationSingleEffectDescriptor,
        input: { kind: "empty" },
      },
    },
  ];
  subjects.sort((left, right) =>
    compareCanonicalStrings(subjectElementId(left), subjectElementId(right))
  );
  return {
    triggerElementId: ids.trigger,
    subjects,
    dependencies: [{
      predecessorElementId: ids.reserveHotel,
      successorElementId: ids.arrangeGroundTravel,
      reason: "sequenceFlow",
    }],
    ...compensationSourceLimits,
  };
}

function isExactItemDefinition(value: ElementRecord): boolean {
  return value.$type === types.itemDefinition &&
    readId(value) === ids.itemDefinition &&
    value.structureRef === undefined &&
    (value.itemKind === undefined || value.itemKind === "Information") &&
    value.isCollection === false &&
    hasOnlyModelledKeys(value, ["$type", "id", "itemKind", "isCollection"]);
}

function isExactProcess(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.processType && readId(value) === ids.process &&
    value.isExecutable === true && optionalName(value.name) &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "isExecutable", "properties", "flowElements", "artifacts",
    ]);
}

function isExactProperty(value: ElementRecord, item: ElementRecord): boolean {
  return value.$type === types.property && readId(value) === ids.property &&
    optionalName(value.name) && value.itemSubjectRef === item &&
    value.dataState === undefined &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "itemSubjectRef"]);
}

function isExactBoundary(value: ElementRecord, activity: ElementRecord): boolean {
  return value.$type === bpmnTypes.boundaryEventType &&
    value.attachedToRef === activity && typeof value.cancelActivity === "boolean" &&
    optionalName(value.name) &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "attachedToRef", "cancelActivity", "eventDefinitions", "eventDefinitionRef",
    ]);
}

function isExactBoundaryHandler(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.serviceTaskType && optionalName(value.name) &&
    value.implementation === COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION &&
    value.isForCompensation === true && value.ioSpecification === undefined &&
    value.dataInputAssociations === undefined && value.dataOutputAssociations === undefined &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "implementation", "isForCompensation",
    ]);
}

function isExactEventHandler(value: ElementRecord, parent: ElementRecord): boolean {
  return value.$type === bpmnTypes.subProcessType && value.triggeredByEvent === true &&
    optionalName(value.name) && parent.$type === bpmnTypes.subProcessType &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "triggeredByEvent", "flowElements"]);
}

function isExactEventStart(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.startEventType && optionalName(value.name) &&
    typeof value.isInterrupting === "boolean" &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "isInterrupting", "outgoing", "eventDefinitions", "eventDefinitionRef",
    ]);
}

function isExactEventEnd(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.endEventType && optionalName(value.name) &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "incoming"]);
}

function isExactGlobalThrow(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.intermediateThrowEventType && optionalName(value.name) &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "incoming", "outgoing", "eventDefinitions", "eventDefinitionRef",
    ]);
}

function isExactEventEffect(
  value: ElementRecord,
  property: ElementRecord,
  item: ElementRecord,
  indexed: ReadonlyMap<string, ElementRecord>,
): boolean {
  const io = asElement(value.ioSpecification);
  const input = indexed.get(ids.dataInput);
  const inputSet = indexed.get(ids.inputSet);
  const outputSet = indexed.get(ids.outputSet);
  const association = indexed.get(ids.dataAssociation);
  return value.$type === bpmnTypes.serviceTaskType && optionalName(value.name) &&
    value.implementation === COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION &&
    value.isForCompensation === false &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "name", "implementation", "incoming", "outgoing", "ioSpecification", "dataInputAssociations",
    ]) && io !== undefined && io.$type === types.inputOutputSpecification &&
    readId(io) === ids.ioSpecification &&
    hasOnlyModelledKeys(io, ["$type", "id", "dataInputs", "inputSets", "outputSets"]) &&
    sameReferences(io.dataInputs, input === undefined ? [] : [input]) &&
    sameReferences(io.inputSets, inputSet === undefined ? [] : [inputSet]) &&
    sameReferences(io.outputSets, outputSet === undefined ? [] : [outputSet]) &&
    io.dataOutputs === undefined && input !== undefined &&
    input.$type === types.dataInput && readId(input) === ids.dataInput &&
    optionalName(input.name) && input.itemSubjectRef === item &&
    input.isCollection === false && input.dataState === undefined &&
    hasOnlyModelledKeys(input, ["$type", "id", "name", "itemSubjectRef", "isCollection"]) &&
    inputSet !== undefined && inputSet.$type === types.inputSet &&
    readId(inputSet) === ids.inputSet &&
    hasOnlyModelledKeys(inputSet, ["$type", "id", "dataInputRefs"]) &&
    sameReferences(inputSet.dataInputRefs, [input]) &&
    emptyReferences(inputSet.optionalInputRefs) &&
    emptyReferences(inputSet.whileExecutingInputRefs) &&
    emptyReferences(inputSet.outputSetRefs) &&
    outputSet !== undefined && outputSet.$type === types.outputSet &&
    readId(outputSet) === ids.outputSet && hasOnlyModelledKeys(outputSet, ["$type", "id"]) &&
    emptyReferences(outputSet.dataOutputRefs) &&
    emptyReferences(outputSet.optionalOutputRefs) &&
    emptyReferences(outputSet.whileExecutingOutputRefs) &&
    emptyReferences(outputSet.inputSetRefs) &&
    association !== undefined && association.$type === types.dataInputAssociation &&
    readId(association) === ids.dataAssociation &&
    hasOnlyModelledKeys(association, ["$type", "id", "sourceRef", "targetRef"]) &&
    sameReferences(association.sourceRef, [property]) && association.targetRef === input &&
    association.transformation === undefined && association.assignment === undefined &&
    sameReferences(value.dataInputAssociations, [association]) &&
    value.dataOutputAssociations === undefined;
}

function effectiveCompensationDefinition(
  event: ElementRecord,
  expectedId: string,
  synchronous: boolean,
): ElementRecord | undefined {
  const inline = optionalElements(event.eventDefinitions);
  const referenced = optionalElements(event.eventDefinitionRef);
  const definitions = inline === undefined || referenced === undefined
    ? undefined
    : [...inline, ...referenced];
  const definition = definitions?.[0];
  return definitions?.length === 1 && definition !== undefined &&
      definition.$type === bpmnTypes.compensateEventDefinitionType &&
      readId(definition) === expectedId && definition.activityRef === undefined &&
      typeof definition.waitForCompletion === "boolean" &&
      (!synchronous || definition.waitForCompletion === true) &&
      hasOnlyModelledKeys(definition, ["$type", "id", "waitForCompletion"])
    ? definition
    : undefined;
}

function hasExactRootContents(
  process: ElementRecord,
  indexed: ReadonlyMap<string, ElementRecord>,
): boolean {
  return exactContainedIds(process.flowElements, indexed, [
    ids.rootStart, ids.split, ids.reserveHotel, ids.reserveBoundary,
    ids.reserveHandler, ids.arrangeGroundTravel, ids.issueInsurance,
    ids.insuranceBoundary, ids.insuranceHandler, ids.join, ids.trigger,
    ids.rootEnd, ids.rootStartFlow, ids.splitReserveFlow,
    ids.reserveArrangeFlow, ids.arrangeJoinFlow, ids.splitInsuranceFlow,
    ids.insuranceJoinFlow, ids.joinTriggerFlow, ids.triggerEndFlow,
  ]);
}

function hasExactArrangeContents(
  arrange: ElementRecord,
  indexed: ReadonlyMap<string, ElementRecord>,
): boolean {
  return arrange.$type === bpmnTypes.subProcessType && arrange.triggeredByEvent === false &&
    optionalName(arrange.name) &&
    hasOnlyModelledKeys(arrange, ["$type", "id", "name", "incoming", "outgoing", "flowElements"]) &&
    exactContainedIds(arrange.flowElements, indexed, [
      ids.arrangeStart, ids.arrangeTask, ids.arrangeEnd, ids.eventHandler,
      ids.arrangeStartFlow, ids.arrangeEndFlow,
    ]);
}

function hasExactHandlerContents(
  handler: ElementRecord,
  indexed: ReadonlyMap<string, ElementRecord>,
): boolean {
  return exactContainedIds(handler.flowElements, indexed, [
    ids.eventHandlerStart, ids.eventHandlerEffect, ids.eventHandlerEnd,
    ids.handlerStartFlow, ids.handlerEndFlow,
  ]);
}

function hasExactAssociations(
  process: ElementRecord,
  indexed: ReadonlyMap<string, ElementRecord>,
  reserveBoundary: ElementRecord,
  reserveHandler: ElementRecord,
  insuranceBoundary: ElementRecord,
  insuranceHandler: ElementRecord,
): boolean {
  const reserve = indexed.get(ids.reserveAssociation);
  const insurance = indexed.get(ids.insuranceAssociation);
  return exactContainedIds(process.artifacts, indexed, [
    ids.reserveAssociation,
    ids.insuranceAssociation,
  ]) && reserve !== undefined && insurance !== undefined &&
    isExactAssociation(reserve, reserveBoundary, reserveHandler) &&
    isExactAssociation(insurance, insuranceBoundary, insuranceHandler);
}

function isExactAssociation(
  value: ElementRecord,
  source: ElementRecord,
  target: ElementRecord,
): boolean {
  return value.$type === bpmnTypes.associationType && value.sourceRef === source &&
    value.targetRef === target &&
    (value.associationDirection === undefined ||
      ["None", "One", "Both"].includes(String(value.associationDirection))) &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "sourceRef", "targetRef", "associationDirection",
    ]);
}

function hasExactErasedHandlerFlow(
  indexed: ReadonlyMap<string, ElementRecord>,
  id: string,
  source: ElementRecord,
  target: ElementRecord,
): boolean {
  const flow = indexed.get(id);
  return flow !== undefined && flow.$type === bpmnTypes.sequenceFlowType &&
    flow.sourceRef === source && flow.targetRef === target &&
    flow.conditionExpression === undefined &&
    hasOnlyModelledKeys(flow, ["$type", "id", "sourceRef", "targetRef"]);
}

function isExactProvenance(
  value: NonNullable<ReturnType<typeof readCompensationSourceProvenance>>,
): boolean {
  return value.processElementId === ids.process &&
    value.globalThrowElementId === ids.trigger &&
    JSON.stringify(value.boundaryHandlers) === JSON.stringify([
      {
        activityElementId: ids.issueInsurance,
        boundaryEventElementId: ids.insuranceBoundary,
        compensationActivityElementId: ids.insuranceHandler,
      },
      {
        activityElementId: ids.reserveHotel,
        boundaryEventElementId: ids.reserveBoundary,
        compensationActivityElementId: ids.reserveHandler,
      },
    ]) && JSON.stringify(value.eventSubProcessHandlers) === JSON.stringify([{
      parentElementId: ids.arrangeGroundTravel,
      handlerElementId: ids.eventHandler,
    }]) && JSON.stringify(value.dependencies) === JSON.stringify([{
      predecessorElementId: ids.reserveHotel,
      successorElementId: ids.arrangeGroundTravel,
    }]);
}

function uniqueIdIndex(
  elements: Iterable<ElementRecord>,
): ReadonlyMap<string, ElementRecord> | undefined {
  const result = new Map<string, ElementRecord>();
  for (const element of elements) {
    if (!Object.hasOwn(element, "id")) continue;
    const id = readId(element);
    if (id === undefined || result.has(id)) return undefined;
    result.set(id, element);
  }
  return result;
}

function selectElements(
  indexed: ReadonlyMap<string, ElementRecord>,
  selectedIds: ReadonlyArray<string>,
): ReadonlyArray<ElementRecord> | undefined {
  const selected = selectedIds.map((id) => indexed.get(id));
  return selected.every((element) => element !== undefined)
    ? selected as ReadonlyArray<ElementRecord>
    : undefined;
}

function exactContainedIds(
  value: unknown,
  indexed: ReadonlyMap<string, ElementRecord>,
  expectedIds: ReadonlyArray<string>,
): boolean {
  const actual = asElementArray(value);
  const expected = selectElements(indexed, expectedIds);
  return actual !== undefined && expected !== undefined &&
    actual.length === expected.length &&
    actual.every((element) => expected.includes(element));
}

function onlyElements(value: unknown): ReadonlyArray<ElementRecord> | undefined {
  const elements = asElementArray(value);
  return elements?.length === 1 ? elements : undefined;
}

function optionalElements(value: unknown): ReadonlyArray<ElementRecord> | undefined {
  return value === undefined ? [] : asElementArray(value);
}

function sameReferences(value: unknown, expected: ReadonlyArray<ElementRecord>): boolean {
  const actual = asElementArray(value);
  return actual?.length === expected.length &&
    actual.every((element, index) => element === expected[index]);
}

function emptyReferences(value: unknown): boolean {
  return value === undefined || sameReferences(value, []);
}

function optionalName(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function subjectElementId(subject: CheckedCompensationSubject): string {
  return subject.kind === "boundaryActivity"
    ? subject.subjectElementId
    : subject.parentElementId;
}

function compareIds(left: Readonly<{ id: string }>, right: Readonly<{ id: string }>): number {
  return compareCanonicalStrings(left.id, right.id);
}

function exactCardinality(
  property: string,
  projectedType: string,
  xmlLocalName: string,
  expectedOccurrences: number,
): ExactContainmentCardinality {
  return { property, projectedType, xmlLocalName, expectedOccurrences };
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
