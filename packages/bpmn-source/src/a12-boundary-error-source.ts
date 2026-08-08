import {
  CheckedNodeKind,
  CheckedProcessKind,
  EffectOperation,
  EffectProtocol,
  MappingExpressionKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readForeignAttributes,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

export const a12BoundaryErrorProfile =
  "cibseven-2.0.0-a12-boundary-error-draft";

const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const protocol = "urn:bpmn-lean:a12-delegate:v1";
const handlerExpression = "#{createRelationshipLinkDelegate}";
const caughtCode = "LinkLimitReachedError";

/**
 * Admits only the project-authored A12-shaped boundary-error discriminator.
 *
 * Boundary metadata stays source-facing. Lowering turns the attached route
 * into an optional awaitEffect continuation without inventing an Error opcode.
 */
export function compileA12BoundaryError(
  rootElement: unknown,
  source: BpmnSourceIdentity,
): CheckedCompilationProjection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== "bpmn:Definitions" ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "$attrs",
      "id",
      "targetNamespace",
      "rootElements",
    ])
  ) {
    return unsupported(
      "The boundary-error profile requires one exact BPMN Definitions document.",
    );
  }
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.find(({ $type }) => $type === "bpmn:Process");
  const error = roots?.find(({ $type }) => $type === "bpmn:Error");
  if (
    roots?.length !== 2 ||
    process === undefined ||
    error === undefined ||
    !isExactRootError(error)
  ) {
    return unsupported(
      "The boundary-error profile requires one Process and one exact root Error.",
    );
  }
  return projectProcess(definitions, process, error, source);
}

function projectProcess(
  definitions: ElementRecord,
  process: ElementRecord,
  error: ElementRecord,
  source: BpmnSourceIdentity,
): CheckedCompilationProjection {
  if (
    !hasOnlyModelledKeys(process, [
      "$type",
      "id",
      "isExecutable",
      "flowElements",
    ]) ||
    process.isExecutable !== true
  ) {
    return unsupported("The boundary-error Process must be private and executable.");
  }
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId !== "Process_BoundaryError" || elements === undefined) {
    return unsupported("The boundary-error Process identity is not exact.");
  }
  const start = only(elements, "bpmn:StartEvent");
  const service = only(elements, "bpmn:ServiceTask");
  const boundary = only(elements, "bpmn:BoundaryEvent");
  const userTask = only(elements, "bpmn:UserTask");
  const ends = elements.filter(({ $type }) => $type === "bpmn:EndEvent");
  const sourceFlows = elements.filter(
    ({ $type }) => $type === "bpmn:SequenceFlow",
  );
  if (
    start === undefined ||
    service === undefined ||
    boundary === undefined ||
    userTask === undefined ||
    ends.length !== 2 ||
    sourceFlows.length !== 4 ||
    elements.length !== 10
  ) {
    return unsupported(
      "The boundary-error profile requires the exact Start → Service/Boundary → User Task/End topology.",
    );
  }
  const route = projectBoundaryRoute(boundary, service, error);
  const serviceTask = projectServiceTask(service, definitions, route);
  const checkedStart = projectPlainNode(
    start,
    CheckedNodeKind.NoneStartEvent,
    "StartEvent_None",
  );
  const checkedUser = projectUserTask(userTask);
  const checkedEnds = [
    projectExactNode(
      ends,
      "EndEvent_Normal",
      CheckedNodeKind.NoneEndEvent,
    ),
    projectExactNode(
      ends,
      "EndEvent_AfterError",
      CheckedNodeKind.NoneEndEvent,
    ),
  ];
  const flows = projectFlows(sourceFlows);
  if (
    route === undefined ||
    serviceTask === undefined ||
    checkedStart === undefined ||
    checkedUser === undefined ||
    checkedEnds.some((value) => value === undefined) ||
    flows === undefined ||
    !hasExactTopology(
      flows,
      checkedStart.id,
      serviceTask.id,
      route.boundaryEventId,
      checkedUser.id,
      checkedEnds as ReadonlyArray<
        Extract<CheckedNode, { kind: CheckedNodeKind.NoneEndEvent }>
      >,
    )
  ) {
    return unsupported(
      "The boundary-error binding, mapping, attachment, Error, or flow is outside the approved profile.",
    );
  }
  const nodes = [
    checkedStart,
    serviceTask,
    checkedUser,
    ...checkedEnds,
  ] as ReadonlyArray<CheckedNode>;
  if (!hasDistinctIds(processId, nodes, flows, route)) {
    return unsupported(
      "Process, node, boundary, Error, and Sequence Flow IDs must be distinct.",
    );
  }
  const rootScopeId = definitionScopeId(processId);
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: a12BoundaryErrorProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
      },
      processId,
      definitionScopes: [{
        id: rootScopeId,
        parentScopeId: null,
        originElementId: processId,
      }],
      nodeScopes: nodes.map(({ id: nodeId }) => ({
        nodeId,
        scopeId: rootScopeId,
      })).sort((left, right) =>
        compareCanonicalStrings(left.nodeId, right.nodeId)
      ),
      sequenceFlowScopes: flows.map(({ id: sequenceFlowId }) => ({
        sequenceFlowId,
        scopeId: rootScopeId,
      })).sort((left, right) =>
        compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)
      ),
      nodes: [...nodes].sort(compareIds),
      sequenceFlows: [...flows].sort(compareIds),
    },
    diagnostics: [],
  };
}

