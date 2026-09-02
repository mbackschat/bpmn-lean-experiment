/** Strict checked-graph admission for the exact Compensation source checkpoint. */
import {
  CheckedNodeKind,
  EffectOperation,
  EffectProtocol,
  GatewayDirection,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedCompensationBody,
  CheckedCompensationSubject,
  CheckedNode,
} from "@bpmn-lean/semantic-core";

import type { CheckedProcessGraph } from "./checked-process-graph-admission.js";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compensationSourceIds as ids,
  compensationSourceLimits,
} from "./compensation-source-profile.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

export function hasSelectedCompensationCheckpoint(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID) {
    return graph.compensation === undefined;
  }
  const declaration = graph.compensation;
  if (declaration === undefined) return false;

  const eventSubject = declaration.subjects.find(
    (subject): subject is Extract<CheckedCompensationSubject, { kind: "eventSubProcess" }> =>
      subject.kind === "eventSubProcess",
  );
  const boundarySubjects = declaration.subjects.filter(
    (subject): subject is Extract<CheckedCompensationSubject, { kind: "boundaryActivity" }> =>
      subject.kind === "boundaryActivity",
  );
  const subjectElementIds = declaration.subjects.map(subjectElementId);
  if (
    declaration.triggerElementId !== ids.trigger ||
    declaration.subjects.length !== 3 || boundarySubjects.length !== 2 ||
    eventSubject === undefined ||
    subjectElementIds[0] !== ids.arrangeGroundTravel ||
    subjectElementIds[1] !== ids.issueInsurance ||
    subjectElementIds[2] !== ids.reserveHotel ||
    !hasExactBoundarySubject(
      boundarySubjects,
      ids.reserveHotel,
      ids.reserveBoundary,
      ids.reserveHandler,
    ) ||
    !hasExactBoundarySubject(
      boundarySubjects,
      ids.issueInsurance,
      ids.insuranceBoundary,
      ids.insuranceHandler,
    ) ||
    !hasExactEventSubject(eventSubject) ||
    declaration.dependencies.length !== 1 ||
    declaration.dependencies[0]?.predecessorElementId !== ids.reserveHotel ||
    declaration.dependencies[0]?.successorElementId !== ids.arrangeGroundTravel ||
    declaration.dependencies[0]?.reason !== "sequenceFlow" ||
    !hasExactLimits(declaration)
  ) {
    return false;
  }
  return hasExactScopes(graph, eventSubject) && hasExactTopology(graph);
}

function hasExactBoundarySubject(
  subjects: ReadonlyArray<Extract<CheckedCompensationSubject, { kind: "boundaryActivity" }>>,
  subjectElementId: string,
  boundaryEventElementId: string,
  handlerElementId: string,
): boolean {
  const subject = subjects.find((candidate) =>
    candidate.subjectElementId === subjectElementId
  );
  return subject?.boundaryEventElementId === boundaryEventElementId &&
    exactBody(subject.body, handlerElementId, handlerElementId, "empty");
}

function hasExactEventSubject(
  subject: Extract<CheckedCompensationSubject, { kind: "eventSubProcess" }>,
): boolean {
  const input = subject.body.input;
  return subject.parentElementId === ids.arrangeGroundTravel &&
    subject.parentScopeId === definitionScopeId(ids.arrangeGroundTravel) &&
    subject.handlerScopeId === definitionScopeId(ids.eventHandler) &&
    exactBody(
      subject.body,
      ids.eventHandler,
      ids.eventHandlerEffect,
      "directRestoredProcessBinding",
    ) && input.kind === "directRestoredProcessBinding" &&
    input.sourcePropertyId === ids.property &&
    input.targetDataInputId === ids.dataInput;
}

function exactBody(
  body: CheckedCompensationBody,
  handlerElementId: string,
  effectElementId: string,
  inputKind: CheckedCompensationBody["input"]["kind"],
): boolean {
  return body.kind === "singleEffect" &&
    body.handlerElementId === handlerElementId &&
    body.effectElementId === effectElementId &&
    body.descriptor.protocol === EffectProtocol.Activity &&
    body.descriptor.operation === EffectOperation.CompensationSingleEffect &&
    body.input.kind === inputKind;
}

function hasExactLimits(
  declaration: NonNullable<CheckedProcessGraph["compensation"]>,
): boolean {
  return declaration.retentionLimits.maxRecords ===
      compensationSourceLimits.retentionLimits.maxRecords &&
    declaration.retentionLimits.maxCanonicalBytes ===
      compensationSourceLimits.retentionLimits.maxCanonicalBytes &&
    declaration.snapshotLimits.maxRecords ===
      compensationSourceLimits.snapshotLimits.maxRecords &&
    declaration.snapshotLimits.maxCanonicalBytes ===
      compensationSourceLimits.snapshotLimits.maxCanonicalBytes &&
    declaration.executionLimits.maxTriggers ===
      compensationSourceLimits.executionLimits.maxTriggers &&
    declaration.executionLimits.maxHandlers ===
      compensationSourceLimits.executionLimits.maxHandlers &&
    declaration.executionLimits.maxCanonicalBytes ===
      compensationSourceLimits.executionLimits.maxCanonicalBytes;
}

