import {
  CheckedNodeKind,
  CheckedProcessKind,
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  CheckedSequenceFlow,
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

const bpmnTypes = metamodelManifest.compilerProjection;
const selectedTypes = Object.freeze({
  itemDefinition: "bpmn:ItemDefinition",
  dataObject: "bpmn:DataObject",
  dataObjectReference: "bpmn:DataObjectReference",
  inputOutputSpecification: "bpmn:InputOutputSpecification",
  dataInput: "bpmn:DataInput",
  dataOutput: "bpmn:DataOutput",
  inputSet: "bpmn:InputSet",
  outputSet: "bpmn:OutputSet",
  dataInputAssociation: "bpmn:DataInputAssociation",
  dataOutputAssociation: "bpmn:DataOutputAssociation",
  multiInstanceLoopCharacteristics: "bpmn:MultiInstanceLoopCharacteristics",
});

const ids = Object.freeze({
  scalarItem: "ItemDefinition_String",
  collectionItem: "ItemDefinition_StringList",
  process: "Process_SequentialMultiInstanceReview",
  inputObject: "DataObject_InputItems",
  inputReference: "DataObjectReference_InputItems",
  outputObject: "DataObject_OutputResults",
  outputReference: "DataObjectReference_OutputResults",
  start: "StartEvent_Review",
  startFlow: "Flow_Start_Review",
  task: "UserTask_Review",
  taskInputCollection: "DataInput_Items",
  inputDataItem: "InputDataItem_CurrentItem",
  taskInputScalar: "DataInput_CurrentItem",
  taskOutputScalar: "DataOutput_CurrentResult",
  outputDataItem: "OutputDataItem_CurrentResult",
  taskOutputCollection: "DataOutput_Results",
  inputCollectionAssociation: "DataInputAssociation_Items",
  inputItemAssociation: "DataInputAssociation_CurrentItem",
  outputItemAssociation: "DataOutputAssociation_CurrentResult",
  outputCollectionAssociation: "DataOutputAssociation_Results",
  normalFlow: "Flow_Review_Completed",
  normalEnd: "EndEvent_Completed",
  boundary: "BoundaryTimer_Review",
  boundaryDefinition: "TimerEventDefinition_Review",
  boundaryFlow: "Flow_Timer_Escalation",
  escalationTask: "UserTask_Escalation",
  escalationFlow: "Flow_Escalation_End",
  escalationEnd: "EndEvent_Interrupted",
});

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  multiInstanceNode: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.SequentialMultiInstanceUserTask }
  >;
}>;

export function compileSequentialMultiInstanceCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Sequential Multi-Instance source must match the reviewed ItemDefinition, data-association, User Task, and lifetime-Timer shape exactly.",
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
          messageArtifacts: undefined,
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.multiInstanceNode].sort(compareIds);
  const scopeId = definitionScopeId(ids.process);
  const definitionScopes = [{
    id: scopeId,
    parentScopeId: null,
    originElementId: ids.process,
  }];
  const nodeScopes = nodes.map(({ id }) => ({ nodeId: id, scopeId }));
  const sequenceFlowScopes = sequenceFlows.map(({ id }) => ({
    sequenceFlowId: id,
    scopeId,
  }));
  const graph = {
    processId: ids.process,
    definitionScopes,
    nodeScopes,
    sequenceFlowScopes,
    nodes,
    flows: [...sequenceFlows].sort(compareIds),
  };
  if (!isAdmittedCheckedProcess(
    graph,
    exact.definitions.expressionLanguage,
    SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  )) {
    return unsupported(
      "Sequential Multi-Instance control and lifetime-Timer routes must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
        sourceId: source.id,
        sourceSha256: source.sha256,
        sourceOverlay,
      },
      processId: ids.process,
      definitionScopes,
      nodeScopes,
      sequenceFlowScopes,
      nodes,
      sequenceFlows: graph.flows,
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
      "expressionLanguage",
      "rootElements",
    ]) ||
    readId(definitions) !== "Definitions_SequentialMultiInstanceReview" ||
    definitions.targetNamespace !==
      "https://bpmn-lean.org/scenarios/sequential-multi-instance-review"
  ) {
    return undefined;
  }
  const roots = asElementArray(definitions.rootElements);
  const scalarItem = roots?.[0];
  const collectionItem = roots?.[1];
  const process = roots?.[2];
  if (
    roots?.length !== 3 ||
    scalarItem === undefined ||
    collectionItem === undefined ||
    process === undefined ||
    !isScalarItemDefinition(scalarItem) ||
    !isCollectionItemDefinition(collectionItem) ||
    !isExactProcess(process)
  ) {
    return undefined;
  }
  const elements = asElementArray(process.flowElements);
  if (elements?.length !== 14) {
    return undefined;
  }
  const [
    inputObject,
    inputReference,
    outputObject,
    outputReference,
    start,
    startFlow,
    task,
    normalFlow,
    normalEnd,
    boundary,
    boundaryFlow,
    escalationTask,
    escalationFlow,
    escalationEnd,
  ] = elements;
  if (
    inputObject === undefined || inputReference === undefined ||
    outputObject === undefined || outputReference === undefined ||
    start === undefined || startFlow === undefined || task === undefined ||
    normalFlow === undefined || normalEnd === undefined ||
    boundary === undefined || boundaryFlow === undefined ||
    escalationTask === undefined || escalationFlow === undefined ||
    escalationEnd === undefined ||
    !isCollectionDataObject(inputObject, ids.inputObject, collectionItem) ||
    !isDataObjectReference(inputReference, ids.inputReference, inputObject) ||
    !isCollectionDataObject(outputObject, ids.outputObject, collectionItem) ||
    !isDataObjectReference(outputReference, ids.outputReference, outputObject) ||
    !hasTypeAndId(start, bpmnTypes.startEventType, ids.start) ||
    !hasTypeAndId(startFlow, bpmnTypes.sequenceFlowType, ids.startFlow) ||
    !hasTypeAndId(normalFlow, bpmnTypes.sequenceFlowType, ids.normalFlow) ||
    !hasTypeAndId(normalEnd, bpmnTypes.endEventType, ids.normalEnd) ||
    !hasTypeAndId(boundaryFlow, bpmnTypes.sequenceFlowType, ids.boundaryFlow) ||
    !hasTypeAndId(escalationTask, bpmnTypes.userTaskType, ids.escalationTask) ||
    !hasTypeAndId(escalationFlow, bpmnTypes.sequenceFlowType, ids.escalationFlow) ||
    !hasTypeAndId(escalationEnd, bpmnTypes.endEventType, ids.escalationEnd)
  ) {
    return undefined;
  }
  const multiInstanceNode = projectMultiInstanceNode(
    task,
    boundary,
    scalarItem,
    collectionItem,
    inputObject,
    inputReference,
    outputObject,
    outputReference,
  );
  return multiInstanceNode === undefined
    ? undefined
    : {
        definitions,
        process,
        ordinaryNodes: [start, escalationTask, normalEnd, escalationEnd],
        sequenceFlows: [startFlow, normalFlow, boundaryFlow, escalationFlow],
        multiInstanceNode,
      };
}