function projectServiceTask(
  value: ElementRecord,
  definitions: ElementRecord,
  route: ReturnType<typeof projectBoundaryRoute>,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  const id = readId(value);
  const attributes = readForeignAttributes(value, definitions);
  const inputOutput = readInputOutput(value.extensionElements);
  if (
    route === undefined ||
    id !== "CreateRelationshipLinkTask" ||
    value.implementation !== protocol ||
    !hasOnlyModelledKeys(value, [
      "$type",
      "id",
      "name",
      "implementation",
      "extensionElements",
    ]) ||
    attributes?.size !== 1 ||
    attributes.get(`${camundaNamespace}#delegateExpression`) !==
      handlerExpression ||
    inputOutput === undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ServiceTask,
    id,
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.MappedBoundaryError,
    },
    inputMappings: [{
      target: "relationshipModel",
      expression: {
        kind: MappingExpressionKind.StringLiteral,
        value: "RelationshipModel",
      },
    }],
    outputMappings: [{
      target: "relationshipLinkId",
      expression: {
        kind: MappingExpressionKind.LocalVariable,
        name: "newLinkId",
      },
    }],
    bpmnErrorRoute: route,
  };
}

function projectBoundaryRoute(
  boundary: ElementRecord,
  service: ElementRecord,
  error: ElementRecord,
) {
  const boundaryId = readId(boundary);
  const serviceId = readId(service);
  const attached = asElement(boundary.attachedToRef);
  const definitions = asElementArray(boundary.eventDefinitions);
  const definition = definitions?.[0];
  const referencedError = asElement(definition?.errorRef);
  if (
    boundaryId !== "BoundaryEvent_LinkLimitReached" ||
    boundary.name !== "Link Limit Reached Boundary" ||
    serviceId !== "CreateRelationshipLinkTask" ||
    readId(attached ?? {}) !== serviceId ||
    boundary.cancelActivity !== true ||
    !hasOnlyModelledKeys(boundary, [
      "$type",
      "id",
      "name",
      "eventDefinitions",
    ]) ||
    definitions?.length !== 1 ||
    definition?.$type !== "bpmn:ErrorEventDefinition" ||
    readId(definition) !== "ErrorEventDefinition_LinkLimitReached" ||
    !hasOnlyModelledKeys(definition, ["$type", "id"]) ||
    readId(referencedError ?? {}) !== readId(error)
  ) {
    return undefined;
  }
  return {
    boundaryEventId: boundaryId,
    boundaryEventName: "Link Limit Reached Boundary",
    attachedToRef: serviceId,
    errorDefinitionId: "ErrorEventDefinition_LinkLimitReached",
    errorElementId: "Error_LinkLimitReached",
    errorName: "Link Limit Reached",
    code: caughtCode,
    outputFlowId: "Flow_ErrorToUserTask",
  } as const;
}

function isExactRootError(value: ElementRecord): boolean {
  return value.$type === "bpmn:Error" &&
    readId(value) === "Error_LinkLimitReached" &&
    value.name === "Link Limit Reached" &&
    value.errorCode === caughtCode &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "errorCode"]);
}