function hasExactScopes(
  graph: CheckedProcessGraph,
  eventSubject: Extract<CheckedCompensationSubject, { kind: "eventSubProcess" }>,
): boolean {
  const rootScopeId = definitionScopeId(ids.process);
  const expected = [
    { id: rootScopeId, parentScopeId: null, originElementId: ids.process },
    {
      id: eventSubject.parentScopeId,
      parentScopeId: rootScopeId,
      originElementId: eventSubject.parentElementId,
    },
    {
      id: eventSubject.handlerScopeId,
      parentScopeId: eventSubject.parentScopeId,
      originElementId: eventSubject.body.handlerElementId,
    },
  ];
  return graph.definitionScopes.length === expected.length &&
    expected.every((scope) => graph.definitionScopes.some((actual) =>
      actual.id === scope.id && actual.parentScopeId === scope.parentScopeId &&
      actual.originElementId === scope.originElementId
    )) &&
    graph.nodeScopes.every(({ nodeId, scopeId }) =>
      nodeId !== eventSubject.body.handlerElementId &&
      scopeId !== eventSubject.handlerScopeId
    ) &&
    graph.sequenceFlowScopes.every(({ scopeId }) =>
      scopeId !== eventSubject.handlerScopeId
    );
}

function hasExactTopology(graph: CheckedProcessGraph): boolean {
  if (graph.processId !== ids.process || graph.nodes.length !== 11 || graph.flows.length !== 10) {
    return false;
  }
  const rootScopeId = definitionScopeId(ids.process);
  const childScopeId = definitionScopeId(ids.arrangeGroundTravel);
  const nodeScope = new Map(graph.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const flowScope = new Map(
    graph.sequenceFlowScopes.map(({ sequenceFlowId, scopeId }) => [sequenceFlowId, scopeId]),
  );
  const rootNodes = graph.nodes.filter(({ id }) => nodeScope.get(id) === rootScopeId);
  const childNodes = graph.nodes.filter(({ id }) => nodeScope.get(id) === childScopeId);
  const split = exactNode(graph.nodes, ids.split, CheckedNodeKind.ParallelGateway);
  const join = exactNode(graph.nodes, ids.join, CheckedNodeKind.ParallelGateway);
  const embedded = exactNode(graph.nodes, ids.arrangeGroundTravel, CheckedNodeKind.EmbeddedSubProcess);
  if (
    rootNodes.length !== 8 || childNodes.length !== 3 ||
    split?.kind !== CheckedNodeKind.ParallelGateway ||
    split.direction !== GatewayDirection.Diverging ||
    join?.kind !== CheckedNodeKind.ParallelGateway ||
    join.direction !== GatewayDirection.Converging ||
    embedded?.kind !== CheckedNodeKind.EmbeddedSubProcess ||
    embedded.childScopeId !== childScopeId ||
    !hasExactNodeKinds(graph.nodes)
  ) {
    return false;
  }
  const expectedFlows = [
    [ids.rootStartFlow, ids.rootStart, ids.split, rootScopeId],
    [ids.splitReserveFlow, ids.split, ids.reserveHotel, rootScopeId],
    [ids.reserveArrangeFlow, ids.reserveHotel, ids.arrangeGroundTravel, rootScopeId],
    [ids.arrangeJoinFlow, ids.arrangeGroundTravel, ids.join, rootScopeId],
    [ids.splitInsuranceFlow, ids.split, ids.issueInsurance, rootScopeId],
    [ids.insuranceJoinFlow, ids.issueInsurance, ids.join, rootScopeId],
    [ids.joinTriggerFlow, ids.join, ids.trigger, rootScopeId],
    [ids.triggerEndFlow, ids.trigger, ids.rootEnd, rootScopeId],
    [ids.arrangeStartFlow, ids.arrangeStart, ids.arrangeTask, childScopeId],
    [ids.arrangeEndFlow, ids.arrangeTask, ids.arrangeEnd, childScopeId],
  ] as const;
  return expectedFlows.every(([id, sourceId, targetId, scopeId]) => {
    const flow = graph.flows.find((candidate) => candidate.id === id);
    return flow?.sourceId === sourceId && flow.targetId === targetId &&
      flow.condition === null && flowScope.get(id) === scopeId;
  });
}

function hasExactNodeKinds(nodes: ReadonlyArray<CheckedNode>): boolean {
  const expected = new Map<string, CheckedNodeKind>([
    [ids.rootStart, CheckedNodeKind.NoneStartEvent],
    [ids.split, CheckedNodeKind.ParallelGateway],
    [ids.reserveHotel, CheckedNodeKind.UserTask],
    [ids.arrangeGroundTravel, CheckedNodeKind.EmbeddedSubProcess],
    [ids.issueInsurance, CheckedNodeKind.UserTask],
    [ids.join, CheckedNodeKind.ParallelGateway],
    [ids.trigger, CheckedNodeKind.GlobalSynchronousCompensationThrowEvent],
    [ids.rootEnd, CheckedNodeKind.NoneEndEvent],
    [ids.arrangeStart, CheckedNodeKind.NoneStartEvent],
    [ids.arrangeTask, CheckedNodeKind.UserTask],
    [ids.arrangeEnd, CheckedNodeKind.NoneEndEvent],
  ]);
  return nodes.every((node) => expected.get(node.id) === node.kind) &&
    [...expected.keys()].every((id) => nodes.filter((node) => node.id === id).length === 1);
}

function exactNode<Kind extends CheckedNodeKind>(
  nodes: ReadonlyArray<CheckedNode>,
  id: string,
  kind: Kind,
): Extract<CheckedNode, { kind: Kind }> | undefined {
  const node = nodes.find((candidate) => candidate.id === id);
  return node?.kind === kind ? node as Extract<CheckedNode, { kind: Kind }> : undefined;
}

function subjectElementId(subject: CheckedCompensationSubject): string {
  return subject.kind === "boundaryActivity"
    ? subject.subjectElementId
    : subject.parentElementId;
}
