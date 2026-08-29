/**
 * The exact source reader for the direct Activity data-input User Task profile.
 *
 * The reader resolves every reference against the parser's own object graph rather than by comparing
 * identifier strings, so a model whose `sourceRef` merely spells the Property's id without resolving
 * to that Property is refused instead of admitted. That is also how Process ownership is decided: the
 * association's source must be the very Property object this Process declares, which is what rejects a
 * foreign owner without a separate containment walk.
 *
 * Everything the profile excludes is refused by shape rather than ignored: a second association, a
 * DataOutput, an Assignment, a Transformation, a second InputSet, loop characteristics, or an extra
 * modelled key each fail the exact-key and exact-cardinality checks below.
 */
import {
  CheckedNodeKind,
  CheckedProcessKind,
  SemanticProfileId,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
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
  property: "bpmn:Property",
  inputOutputSpecification: "bpmn:InputOutputSpecification",
  dataInput: "bpmn:DataInput",
  inputSet: "bpmn:InputSet",
  outputSet: "bpmn:OutputSet",
  dataInputAssociation: "bpmn:DataInputAssociation",
});

const ids = Object.freeze({
  definitions: "Definitions_ActivityDataInputReview",
  targetNamespace: "https://bpmn-lean.org/scenarios/activity-data-input-review",
  process: "Process_ActivityDataInputReview",
  property: "Property_ReviewContext",
  start: "StartEvent_Review",
  startFlow: "Flow_Start_Review",
  task: "UserTask_Review",
  taskName: "Review invoice",
  ioSpecification: "IoSpecification_Review",
  dataInput: "DataInput_ReviewContext",
  dataInputName: "Review context",
  inputSet: "InputSet_Review",
  outputSet: "OutputSet_Review",
  association: "DataInputAssociation_ReviewContext",
  normalFlow: "Flow_Review_Completed",
  end: "EndEvent_Completed",
});

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  dataInputNode: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.DataInputUserTask }
  >;
}>;

export function compileActivityDataInputCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Activity data-input source must match the reviewed Process Property, ioSpecification, single InputSet, empty OutputSet, and one direct Data Input Association exactly.",
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
  const process = exact.process;
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
          process,
          messageArtifacts: undefined,
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        SemanticProfileId.ActivityDataInputUserTask,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.dataInputNode].sort(compareIds);
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
  if (!isAdmittedCheckedProcess(
    {
      processId: ids.process,
      definitionScopes,
      nodeScopes,
      sequenceFlowScopes,
      nodes,
      flows,
    },
    exact.definitions.expressionLanguage,
    SemanticProfileId.ActivityDataInputUserTask,
  )) {
    return unsupported(
      "The Activity data-input control route must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: SemanticProfileId.ActivityDataInputUserTask,
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
    readId(definitions) !== ids.definitions ||
    definitions.targetNamespace !== ids.targetNamespace
  ) {
    return undefined;
  }
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (roots?.length !== 1 || process === undefined || !isExactProcess(process)) {
    return undefined;
  }
  const properties = asElementArray(process.properties);
  const property = properties?.[0];
  const elements = asElementArray(process.flowElements);
  if (
    properties?.length !== 1 || property === undefined ||
    !isExactProperty(property) || elements?.length !== 5
  ) {
    return undefined;
  }
  const [start, startFlow, task, normalFlow, end] = elements;
  if (
    start === undefined || startFlow === undefined || task === undefined ||
    normalFlow === undefined || end === undefined ||
    !hasTypeAndId(start, bpmnTypes.startEventType, ids.start) ||
    !hasTypeAndId(startFlow, bpmnTypes.sequenceFlowType, ids.startFlow) ||
    !hasTypeAndId(normalFlow, bpmnTypes.sequenceFlowType, ids.normalFlow) ||
    !hasTypeAndId(end, bpmnTypes.endEventType, ids.end)
  ) {
    return undefined;
  }
  const dataInputNode = projectDataInputUserTask(task, property);
  return dataInputNode === undefined ? undefined : {
    definitions,
    process,
    ordinaryNodes: [start, end],
    sequenceFlows: [startFlow, normalFlow],
    dataInputNode,
  };
}

