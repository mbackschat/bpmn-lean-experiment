/**
 * The exact predecessor source reader, delegating scalar Activity input/output projection.
 *
 * Both association directions and both set memberships resolve against the parser's object graph.
 * This makes Process ownership and cross-Activity exclusion properties of the resolved model rather
 * than identifier spelling. The exact-key and cardinality checks refuse every unselected data
 * member, pairing reference, mapping child, loop characteristic, or executable child.
 */
import {
  SemanticProfileId,
  CheckedNodeKind,
  CheckedProcessKind,
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
import { projectDataInputOutputUserTask } from "./activity-data-input-output-projection.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

const bpmnTypes = metamodelManifest.compilerProjection;

const ids = Object.freeze({
  definitions: "Definitions_ActivityDataInputOutputClaimAssessment",
  targetNamespace:
    "https://bpmn-lean.org/scenarios/activity-data-input-output-claim-assessment",
  process: "Process_ClaimAssessment",
  inputProperty: "Property_ClaimSummary",
  outputProperty: "Property_ClaimDecision",
  start: "StartEvent_ClaimReceived",
  startFlow: "Flow_ClaimReceived_Assess",
  task: "UserTask_AssessClaim",
  taskName: "Assess claim",
  ioSpecification: "IoSpecification_AssessClaim",
  dataInput: "DataInput_ClaimSummary",
  dataOutput: "DataOutput_ClaimDecision",
  inputSet: "InputSet_AssessClaim",
  outputSet: "OutputSet_AssessClaim",
  inputAssociation: "DataInputAssociation_ClaimSummary",
  outputAssociation: "DataOutputAssociation_ClaimDecision",
  normalFlow: "Flow_AssessClaim_Recorded",
  end: "EndEvent_Recorded",
});

type ExactSource = Readonly<{
  definitions: ElementRecord;
  process: ElementRecord;
  ordinaryNodes: ReadonlyArray<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
  dataInputOutputNode: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.DataInputOutputUserTask }
  >;
}>;

export function compileActivityDataInputOutputCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const exact = readExactSource(rootElement);
  if (exact === undefined) {
    return unsupported(
      "Activity data input/output source must match the reviewed two Process Properties, one ioSpecification, one required InputSet and OutputSet, and two direct associations exactly.",
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
      SemanticProfileId.ActivityDataInputOutputUserTask,
    );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.dataInputOutputNode].sort(compareIds);
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
      SemanticProfileId.ActivityDataInputOutputUserTask,
    )
  ) {
    return unsupported(
      "The Activity data input/output control route must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: SemanticProfileId.ActivityDataInputOutputUserTask,
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
    definitions.targetNamespace !== ids.targetNamespace ||
    !selectedBpmnElementIdsAreDistinct()
  ) {
    return undefined;
  }
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (roots?.length !== 1 || process === undefined || !isExactProcess(process)) {
    return undefined;
  }
  const properties = asElementArray(process.properties);
  const inputProperty = findExactProperty(properties, ids.inputProperty);
  const outputProperty = findExactProperty(properties, ids.outputProperty);
  const elements = asElementArray(process.flowElements);
  if (
    properties?.length !== 2 ||
    inputProperty === undefined ||
    outputProperty === undefined ||
    inputProperty === outputProperty ||
    elements?.length !== 5
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
  if (!hasExactTaskIdentity(task)) return undefined;
  const dataInputOutputNode = projectDataInputOutputUserTask(
    task,
    inputProperty,
    outputProperty,
  );
  return dataInputOutputNode === undefined ? undefined : {
    definitions,
    process,
    ordinaryNodes: [start, end],
    sequenceFlows: [startFlow, normalFlow],
    dataInputOutputNode,
  };
}

/** Keeps the predecessor's exact fixture restriction outside the reusable association projection. */
function hasExactTaskIdentity(task: ElementRecord): boolean {
  const io = asElement(task.ioSpecification);
  const expected: readonly [ElementRecord | undefined, string][] = [
    [task, ids.task], [io, ids.ioSpecification],
    [asElementArray(io?.dataInputs)?.[0], ids.dataInput],
    [asElementArray(io?.dataOutputs)?.[0], ids.dataOutput],
    [asElementArray(io?.inputSets)?.[0], ids.inputSet],
    [asElementArray(io?.outputSets)?.[0], ids.outputSet],
    [asElementArray(task.dataInputAssociations)?.[0], ids.inputAssociation],
    [asElementArray(task.dataOutputAssociations)?.[0], ids.outputAssociation],
  ];
  return task.name === ids.taskName && expected.every(([element, id]) =>
    element !== undefined && readId(element) === id);
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

function findExactProperty(
  properties: ReadonlyArray<ElementRecord> | undefined,
  expectedId: string,
): ElementRecord | undefined {
  return properties?.find((property) =>
    property.$type === "bpmn:Property" &&
    readId(property) === expectedId &&
    hasOnlyModelledKeys(property, ["$type", "id"]) &&
    property.itemSubjectRef === undefined &&
    property.dataState === undefined
  );
}

function selectedBpmnElementIdsAreDistinct(): boolean {
  const selectedIds = [
    ids.task,
    ids.inputAssociation,
    ids.outputAssociation,
    ids.inputProperty,
    ids.outputProperty,
    ids.dataInput,
    ids.dataOutput,
  ];
  return new Set(selectedIds).size === selectedIds.length;
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
