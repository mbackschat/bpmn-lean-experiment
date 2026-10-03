/** Parser-owned scalar Activity interfaces shared by exact and structural source admission. */
import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";
import { asElement, asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { hasValidDataInputOutputUserTaskIdentities } from "./activity-data-input-output-checked-admission.js";
import { hasOnlyProjectedFlowElementKeys, ProjectedFlowElementShape } from "./projected-flow-element-keys.js";

type DataInputOutputUserTask = Extract<CheckedNode, { kind: CheckedNodeKind.DataInputOutputUserTask }>;

const selectedTypes = Object.freeze({
  property: "bpmn:Property",
  inputOutputSpecification: "bpmn:InputOutputSpecification",
  dataInput: "bpmn:DataInput",
  dataOutput: "bpmn:DataOutput",
  inputSet: "bpmn:InputSet",
  outputSet: "bpmn:OutputSet",
  dataInputAssociation: "bpmn:DataInputAssociation",
  dataOutputAssociation: "bpmn:DataOutputAssociation",
});

/** Resolves the existing scalar contract by object identity, independently of business IDs. */
export function projectDataInputOutputUserTask(
  task: ElementRecord,
  inputProperty: ElementRecord,
  outputProperty: ElementRecord,
): DataInputOutputUserTask | undefined {
  const taskId = readId(task);
  if (
    task.$type !== "bpmn:UserTask" || taskId === undefined ||
    (task.name !== undefined && typeof task.name !== "string") ||
    !hasOnlyProjectedFlowElementKeys(task, ProjectedFlowElementShape.DataInputOutputUserTask) ||
    task.loopCharacteristics !== undefined
  ) {
    return undefined;
  }
  const io = asElement(task.ioSpecification);
  const dataInputs = asElementArray(io?.dataInputs);
  const dataOutputs = asElementArray(io?.dataOutputs);
  const dataInput = dataInputs?.[0];
  const dataOutput = dataOutputs?.[0];
  if (
    io === undefined ||
    io.$type !== selectedTypes.inputOutputSpecification ||
    readId(io) === undefined ||
    !hasOnlyModelledKeys(io, [
      "$type",
      "id",
      "dataInputs",
      "dataOutputs",
      "inputSets",
      "outputSets",
    ]) ||
    dataInputs?.length !== 1 || dataInput === undefined ||
    dataOutputs?.length !== 1 || dataOutput === undefined ||
    dataInput === dataOutput ||
    !isRequiredScalarDataInput(dataInput) ||
    !isRequiredScalarDataOutput(dataOutput) ||
    !hasExactInputSet(asElementArray(io.inputSets), dataInput) ||
    !hasExactOutputSet(asElementArray(io.outputSets), dataOutput) ||
    !hasExactInputAssociation(
      asElementArray(task.dataInputAssociations),
      inputProperty,
      dataInput,
    ) ||
    !hasExactOutputAssociation(
      asElementArray(task.dataOutputAssociations),
      dataOutput,
      outputProperty,
    )
  ) {
    return undefined;
  }
  const inputAssociation = asElementArray(task.dataInputAssociations)?.[0];
  const outputAssociation = asElementArray(task.dataOutputAssociations)?.[0];
  const inputPropertyId = readId(inputProperty);
  const outputPropertyId = readId(outputProperty);
  const inputId = readId(dataInput);
  const outputId = readId(dataOutput);
  const inputAssociationId = inputAssociation === undefined ? undefined : readId(inputAssociation);
  const outputAssociationId = outputAssociation === undefined ? undefined : readId(outputAssociation);
  if (inputPropertyId === undefined || outputPropertyId === undefined || inputId === undefined ||
      outputId === undefined || inputAssociationId === undefined || outputAssociationId === undefined) return undefined;
  const node: DataInputOutputUserTask = {
    kind: CheckedNodeKind.DataInputOutputUserTask,
    id: taskId,
    name: optionalName(task),
    directInput: {
      associationId: inputAssociationId,
      sourcePropertyId: inputPropertyId,
      targetDataInputId: inputId,
      targetDataInputName: optionalName(dataInput),
    },
    directOutput: {
      associationId: outputAssociationId,
      sourceDataOutputId: outputId,
      sourceDataOutputName: optionalName(dataOutput),
      targetPropertyId: outputPropertyId,
    },
  };
  return hasValidDataInputOutputUserTaskIdentities(node) ? node : undefined;
}

/** SPC permits only plain Process-owned scalar Properties, including unused declarations. */
export function scalarProcessProperties(process: ElementRecord): readonly ElementRecord[] | undefined {
  const properties = process.properties === undefined ? [] : asElementArray(process.properties);
  return properties?.every((property) => property.$type === selectedTypes.property &&
    readId(property) !== undefined && hasOnlyModelledKeys(property, ["$type", "id", "name"]) &&
    (property.name === undefined || typeof property.name === "string") &&
    property.itemSubjectRef === undefined && property.dataState === undefined)
    ? properties : undefined;
}

/** Both Process endpoints must be members of the same root's actual parser-owned collection. */
export function projectOwnedDataInputOutputUserTask(task: ElementRecord, process: ElementRecord): DataInputOutputUserTask | undefined {
  const properties = scalarProcessProperties(process);
  const inputAssociation = asElementArray(task.dataInputAssociations)?.[0];
  const outputAssociation = asElementArray(task.dataOutputAssociations)?.[0];
  const source = asElementArray(inputAssociation?.sourceRef)?.[0];
  const target = asElement(outputAssociation?.targetRef);
  return source !== undefined && target !== undefined && properties?.includes(source) && properties.includes(target)
    ? projectDataInputOutputUserTask(task, source, target) : undefined;
}

function isRequiredScalarDataInput(value: ElementRecord): boolean {
  return value.$type === selectedTypes.dataInput &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    (value.name === undefined || typeof value.name === "string") &&
    value.isCollection === false &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

function isRequiredScalarDataOutput(value: ElementRecord): boolean {
  return value.$type === selectedTypes.dataOutput &&
    readId(value) !== undefined &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    (value.name === undefined || typeof value.name === "string") &&
    value.isCollection === false &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

function hasExactInputSet(
  inputSets: ReadonlyArray<ElementRecord> | undefined,
  dataInput: ElementRecord,
): boolean {
  const inputSet = inputSets?.[0];
  return inputSets?.length === 1 && inputSet !== undefined &&
    inputSet.$type === selectedTypes.inputSet &&
    readId(inputSet) !== undefined &&
    hasOnlyModelledKeys(inputSet, ["$type", "id", "dataInputRefs"]) &&
    sameReferences(inputSet.dataInputRefs, [dataInput]) &&
    inputSet.optionalInputRefs === undefined &&
    inputSet.whileExecutingInputRefs === undefined &&
    inputSet.outputSetRefs === undefined;
}

function hasExactOutputSet(
  outputSets: ReadonlyArray<ElementRecord> | undefined,
  dataOutput: ElementRecord,
): boolean {
  const outputSet = outputSets?.[0];
  return outputSets?.length === 1 && outputSet !== undefined &&
    outputSet.$type === selectedTypes.outputSet &&
    readId(outputSet) !== undefined &&
    hasOnlyModelledKeys(outputSet, ["$type", "id", "dataOutputRefs"]) &&
    sameReferences(outputSet.dataOutputRefs, [dataOutput]) &&
    outputSet.optionalOutputRefs === undefined &&
    outputSet.whileExecutingOutputRefs === undefined &&
    outputSet.inputSetRefs === undefined;
}

function hasExactInputAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  inputProperty: ElementRecord,
  dataInput: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$type === selectedTypes.dataInputAssociation &&
    readId(association) !== undefined &&
    hasOnlyModelledKeys(association, ["$type", "id", "sourceRef", "targetRef"]) &&
    sameReferences(association.sourceRef, [inputProperty]) &&
    association.targetRef === dataInput &&
    association.transformation === undefined &&
    association.assignment === undefined;
}

function hasExactOutputAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  dataOutput: ElementRecord,
  outputProperty: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$type === selectedTypes.dataOutputAssociation &&
    readId(association) !== undefined &&
    hasOnlyModelledKeys(association, ["$type", "id", "sourceRef", "targetRef"]) &&
    sameReferences(association.sourceRef, [dataOutput]) &&
    association.targetRef === outputProperty &&
    association.transformation === undefined &&
    association.assignment === undefined;
}

function optionalName(value: ElementRecord): string | null {
  return typeof value.name === "string" ? value.name : null;
}

function sameReferences(
  value: unknown,
  expected: ReadonlyArray<ElementRecord>,
): boolean {
  const actual = asElementArray(value);
  return actual?.length === expected.length &&
    actual.every((entry, index) => entry === expected[index]);
}