function readInputOutput(value: unknown) {
  const extension = asElement(value);
  const values = asElementArray(extension?.values);
  const inputOutput = values?.[0];
  const children = asElementArray(inputOutput?.$children);
  const input = children?.[0];
  const output = children?.[1];
  if (
    extension?.$type !== "bpmn:ExtensionElements" ||
    !hasOnlyModelledKeys(extension, ["$type", "values"]) ||
    values?.length !== 1 ||
    inputOutput?.$type !== "camunda:inputOutput" ||
    !hasOnlyModelledKeys(inputOutput, ["$type", "$children"]) ||
    children?.length !== 2 ||
    !isParameter(
      input,
      "camunda:inputParameter",
      "relationshipModel",
      "RelationshipModel",
    ) ||
    !isParameter(
      output,
      "camunda:outputParameter",
      "relationshipLinkId",
      "${newLinkId}",
    )
  ) {
    return undefined;
  }
  return {
    inputParameter: {
      name: "relationshipModel" as const,
      body: "RelationshipModel" as const,
    },
    outputParameter: {
      name: "relationshipLinkId" as const,
      body: "${newLinkId}" as const,
    },
  };
}

function isParameter(
  value: ElementRecord | undefined,
  type: string,
  name: string,
  body: string,
): boolean {
  return value?.$type === type &&
    value.name === name &&
    value.$body === body &&
    hasOnlyModelledKeys(value, ["$type", "name", "$body"]);
}

function projectPlainNode<K extends
  CheckedNodeKind.NoneStartEvent | CheckedNodeKind.NoneEndEvent>(
  value: ElementRecord,
  kind: K,
  expectedId: string,
): Extract<CheckedNode, { kind: K }> | undefined {
  const id = readId(value);
  return id === expectedId &&
      hasOnlyModelledKeys(value, ["$type", "id"])
    ? ({ kind, id } as Extract<CheckedNode, { kind: K }>)
    : undefined;
}

function projectExactNode<K extends
  CheckedNodeKind.NoneStartEvent | CheckedNodeKind.NoneEndEvent>(
  values: ReadonlyArray<ElementRecord>,
  expectedId: string,
  kind: K,
): Extract<CheckedNode, { kind: K }> | undefined {
  const value = values.find(({ id }) => id === expectedId);
  return value === undefined
    ? undefined
    : projectPlainNode(value, kind, expectedId);
}

function projectUserTask(
  value: ElementRecord,
): Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }> | undefined {
  const id = readId(value);
  return id === "ExpectedUserTaskAfterBPMNError" &&
      value.name === "Expected User Task After BPMN Error" &&
      hasOnlyModelledKeys(value, ["$type", "id", "name"])
    ? {
        kind: CheckedNodeKind.UserTask,
        id,
        name: value.name,
      }
    : undefined;
}

function projectFlows(
  values: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const flows = values.map((flow) => {
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const id = readId(flow);
    const sourceId = readId(source ?? {});
    const targetId = readId(target ?? {});
    return hasOnlyModelledKeys(flow, ["$type", "id"]) &&
        id !== undefined &&
        sourceId !== undefined &&
        targetId !== undefined
      ? { id, sourceId, targetId, condition: null }
      : undefined;
  });
  return flows.every((flow) => flow !== undefined)
    ? (flows as ReadonlyArray<CheckedSequenceFlow>)
    : undefined;
}

function hasExactTopology(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  startId: string,
  serviceId: string,
  boundaryId: string,
  userTaskId: string,
  ends: ReadonlyArray<
    Extract<CheckedNode, { kind: CheckedNodeKind.NoneEndEvent }>
  >,
): boolean {
  const endIds = new Set(ends.map(({ id }) => id));
  return endIds.has("EndEvent_Normal") &&
    endIds.has("EndEvent_AfterError") &&
    hasFlow(flows, startId, serviceId) &&
    hasFlow(flows, serviceId, "EndEvent_Normal") &&
    hasFlow(flows, boundaryId, userTaskId) &&
    hasFlow(flows, userTaskId, "EndEvent_AfterError");
}

function hasFlow(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some(
    (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
  );
}

function hasDistinctIds(
  processId: string,
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  route: NonNullable<ReturnType<typeof projectBoundaryRoute>>,
): boolean {
  const ids = [
    processId,
    ...nodes.map(({ id }) => id),
    ...flows.map(({ id }) => id),
    route.boundaryEventId,
    route.errorDefinitionId,
    route.errorElementId,
  ];
  return new Set(ids).size === ids.length;
}

function only(
  values: ReadonlyArray<ElementRecord>,
  type: string,
): ElementRecord | undefined {
  const matches = values.filter(({ $type }) => $type === type);
  return matches.length === 1 ? matches[0] : undefined;
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
    diagnostics: [
      {
        code: BpmnSourceDiagnosticCode.UnsupportedModel,
        element: null,
        evidence,
      },
    ],
  };
}
