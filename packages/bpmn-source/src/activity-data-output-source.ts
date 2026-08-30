/**
 * The exact source reader for the direct Activity data-output User Task profile.
 *
 * Like its input sibling, the reader resolves every reference against the parser's own object graph
 * rather than by comparing identifier strings, so a model whose `targetRef` merely spells the
 * Property's id without resolving to that Property is refused instead of admitted. Process ownership
 * is decided the same way: the association's target must be the very Property object this Process
 * declares.
 *
 * The direction is the mirror of the input reader and is the one thing a reader copied from it would
 * get wrong. Here the Activity-owned `DataOutput` is the association's `sourceRef` and the Process
 * `Property` is its `targetRef`, and the `InputSet` is the empty one while the `OutputSet` carries
 * the single reference.
 *
 * Everything the profile excludes is refused by shape rather than ignored: a second association, a
 * DataInput, an Assignment, a Transformation, a second OutputSet, an `inputSetRefs` pairing, loop
 * characteristics, or an extra modelled key each fail the exact-key and exact-cardinality checks.
 */
import {
  CheckedNodeKind,
  CheckedProcessKind,
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

const bpmnTypes = metamodelManifest.compilerProjection;
const selectedTypes = Object.freeze({
  property: "bpmn:Property",
  inputOutputSpecification: "bpmn:InputOutputSpecification",
  dataOutput: "bpmn:DataOutput",
  inputSet: "bpmn:InputSet",
  outputSet: "bpmn:OutputSet",
  dataOutputAssociation: "bpmn:DataOutputAssociation",
});

const ids = Object.freeze({
  definitions: "Definitions_ActivityDataOutputUnderwriting",
  targetNamespace:
    "https://bpmn-lean.org/scenarios/activity-data-output-underwriting",
  process: "Process_ActivityDataOutputUnderwriting",
  property: "Property_UnderwritingOutcome",
  start: "StartEvent_Application",
  startFlow: "Flow_Application_Decide",
  task: "UserTask_Decide",
  taskName: "Decide credit application",
  ioSpecification: "IoSpecification_Decide",
  dataOutput: "DataOutput_Decision",
  dataOutputName: "Underwriting decision",
  inputSet: "InputSet_Decide",
  outputSet: "OutputSet_Decide",
  association: "DataOutputAssociation_Decision",
  normalFlow: "Flow_Decide_Recorded",
  end: "EndEvent_Recorded",
});

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  dataOutputNode: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.DataOutputUserTask }
  >;
}>;

