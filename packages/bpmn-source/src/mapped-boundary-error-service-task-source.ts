import {
  CheckedNodeKind,
  CheckedProcessKind,
  SemanticProfileId,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedBpmnErrorRoute,
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  orderedElementDiagnostics,
} from "./admission-diagnostics.js";
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import {
  hasFlow,
  projectMappedBoundaryIdentityNode,
  projectMappedBoundarySequenceFlows,
  projectMappedBoundaryServiceTask,
} from "./mapped-service-task-source.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  FlowElementProjectionProfile,
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
  projectedFlowElementKeyRejections,
} from "./projected-flow-element-keys.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

export const mappedBoundaryErrorServiceTaskProfile =
  SemanticProfileId.MappedBoundaryErrorServiceTask;

/** Projects the bounded neutral mapped-boundary-Error Service Task source shape. */
export function compileMappedBoundaryErrorServiceTask(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  policy: MappedServiceTaskSourcePolicy,
): CheckedCompilationProjection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== "bpmn:Definitions" ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "rootElements",
    ])
  ) {
    return unsupported(
      "The mapped-boundary-Error profile requires one exact BPMN Definitions document.",
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
      "The mapped-boundary-Error profile requires one Process and one exact root Error.",
    );
  }
  return projectProcess(definitions, process, error, source, policy);
}

function projectProcess(
  definitions: ElementRecord,
  process: ElementRecord,
  error: ElementRecord,
  source: BpmnSourceIdentity,
  policy: MappedServiceTaskSourcePolicy,
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
    return unsupported(
      "The mapped-boundary-Error Process must be private and executable.",
    );
  }
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) {
    return unsupported(
      "The mapped-boundary-Error Process and executable elements require IDs.",
    );
  }
  const start = only(elements, "bpmn:StartEvent");
  const service = only(elements, "bpmn:ServiceTask");
  const boundary = only(elements, "bpmn:BoundaryEvent");
  const userTask = only(elements, "bpmn:UserTask");
  const ends = elements.filter(({ $type }) => $type === "bpmn:EndEvent");
  const sourceFlows = elements.filter(({ $type }) =>
    $type === "bpmn:SequenceFlow"
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
      "The mapped-boundary-Error profile requires the exact Service Task, boundary, User Task topology.",
    );
  }
  const keyRejections = projectedFlowElementKeyRejections(
    definitions,
    elements,
    FlowElementProjectionProfile.MappedBoundaryErrorServiceTask,
  );
  if (keyRejections === undefined) {
    return unsupported(
      "Every mapped-boundary-Error flow element requires an exact key inventory entry.",
    );
  }
  if (keyRejections.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(keyRejections),
    };
  }
  const flows = projectMappedBoundarySequenceFlows(sourceFlows);
  const route = flows === undefined
    ? undefined
    : projectBoundaryRoute(boundary, service, error, flows);
  const serviceTask = route === undefined
    ? undefined
    : projectMappedBoundaryServiceTask(
        service,
        definitions,
        policy,
        route,
      );
  const checkedStart = projectMappedBoundaryIdentityNode(
    start,
    CheckedNodeKind.NoneStartEvent,
  );
  const checkedUser = projectUserTask(userTask);
  const checkedEnds = ends.map((end) =>
    projectMappedBoundaryIdentityNode(end, CheckedNodeKind.NoneEndEvent)
  );
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
      "The mapped-boundary-Error binding, mapping, attachment, Error, or flow is outside the selected profile.",
    );
  }
  const nodes = [
    checkedStart,
    serviceTask,
    checkedUser,
    ...checkedEnds,
  ] as ReadonlyArray<CheckedNode>;
  return accepted(source, policy, processId, nodes, flows, route);
}

function projectBoundaryRoute(
  boundary: ElementRecord,
  service: ElementRecord,
  error: ElementRecord,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): CheckedBpmnErrorRoute | undefined {
  const boundaryId = readId(boundary);
  const serviceId = readId(service);
  const attached = asElement(boundary.attachedToRef);
  const definitions = asElementArray(boundary.eventDefinitions);
  const definition = definitions?.[0];
  const referencedError = asElement(definition?.errorRef);
  const errorElementId = readId(error);
  const errorDefinitionId = readId(definition ?? {});
  const outputFlow = flows.find(({ sourceId }) => sourceId === boundaryId);
  if (
    boundaryId === undefined ||
    serviceId === undefined ||
    readId(attached ?? {}) !== serviceId ||
    boundary.cancelActivity !== true ||
    !hasOnlyProjectedFlowElementKeys(
      boundary,
      ProjectedFlowElementShape.MappedBoundaryEvent,
    ) ||
    definitions?.length !== 1 ||
    definition?.$type !== "bpmn:ErrorEventDefinition" ||
    errorDefinitionId === undefined ||
    !hasOnlyModelledKeys(definition, ["$type", "id"]) ||
    errorElementId === undefined ||
    readId(referencedError ?? {}) !== errorElementId ||
    typeof error.errorCode !== "string" ||
    error.errorCode.length === 0 ||
    outputFlow === undefined
  ) {
    return undefined;
  }
  return {
    boundaryEventId: boundaryId,
    boundaryEventName: typeof boundary.name === "string" ? boundary.name : null,
    attachedToRef: serviceId,
    errorDefinitionId,
    errorElementId,
    errorName: typeof error.name === "string" ? error.name : null,
    code: error.errorCode,
    outputFlowId: outputFlow.id,
  };
}

function isExactRootError(value: ElementRecord): boolean {
  return value.$type === "bpmn:Error" &&
    readId(value) !== undefined &&
    typeof value.errorCode === "string" &&
    value.errorCode.length > 0 &&
    (value.name === undefined || typeof value.name === "string") &&
    hasOnlyModelledKeys(value, ["$type", "id", "name", "errorCode"]);
}

function projectUserTask(
  value: ElementRecord,
): Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }> | undefined {
  const id = readId(value);
  return id !== undefined &&
      (value.name === undefined || typeof value.name === "string") &&
      hasOnlyProjectedFlowElementKeys(value, ProjectedFlowElementShape.PlainNode)
    ? {
        kind: CheckedNodeKind.UserTask,
        id,
        name: typeof value.name === "string" ? value.name : null,
      }
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
  const normalTargets = flows.filter(({ sourceId }) => sourceId === serviceId);
  const caughtTargets = flows.filter(({ sourceId }) => sourceId === userTaskId);
  const endIds = new Set(ends.map(({ id }) => id));
  return hasFlow(flows, startId, serviceId) &&
    hasFlow(flows, boundaryId, userTaskId) &&
    normalTargets.length === 1 &&
    caughtTargets.length === 1 &&
    normalTargets[0]?.targetId !== caughtTargets[0]?.targetId &&
    endIds.has(normalTargets[0]?.targetId ?? "") &&
    endIds.has(caughtTargets[0]?.targetId ?? "");
}

function accepted(
  source: BpmnSourceIdentity,
  policy: MappedServiceTaskSourcePolicy,
  processId: string,
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  route: CheckedBpmnErrorRoute,
): CheckedCompilationProjection {
  const ids = [
    processId,
    ...nodes.map(({ id }) => id),
    ...flows.map(({ id }) => id),
    route.boundaryEventId,
    route.errorDefinitionId,
    route.errorElementId,
  ];
  if (new Set(ids).size !== ids.length) {
    return unsupported(
      "Process, node, boundary, Error, and Sequence Flow IDs must be distinct.",
    );
  }
  const rootScopeId = definitionScopeId(processId);
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: mappedBoundaryErrorServiceTaskProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
        sourceOverlay: policy.sourceOverlay,
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
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}