function projectMultiInstanceNode(
  task: ElementRecord,
  boundary: ElementRecord,
  scalarItem: ElementRecord,
  collectionItem: ElementRecord,
  inputObject: ElementRecord,
  inputReference: ElementRecord,
  outputObject: ElementRecord,
  outputReference: ElementRecord,
): ExactSource["multiInstanceNode"] | undefined {
  if (
    task.$type !== bpmnTypes.userTaskType ||
    readId(task) !== ids.task ||
    task.name !== "Review item" ||
    !hasOnlyModelledKeys(task, [
      "$type",
      "id",
      "name",
      "ioSpecification",
      "dataInputAssociations",
      "dataOutputAssociations",
      "loopCharacteristics",
    ]) ||
    !hasExactBoundary(boundary, task)
  ) {
    return undefined;
  }
  const io = asElement(task.ioSpecification);
  const inputs = asElementArray(io?.dataInputs);
  const outputs = asElementArray(io?.dataOutputs);
  const inputSets = asElementArray(io?.inputSets);
  const outputSets = asElementArray(io?.outputSets);
  const loop = asElement(task.loopCharacteristics);
  const inputDataItem = asElement(loop?.inputDataItem);
  const outputDataItem = asElement(loop?.outputDataItem);
  const inputAssociations = asElementArray(task.dataInputAssociations);
  const outputAssociations = asElementArray(task.dataOutputAssociations);
  if (
    io === undefined ||
    io.$type !== selectedTypes.inputOutputSpecification ||
    readId(io) !== "IoSpecification_Review" ||
    !hasOnlyModelledKeys(io, [
      "$type",
      "id",
      "dataInputs",
      "dataOutputs",
      "inputSets",
      "outputSets",
    ]) ||
    !hasExactIoMembers(inputs, outputs, scalarItem, collectionItem) ||
    !hasExactIoSets(inputSets, outputSets, inputs, outputs) ||
    !hasExactLoop(loop, inputs, outputs, inputDataItem, outputDataItem, scalarItem) ||
    !hasExactAssociations(
      inputAssociations,
      outputAssociations,
      inputObject,
      inputReference,
      outputObject,
      outputReference,
      inputs,
      outputs,
      inputDataItem,
      outputDataItem,
    )
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.SequentialMultiInstanceUserTask,
    id: ids.task,
    name: "Review item",
    input: {
      collectionItemDefinitionId: ids.collectionItem,
      scalarItemDefinitionId: ids.scalarItem,
      dataObjectId: ids.inputObject,
      dataObjectReferenceId: ids.inputReference,
      loopDataInputId: ids.taskInputCollection,
      inputDataItemId: ids.inputDataItem,
      taskDataInputId: ids.taskInputScalar,
      collectionAssociationId: ids.inputCollectionAssociation,
      itemAssociationId: ids.inputItemAssociation,
    },
    output: {
      dataObjectId: ids.outputObject,
      dataObjectReferenceId: ids.outputReference,
      taskDataOutputId: ids.taskOutputScalar,
      outputDataItemId: ids.outputDataItem,
      loopDataOutputId: ids.taskOutputCollection,
      itemAssociationId: ids.outputItemAssociation,
      collectionAssociationId: ids.outputCollectionAssociation,
    },
    normalOutputFlowId: ids.normalFlow,
    boundaryTimer: {
      elementId: ids.boundary,
      durationLiteral: "PT1S",
      outputFlowId: ids.boundaryFlow,
    },
  };
}

function isScalarItemDefinition(value: ElementRecord): boolean {
  return value.$type === selectedTypes.itemDefinition &&
    readId(value) === ids.scalarItem &&
    hasOnlyModelledKeys(value, [
      "$type", "id", "itemKind", "structureRef", "isCollection",
    ]) &&
    Object.hasOwn(value, "itemKind") && value.itemKind === "Information" &&
    Object.hasOwn(value, "structureRef") && value.structureRef === "xsd:string" &&
    Object.hasOwn(value, "isCollection") && value.isCollection === false;
}

function isCollectionItemDefinition(value: ElementRecord): boolean {
  return value.$type === selectedTypes.itemDefinition &&
    readId(value) === ids.collectionItem &&
    hasOnlyModelledKeys(value, ["$type", "id", "itemKind", "isCollection"]) &&
    Object.hasOwn(value, "itemKind") && value.itemKind === "Information" &&
    value.structureRef === undefined &&
    Object.hasOwn(value, "isCollection") && value.isCollection === true;
}

function isExactProcess(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.processType &&
    readId(value) === ids.process &&
    value.isExecutable === true &&
    hasOnlyModelledKeys(value, ["$type", "id", "isExecutable", "flowElements"]);
}