export function compileActivityDataOutputCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Activity data-output source must match the reviewed Process Property, ioSpecification, empty InputSet, single OutputSet, and one direct Data Output Association exactly.",
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
      SemanticProfileId.ActivityDataOutputUserTask,
    );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.dataOutputNode].sort(compareIds);
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
      SemanticProfileId.ActivityDataOutputUserTask,
    )
  ) {
    return unsupported(
      "The Activity data-output control route must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: SemanticProfileId.ActivityDataOutputUserTask,
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
  const dataOutputNode = projectDataOutputUserTask(task, property);
  return dataOutputNode === undefined ? undefined : {
    definitions,
    process,
    ordinaryNodes: [start, end],
    sequenceFlows: [startFlow, normalFlow],
    dataOutputNode,
  };
}

function projectDataOutputUserTask(
  task: ElementRecord,
  property: ElementRecord,
): ExactSource["dataOutputNode"] | undefined {
  if (
    task.$type !== bpmnTypes.userTaskType ||
    readId(task) !== ids.task ||
    task.name !== ids.taskName ||
    !hasOnlyModelledKeys(task, [
      "$type",
      "id",
      "name",
      "ioSpecification",
      "dataOutputAssociations",
    ]) ||
    task.loopCharacteristics !== undefined ||
    task.dataInputAssociations !== undefined
  ) {
    return undefined;
  }
  const io = asElement(task.ioSpecification);
  const outputs = asElementArray(io?.dataOutputs);
  const inputSets = asElementArray(io?.inputSets);
  const outputSets = asElementArray(io?.outputSets);
  const associations = asElementArray(task.dataOutputAssociations);
  const dataOutput = outputs?.[0];
  if (
    io === undefined ||
    io.$type !== selectedTypes.inputOutputSpecification ||
    readId(io) !== ids.ioSpecification ||
    !hasOnlyModelledKeys(io, [
      "$type",
      "id",
      "dataOutputs",
      "inputSets",
      "outputSets",
    ]) ||
    io.dataInputs !== undefined ||
    outputs?.length !== 1 || dataOutput === undefined ||
    !isRequiredScalarDataOutput(dataOutput) ||
    !hasEmptyInputSet(inputSets) ||
    !hasExactOutputSet(outputSets, dataOutput) ||
    !hasExactAssociation(associations, property, dataOutput)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.DataOutputUserTask,
    id: ids.task,
    name: ids.taskName,
    directOutput: {
      associationId: ids.association,
      sourceDataOutputId: ids.dataOutput,
      sourceDataOutputName: ids.dataOutputName,
      targetPropertyId: ids.property,
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

/** The untyped Process Property this profile writes: no item subject, no data state, no name. */
function isExactProperty(value: ElementRecord): boolean {
  return value.$type === selectedTypes.property &&
    readId(value) === ids.property &&
    hasOnlyModelledKeys(value, ["$type", "id"]) &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

/**
 * The one non-optional scalar DataOutput.
 *
 * `isCollection` is read as `false` rather than required absent for the same reason as on the input
 * side: the machine-readable default is already `false`, so a source that spells it out states
 * nothing this profile can observe.
 */
function isRequiredScalarDataOutput(value: ElementRecord): boolean {
  return value.$type === selectedTypes.dataOutput &&
    readId(value) === ids.dataOutput &&
    value.name === ids.dataOutputName &&
    hasOnlyModelledKeys(value, ["$type", "id", "name"]) &&
    value.isCollection === false &&
    value.itemSubjectRef === undefined &&
    value.dataState === undefined;
}

/** The empty InputSet the profile reads as "no data is required to start this Activity". */
function hasEmptyInputSet(
  inputSets: ReadonlyArray<ElementRecord> | undefined,
): boolean {
  const inputSet = inputSets?.[0];
  return inputSets?.length === 1 && inputSet !== undefined &&
    inputSet.$type === selectedTypes.inputSet &&
    readId(inputSet) === ids.inputSet &&
    hasOnlyModelledKeys(inputSet, ["$type", "id"]) &&
    inputSet.dataInputRefs === undefined &&
    inputSet.optionalInputRefs === undefined &&
    inputSet.whileExecutingInputRefs === undefined &&
    inputSet.outputSetRefs === undefined;
}

/**
 * The one OutputSet, referencing exactly the declared output.
 *
 * `optionalOutputRefs` and `whileExecutingOutputRefs` are required absent rather than merely empty
 * because either would change what "required" means for this member: an optional output need not be
 * available at completion, and a while-executing one is produced before it.
 */
function hasExactOutputSet(
  outputSets: ReadonlyArray<ElementRecord> | undefined,
  dataOutput: ElementRecord,
): boolean {
  const outputSet = outputSets?.[0];
  return outputSets?.length === 1 && outputSet !== undefined &&
    outputSet.$type === selectedTypes.outputSet &&
    readId(outputSet) === ids.outputSet &&
    hasOnlyModelledKeys(outputSet, ["$type", "id", "dataOutputRefs"]) &&
    sameReferences(outputSet.dataOutputRefs, [dataOutput]) &&
    outputSet.optionalOutputRefs === undefined &&
    outputSet.whileExecutingOutputRefs === undefined &&
    outputSet.inputSetRefs === undefined;
}

function hasExactAssociation(
  associations: ReadonlyArray<ElementRecord> | undefined,
  property: ElementRecord,
  dataOutput: ElementRecord,
): boolean {
  const association = associations?.[0];
  return associations?.length === 1 && association !== undefined &&
    association.$type === selectedTypes.dataOutputAssociation &&
    readId(association) === ids.association &&
    hasOnlyModelledKeys(association, [
      "$type",
      "id",
      "sourceRef",
      "targetRef",
    ]) &&
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
