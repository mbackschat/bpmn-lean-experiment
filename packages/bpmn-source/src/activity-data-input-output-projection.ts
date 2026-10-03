/** Parser-owned scalar Activity interfaces shared by exact and structural source admission. */
import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { ActivityDataInputSource, ActivityDataOutputTarget, CheckedNode } from "@bpmn-lean/semantic-core";
import { asElement, asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { projectScalarIoSpecification } from "./scalar-io-specification.js";
import { hasValidDataInputOutputUserTaskIdentities } from "./activity-data-input-output-checked-admission.js";
import { hasOnlyProjectedFlowElementKeys, ProjectedFlowElementShape } from "./projected-flow-element-keys.js";

type DataInputOutputUserTask = Extract<CheckedNode, { kind: CheckedNodeKind.DataInputOutputUserTask }>;

const selectedTypes = Object.freeze({
  property: "bpmn:Property",
  dataInputAssociation: "bpmn:DataInputAssociation",
  dataOutputAssociation: "bpmn:DataOutputAssociation",
});

/** Resolves the existing scalar contract by object identity, independently of business IDs. */
export function projectDataInputOutputUserTask(
  task: ElementRecord,
  inputProperty: ElementRecord,
  outputProperty: ElementRecord,
): DataInputOutputUserTask | undefined {
  const selected = projectScalarIoSpecification(task);
  const inputId = readId(inputProperty);
  const outputId = readId(outputProperty);
  if (selected === undefined || selected.declaration.inputSet.name !== null ||
      selected.declaration.outputSet.name !== null || inputId === undefined || outputId === undefined) return undefined;
  return projectTask(task, inputProperty, outputProperty,
    { kind: "property", propertyId: inputId }, { kind: "property", propertyId: outputId });
}

function projectTask(
  task: ElementRecord,
  inputElement: ElementRecord,
  outputElement: ElementRecord,
  source: ActivityDataInputSource,
  target: ActivityDataOutputTarget,
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
  const selected = projectScalarIoSpecification(task);
  if (selected === undefined) return undefined;
  const { input: dataInput, output: dataOutput } = selected;
  if (
    !hasExactInputAssociation(
      asElementArray(task.dataInputAssociations),
      inputElement,
      dataInput,
      task,
    ) ||
    !hasExactOutputAssociation(
      asElementArray(task.dataOutputAssociations),
      dataOutput,
      outputElement,
      task,
    )
  ) {
    return undefined;
  }
  const inputAssociation = asElementArray(task.dataInputAssociations)?.[0];
  const outputAssociation = asElementArray(task.dataOutputAssociations)?.[0];
  const inputId = readId(dataInput);
  const outputId = readId(dataOutput);
  const inputAssociationId = inputAssociation === undefined ? undefined : readId(inputAssociation);
  const outputAssociationId = outputAssociation === undefined ? undefined : readId(outputAssociation);
  if (inputId === undefined ||
      outputId === undefined || inputAssociationId === undefined || outputAssociationId === undefined) return undefined;
  const node: DataInputOutputUserTask = {
    kind: CheckedNodeKind.DataInputOutputUserTask,
    id: taskId,
    name: optionalName(task),
    directInput: {
      associationId: inputAssociationId,
      source,
      targetDataInputId: inputId,
      targetDataInputName: optionalName(dataInput),
    },
    directOutput: {
      associationId: outputAssociationId,
      sourceDataOutputId: outputId,
      sourceDataOutputName: optionalName(dataOutput),
      target,
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

/** CDATA-OWNER-01 resolves endpoints only in the task's actual containing Process. */
export function projectProcessDataInputOutputUserTask(task: ElementRecord, process: ElementRecord): DataInputOutputUserTask | undefined {
  if (process.$type !== "bpmn:Process" || task.$parent !== process ||
      asElementArray(process.flowElements)?.filter((element) => element === task).length !== 1) return undefined;
  const properties = scalarProcessProperties(process);
  if (properties === undefined || properties.some((property) => property.$parent !== process)) return undefined;
  const io = process.ioSpecification === undefined ? undefined : projectScalarIoSpecification(process);
  if (process.ioSpecification !== undefined && io === undefined) return undefined;
  const inputAssociation = asElementArray(task.dataInputAssociations)?.[0];
  const outputAssociation = asElementArray(task.dataOutputAssociations)?.[0];
  const source = asElementArray(inputAssociation?.sourceRef)?.[0];
  const target = asElement(outputAssociation?.targetRef);
  if (source === undefined || target === undefined) return undefined;
  const sourceId = readId(source);
  const targetId = readId(target);
  if (sourceId === undefined || targetId === undefined) return undefined;
  const input: ActivityDataInputSource | undefined = properties.includes(source)
    ? { kind: "property", propertyId: sourceId }
    : source === io?.input ? { kind: "processDataInput", dataInputId: sourceId } : undefined;
  const output: ActivityDataOutputTarget | undefined = properties.includes(target)
    ? { kind: "property", propertyId: targetId }
    : target === io?.output ? { kind: "processDataOutput", dataOutputId: targetId } : undefined;
  return input === undefined || output === undefined ? undefined : projectTask(task, source, target, input, output);
}

export function hasExactInputAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  inputProperty: ElementRecord,
  dataInput: ElementRecord,
  owner: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$parent === owner &&
    association.$type === selectedTypes.dataInputAssociation &&
    readId(association) !== undefined &&
    hasOnlyModelledKeys(association, ["$type", "id", "sourceRef", "targetRef"]) &&
    sameReferences(association.sourceRef, [inputProperty]) &&
    association.targetRef === dataInput &&
    association.transformation === undefined &&
    association.assignment === undefined;
}

export function hasExactOutputAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  dataOutput: ElementRecord,
  outputProperty: ElementRecord,
  owner: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$parent === owner &&
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