function isCollectionDataObject(
  value: ElementRecord,
  id: string,
  collectionItem: ElementRecord,
): boolean {
  return value.$type === selectedTypes.dataObject &&
    readId(value) === id &&
    hasOnlyModelledKeys(value, ["$type", "id", "isCollection"]) &&
    Object.hasOwn(value, "isCollection") && value.isCollection === true &&
    value.itemSubjectRef === collectionItem && value.dataState === undefined;
}

function isDataObjectReference(
  value: ElementRecord,
  id: string,
  object: ElementRecord,
): boolean {
  return value.$type === selectedTypes.dataObjectReference &&
    readId(value) === id &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.dataObjectRef === object &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

function hasExactIoMembers(
  inputs: ReadonlyArray<ElementRecord> | undefined,
  outputs: ReadonlyArray<ElementRecord> | undefined,
  scalarItem: ElementRecord,
  collectionItem: ElementRecord,
): boolean {
  return inputs?.length === 2 && outputs?.length === 2 &&
    isItemAware(inputs[0], selectedTypes.dataInput, ids.taskInputCollection, collectionItem, true) &&
    isItemAware(inputs[1], selectedTypes.dataInput, ids.taskInputScalar, scalarItem, false) &&
    isItemAware(outputs[0], selectedTypes.dataOutput, ids.taskOutputScalar, scalarItem, false) &&
    isItemAware(outputs[1], selectedTypes.dataOutput, ids.taskOutputCollection, collectionItem, true);
}

function isItemAware(
  value: ElementRecord | undefined,
  type: string,
  id: string,
  itemDefinition: ElementRecord,
  collection: boolean,
): boolean {
  return value !== undefined && value.$type === type && readId(value) === id &&
    hasOnlyModelledKeys(value, ["$type", "id", "isCollection"]) &&
    Object.hasOwn(value, "isCollection") && value.isCollection === collection &&
    value.itemSubjectRef === itemDefinition && value.dataState === undefined;
}

function hasExactIoSets(
  inputs: ReadonlyArray<ElementRecord> | undefined,
  outputs: ReadonlyArray<ElementRecord> | undefined,
  inputMembers: ReadonlyArray<ElementRecord> | undefined,
  outputMembers: ReadonlyArray<ElementRecord> | undefined,
): boolean {
  const inputSet = inputs?.[0];
  const outputSet = outputs?.[0];
  return inputs?.length === 1 && outputs?.length === 1 &&
    inputSet !== undefined && outputSet !== undefined &&
    inputSet.$type === selectedTypes.inputSet && readId(inputSet) === "InputSet_Review" &&
    outputSet.$type === selectedTypes.outputSet && readId(outputSet) === "OutputSet_Review" &&
    hasOnlyModelledKeys(inputSet, ["$type", "id"]) &&
    hasOnlyModelledKeys(outputSet, ["$type", "id"]) &&
    sameReferences(inputSet.dataInputRefs, inputMembers) &&
    sameReferences(outputSet.dataOutputRefs, outputMembers) &&
    sameReferences(inputSet.outputSetRefs, [outputSet]) &&
    sameReferences(outputSet.inputSetRefs, [inputSet]) &&
    inputSet.optionalInputRefs === undefined &&
    inputSet.whileExecutingInputRefs === undefined &&
    inputSet.whileExecutingOutputRefs === undefined &&
    outputSet.optionalOutputRefs === undefined &&
    outputSet.whileExecutingInputRefs === undefined &&
    outputSet.whileExecutingOutputRefs === undefined;
}

function hasExactLoop(
  loop: ElementRecord | undefined,
  inputs: ReadonlyArray<ElementRecord> | undefined,
  outputs: ReadonlyArray<ElementRecord> | undefined,
  inputDataItem: ElementRecord | undefined,
  outputDataItem: ElementRecord | undefined,
  scalarItem: ElementRecord,
): boolean {
  return loop !== undefined &&
    loop.$type === selectedTypes.multiInstanceLoopCharacteristics &&
    hasOnlyModelledKeys(loop, [
      "$type", "isSequential", "behavior", "inputDataItem", "outputDataItem",
    ]) &&
    Object.hasOwn(loop, "isSequential") && loop.isSequential === true &&
    Object.hasOwn(loop, "behavior") && loop.behavior === "All" &&
    loop.loopDataInputRef === inputs?.[0] &&
    loop.loopDataOutputRef === outputs?.[1] &&
    isItemAware(inputDataItem, selectedTypes.dataInput, ids.inputDataItem, scalarItem, false) &&
    isItemAware(outputDataItem, selectedTypes.dataOutput, ids.outputDataItem, scalarItem, false) &&
    loop.loopCardinality === undefined &&
    loop.completionCondition === undefined &&
    loop.oneBehaviorEventRef === undefined &&
    loop.noneBehaviorEventRef === undefined &&
    loop.complexBehaviorDefinition === undefined;
}

function hasExactAssociations(
  inputAssociations: ReadonlyArray<ElementRecord> | undefined,
  outputAssociations: ReadonlyArray<ElementRecord> | undefined,
  inputObject: ElementRecord,
  inputReference: ElementRecord,
  outputObject: ElementRecord,
  outputReference: ElementRecord,
  inputs: ReadonlyArray<ElementRecord> | undefined,
  outputs: ReadonlyArray<ElementRecord> | undefined,
  inputDataItem: ElementRecord | undefined,
  outputDataItem: ElementRecord | undefined,
): boolean {
  return inputObject !== outputObject && inputReference !== outputReference &&
    inputAssociations?.length === 2 && outputAssociations?.length === 2 &&
    isAssociation(inputAssociations[0], selectedTypes.dataInputAssociation, ids.inputCollectionAssociation, inputReference, inputs?.[0]) &&
    isAssociation(inputAssociations[1], selectedTypes.dataInputAssociation, ids.inputItemAssociation, inputDataItem, inputs?.[1]) &&
    isAssociation(outputAssociations[0], selectedTypes.dataOutputAssociation, ids.outputItemAssociation, outputs?.[0], outputDataItem) &&
    isAssociation(outputAssociations[1], selectedTypes.dataOutputAssociation, ids.outputCollectionAssociation, outputs?.[1], outputReference);
}

function isAssociation(
  value: ElementRecord | undefined,
  type: string,
  id: string,
  source: ElementRecord | undefined,
  target: ElementRecord | undefined,
): boolean {
  return value !== undefined && source !== undefined && target !== undefined &&
    value.$type === type && readId(value) === id &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    sameReferences(value.sourceRef, [source]) && value.targetRef === target &&
    value.transformation === undefined && value.assignment === undefined;
}

function hasExactBoundary(
  boundary: ElementRecord,
  task: ElementRecord,
): boolean {
  const definitions = asElementArray(boundary.eventDefinitions);
  const definition = definitions?.[0];
  const duration = asElement(definition?.timeDuration);
  return boundary.$type === bpmnTypes.boundaryEventType &&
    readId(boundary) === ids.boundary &&
    hasOnlyModelledKeys(boundary, [
      "$type", "id", "attachedToRef", "cancelActivity", "eventDefinitions",
    ]) &&
    boundary.attachedToRef === task && boundary.cancelActivity === true &&
    definitions?.length === 1 && definition !== undefined &&
    definition.$type === bpmnTypes.timerEventDefinitionType &&
    readId(definition) === ids.boundaryDefinition &&
    hasOnlyModelledKeys(definition, ["$type", "id", "timeDuration"]) &&
    duration !== undefined && duration.$type === bpmnTypes.formalExpressionType &&
    hasOnlyModelledKeys(duration, ["$type", "body"]) &&
    duration.body === "PT1S";
}

function sameReferences(
  value: unknown,
  expected: ReadonlyArray<ElementRecord> | undefined,
): boolean {
  const actual = asElementArray(value);
  return expected !== undefined && actual?.length === expected.length &&
    actual.every((entry, index) => entry === expected[index]);
}

function hasTypeAndId(
  value: ElementRecord,
  type: string,
  id: string,
): boolean {
  return value.$type === type && readId(value) === id;
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
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