function projectDataInputUserTask(
  task: ElementRecord,
  property: ElementRecord,
): ExactSource["dataInputNode"] | undefined {
  if (
    task.$type !== bpmnTypes.userTaskType ||
    readId(task) !== ids.task ||
    task.name !== ids.taskName ||
    !hasOnlyModelledKeys(task, [
      "$type",
      "id",
      "name",
      "ioSpecification",
      "dataInputAssociations",
    ]) ||
    task.loopCharacteristics !== undefined ||
    task.dataOutputAssociations !== undefined
  ) {
    return undefined;
  }
  const io = asElement(task.ioSpecification);
  const inputs = asElementArray(io?.dataInputs);
  const inputSets = asElementArray(io?.inputSets);
  const outputSets = asElementArray(io?.outputSets);
  const associations = asElementArray(task.dataInputAssociations);
  const dataInput = inputs?.[0];
  if (
    io === undefined ||
    io.$type !== selectedTypes.inputOutputSpecification ||
    readId(io) !== ids.ioSpecification ||
    !hasOnlyModelledKeys(io, [
      "$type",
      "id",
      "dataInputs",
      "inputSets",
      "outputSets",
    ]) ||
    io.dataOutputs !== undefined ||
    inputs?.length !== 1 || dataInput === undefined ||
    !isRequiredScalarDataInput(dataInput) ||
    !hasExactInputSet(inputSets, dataInput) ||
    !hasEmptyOutputSet(outputSets) ||
    !hasExactAssociation(associations, property, dataInput)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.DataInputUserTask,
    id: ids.task,
    name: ids.taskName,
    directInput: {
      associationId: ids.association,
      sourcePropertyId: ids.property,
      targetDataInputId: ids.dataInput,
      targetDataInputName: ids.dataInputName,
    },
  };
}

function isExactProcess(value: ElementRecord): boolean {
  return value.$type === bpmnTypes.processType &&
    readId(value) === ids.process &&
    value.isExecutable === true &&
    hasOnlyModelledKeys(value, [
      "$type",
      "id",
      "isExecutable",
      "properties",
      "flowElements",
    ]);
}

/** The untyped Process Property this profile binds: no item subject, no data state, no name. */
function isExactProperty(value: ElementRecord): boolean {
  return value.$type === selectedTypes.property &&
    readId(value) === ids.property &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

/**
 * The one non-optional scalar DataInput.
 *
 * `isCollection` is read as `false` rather than required absent, because the machine-readable default
 * is already `false`: a source that spells the default out states nothing this profile can observe,
 * and refusing it would admit or reject models by whether they wrote a value already in force.
 */
function isRequiredScalarDataInput(value: ElementRecord): boolean {
  return value.$type === selectedTypes.dataInput &&
    readId(value) === ids.dataInput &&
    value.name === ids.dataInputName &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
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
    readId(inputSet) === ids.inputSet &&
    hasOnlyModelledKeys(inputSet, ["$type", "id", "dataInputRefs"]) &&
    sameReferences(inputSet.dataInputRefs, [dataInput]) &&
    inputSet.optionalInputRefs === undefined &&
    inputSet.whileExecutingInputRefs === undefined &&
    inputSet.outputSetRefs === undefined;
}

/** The empty OutputSet the profile reads as "no data is required to finish this Activity". */
function hasEmptyOutputSet(
  outputSets: ReadonlyArray<ElementRecord> | undefined,
): boolean {
  const outputSet = outputSets?.[0];
  return outputSets?.length === 1 && outputSet !== undefined &&
    outputSet.$type === selectedTypes.outputSet &&
    readId(outputSet) === ids.outputSet &&
    hasOnlyModelledKeys(outputSet, ["$type", "id"]) &&
    outputSet.dataOutputRefs === undefined &&
    outputSet.optionalOutputRefs === undefined &&
    outputSet.whileExecutingOutputRefs === undefined &&
    outputSet.inputSetRefs === undefined;
}

function hasExactAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  property: ElementRecord,
  dataInput: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$type === selectedTypes.dataInputAssociation &&
    readId(association) === ids.association &&
    hasOnlyModelledKeys(association, ["$type", "id", "sourceRef", "targetRef"]) &&
    sameReferences(association.sourceRef, [property]) &&
    association.targetRef === dataInput &&
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
