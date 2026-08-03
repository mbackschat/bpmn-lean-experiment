import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticProfileId,
  SimpleBooleanExpressionLanguage,
  profileAllowsCheckedProcessShape,
} from "@bpmn-lean/semantic-core";
import type {
  DefinitionScope,
  NodeScopeOwnership,
  CheckedNode,
  CheckedSequenceFlow,
  SequenceFlowScopeOwnership,
} from "@bpmn-lean/semantic-core";
import {
  hasSelectedCallActivityDefinitions,
} from "./call-activity-checked-admission.js";

const bpmnDefaultExpressionLanguage = "http://www.w3.org/1999/XPath";

export type CheckedProcessGraph = Readonly<{
  processId: string;
  definitionScopes: ReadonlyArray<DefinitionScope>;
  nodeScopes: ReadonlyArray<NodeScopeOwnership>;
  sequenceFlowScopes: ReadonlyArray<SequenceFlowScopeOwnership>;
  nodes: ReadonlyArray<CheckedNode>;
  flows: ReadonlyArray<CheckedSequenceFlow>;
}>;

/**
 * Applies profile cardinalities to a graph admitted through generic scoped BPMN facts.
 * No complete model topology is named here.
 */
export function isAdmittedCheckedProcess(
  graph: CheckedProcessGraph,
  expressionLanguage: unknown,
  hasExplicitExpressionLanguage: boolean,
  semanticProfile: string,
): boolean {
  const nodeScopes = ownershipMap(
    graph.nodeScopes,
    "nodeId",
    graph.nodes.map(({ id }) => id),
    graph.definitionScopes,
  );
  const flowScopes = ownershipMap(
    graph.sequenceFlowScopes,
    "sequenceFlowId",
    graph.flows.map(({ id }) => id),
    graph.definitionScopes,
  );
  return profileAllowsCheckedProcessShape(
      semanticProfile,
      graph.nodes.map(({ kind }) => kind),
      graph.definitionScopes.length,
    ) &&
    nodeScopes !== undefined &&
    flowScopes !== undefined &&
    isDefinitionScopeForest(graph.definitionScopes) &&
    embeddedNodesOwnChildScopes(graph, nodeScopes, semanticProfile) &&
    hasSelectedCallActivityDefinitions(semanticProfile, graph, nodeScopes) &&
    errorNodesHaveDirectHandlers(graph, nodeScopes) &&
    hasSelectedExpressionLanguage(
      semanticProfile,
      expressionLanguage,
      hasExplicitExpressionLanguage,
    ) &&
    hasSelectedConditions(semanticProfile, graph.flows) &&
    hasSelectedInclusivePairing(semanticProfile, graph) &&
    hasSelectedEventRaceTopology(semanticProfile, graph) &&
    graph.definitionScopes.every(({ id }) =>
      isAdmittedDefinitionScope(graph, id, nodeScopes, flowScopes)
    );
}

function isAdmittedDefinitionScope(
  graph: CheckedProcessGraph,
  scopeId: string,
  nodeScopes: ReadonlyMap<string, string>,
  flowScopes: ReadonlyMap<string, string>,
): boolean {
  const nodes = graph.nodes.filter(({ id }) => nodeScopes.get(id) === scopeId);
  const flows = graph.flows.filter(({ id }) => flowScopes.get(id) === scopeId);
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const exceptionalEdges = exceptionalEdgesWithinScope(
    nodes,
    nodeScopes,
    scopeId,
  );
  return nodes.every((node) => hasSelectedArity(node, flows)) &&
    flows.every(
      ({ sourceId, targetId }) =>
        nodeIds.has(sourceId) && nodeIds.has(targetId),
    ) &&
    isConnectedAcyclicGraph(nodes, flows, exceptionalEdges);
}

function errorNodesHaveDirectHandlers(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  const thrown = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.ErrorEndEvent }
    > => node.kind === CheckedNodeKind.ErrorEndEvent,
  );
  const handlers = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.BoundaryErrorEvent }
    > => node.kind === CheckedNodeKind.BoundaryErrorEvent,
  );
  const matchingHandlers = (
    errorEnd: Extract<
      CheckedNode,
      { kind: CheckedNodeKind.ErrorEndEvent }
    >,
  ) => handlers.filter((handler) => {
    const attached = graph.nodes.find(
      (node): node is Extract<
        CheckedNode,
        { kind: CheckedNodeKind.EmbeddedSubProcess }
      > =>
        node.id === handler.attachedToRef &&
        node.kind === CheckedNodeKind.EmbeddedSubProcess,
    );
    return attached !== undefined &&
      attached.childScopeId === nodeScopes.get(errorEnd.id) &&
      nodeScopes.get(handler.id) === nodeScopes.get(attached.id) &&
      handler.error.errorElementId === errorEnd.error.errorElementId &&
      handler.error.code === errorEnd.error.code &&
      graph.flows.some(
        ({ id, sourceId }) =>
          id === handler.outputFlowId && sourceId === handler.id,
      );
  });
  return thrown.every((errorEnd) => matchingHandlers(errorEnd).length === 1) &&
    handlers.every(
      (handler) =>
        thrown.filter((errorEnd) =>
          matchingHandlers(errorEnd).includes(handler)
        ).length === 1,
    );
}

function embeddedNodesOwnChildScopes(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
  semanticProfile: string,
): boolean {
  const embedded = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.EmbeddedSubProcess }
    > => node.kind === CheckedNodeKind.EmbeddedSubProcess,
  );
  const roots = graph.definitionScopes.filter(
    ({ parentScopeId }) => parentScopeId === null,
  );
  const expectedRootCount =
    semanticProfile === SemanticProfileId.CalledProcessCallActivity ? 2 : 1;
  return roots.length === expectedRootCount &&
    embedded.every((node) =>
      graph.definitionScopes.some(
        ({ id, parentScopeId, originElementId }) =>
          id === node.childScopeId &&
          parentScopeId === nodeScopes.get(node.id) &&
          originElementId === node.id,
      )
    ) &&
    graph.definitionScopes.every(({ id, parentScopeId, originElementId }) =>
      parentScopeId === null || embedded.some(
        (node) => node.id === originElementId && node.childScopeId === id,
      )
    );
}

function isDefinitionScopeForest(
  scopes: ReadonlyArray<DefinitionScope>,
): boolean {
  const byId = new Map(scopes.map((scope) => [scope.id, scope]));
  return byId.size === scopes.length && scopes.every((scope) => {
    if (scope.parentScopeId === null) {
      return true;
    }
    const visited = new Set([scope.id]);
    let parentId: string | null = scope.parentScopeId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        return false;
      }
      visited.add(parentId);
      const parent: DefinitionScope | undefined = byId.get(parentId);
      if (parent === undefined) {
        return false;
      }
      parentId = parent.parentScopeId;
    }
    return true;
  });
}

function ownershipMap<K extends "nodeId" | "sequenceFlowId">(
  entries: ReadonlyArray<Readonly<Record<K, string> & { scopeId: string }>>,
  idKey: K,
  expectedIds: ReadonlyArray<string>,
  scopes: ReadonlyArray<DefinitionScope>,
): ReadonlyMap<string, string> | undefined {
  const scopeIds = new Set(scopes.map(({ id }) => id));
  const result = new Map<string, string>();
  for (const entry of entries) {
    if (result.has(entry[idKey]) || !scopeIds.has(entry.scopeId)) {
      return undefined;
    }
    result.set(entry[idKey], entry.scopeId);
  }
  return entries.length === expectedIds.length &&
      expectedIds.every((id) => result.has(id))
    ? result
    : undefined;
}

function hasSelectedExpressionLanguage(
  semanticProfile: string,
  expressionLanguage: unknown,
  hasExplicitExpressionLanguage: boolean,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
      return hasExplicitExpressionLanguage &&
        expressionLanguage === SimpleBooleanExpressionLanguage;
    default:
      return !hasExplicitExpressionLanguage &&
        expressionLanguage === bpmnDefaultExpressionLanguage;
  }
}

function hasSelectedConditions(
  semanticProfile: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
      return flows.filter(({ condition }) => condition !== null).length === 2;
    default:
      return flows.every(({ condition }) => condition === null);
  }
}

function hasSelectedArity(
  node: CheckedNode,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  const incoming = flows.filter(({ targetId }) => targetId === node.id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === node.id).length;
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
      return incoming === 0 && outgoing === 1;
    case CheckedNodeKind.EmbeddedSubProcess:
    case CheckedNodeKind.CallActivity:
    case CheckedNodeKind.UserTask:
    case CheckedNodeKind.IntermediateCatchTimerEvent:
    case CheckedNodeKind.IntermediateCatchMessageEvent:
    case CheckedNodeKind.ReceiveTask:
    case CheckedNodeKind.ServiceTask:
      return incoming === 1 && outgoing === 1;
    case CheckedNodeKind.BoundaryErrorEvent:
    case CheckedNodeKind.TimerBoundaryEvent:
      return incoming === 0 && outgoing === 1;
    case CheckedNodeKind.ParallelGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return incoming === 1 && outgoing === 2;
        case GatewayDirection.Converging:
          return incoming === 2 && outgoing === 1;
      }
    case CheckedNodeKind.ExclusiveGateway:
      return incoming === 1 && outgoing === 3;
    case CheckedNodeKind.InclusiveGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return incoming === 1 && outgoing === 3;
        case GatewayDirection.Converging:
          return incoming === 3 && outgoing === 1;
      }
    case CheckedNodeKind.EventBasedGateway:
      return incoming === 1 && outgoing === 2;
    case CheckedNodeKind.ErrorEndEvent:
    case CheckedNodeKind.NoneEndEvent:
      return incoming === 1 && outgoing === 0;
  }
}

function hasSelectedInclusivePairing(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.InclusiveGatewaySelectedBranches) {
    return true;
  }
  const inclusive = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.InclusiveGateway }> =>
      node.kind === CheckedNodeKind.InclusiveGateway,
  );
  const split = inclusive.find(
    (node): node is Extract<CheckedNode, {
      kind: CheckedNodeKind.InclusiveGateway;
      direction: GatewayDirection.Diverging;
    }> => node.direction === GatewayDirection.Diverging,
  );
  const join = inclusive.find(
    (node): node is Extract<CheckedNode, {
      kind: CheckedNodeKind.InclusiveGateway;
      direction: GatewayDirection.Converging;
    }> => node.direction === GatewayDirection.Converging,
  );
  if (split === undefined || join === undefined || join.pairedGatewayId !== split.id) {
    return false;
  }
  const splitFlowIds = [split.defaultFlowId, ...split.candidateFlowIds];
  const branches = splitFlowIds.map((flowId) => {
    const splitFlow = graph.flows.find(({ id }) => id === flowId);
    const task = splitFlow === undefined
      ? undefined
      : graph.nodes.find(({ id }) => id === splitFlow.targetId);
    const taskOutputs = task === undefined
      ? []
      : graph.flows.filter(({ sourceId }) => sourceId === task.id);
    return task?.kind === CheckedNodeKind.UserTask &&
        splitFlow?.sourceId === split.id &&
        taskOutputs.length === 1 &&
        taskOutputs[0]?.targetId === join.id
      ? taskOutputs[0]?.id
      : undefined;
  });
  const joinInputIds = graph.flows
    .filter(({ targetId }) => targetId === join.id)
    .map(({ id }) => id);
  return branches.every((flowId) => flowId !== undefined) &&
    new Set(branches).size === 3 &&
    joinInputIds.length === 3 &&
    joinInputIds.every((flowId) => branches.includes(flowId));
}

function hasSelectedEventRaceTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.EventBasedGatewayMessageTimer) {
    return true;
  }
  const gateways = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.EventBasedGateway }> =>
      node.kind === CheckedNodeKind.EventBasedGateway,
  );
  const messages = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.IntermediateCatchMessageEvent }> =>
      node.kind === CheckedNodeKind.IntermediateCatchMessageEvent,
  );
  const timers = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.IntermediateCatchTimerEvent }> =>
      node.kind === CheckedNodeKind.IntermediateCatchTimerEvent,
  );
  const gateway = gateways[0];
  const message = messages[0];
  const timer = timers[0];
  if (
    gateways.length !== 1 ||
    messages.length !== 1 ||
    timers.length !== 1 ||
    gateway === undefined ||
    message === undefined ||
    timer === undefined
  ) {
    return false;
  }
  const configured = graph.flows.filter(({ sourceId }) => sourceId === gateway.id);
  return configured.length === 2 &&
    configured.every(({ condition }) => condition === null) &&
    configured.filter(({ targetId }) => targetId === message.id).length === 1 &&
    configured.filter(({ targetId }) => targetId === timer.id).length === 1;
}

function isConnectedAcyclicGraph(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  exceptionalEdges: ReadonlyArray<NodeEdge>,
): boolean {
  const starts = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneStartEvent,
  );
  const ends = nodes.filter(
    ({ kind }) =>
      kind === CheckedNodeKind.NoneEndEvent ||
      kind === CheckedNodeKind.ErrorEndEvent,
  );
  const start = starts[0];
  if (starts.length !== 1 || start === undefined || ends.length === 0) {
    return false;
  }
  const edges = [
    ...flows.map(({ sourceId: source, targetId: target }) => ({
      source,
      target,
    })),
    ...exceptionalEdges,
  ];
  const reached = reachableFrom([start.id], edges);
  const canReachEnd = reachableFrom(
    ends.map(({ id }) => id),
    edges.map(({ source, target }) => ({ source: target, target: source })),
  );
  return nodes.every(({ id }) => reached.has(id) && canReachEnd.has(id)) &&
    isAcyclic(nodes.map(({ id }) => id), edges);
}

type NodeEdge = Readonly<{ source: string; target: string }>;

/**
 * Reachability edges no Sequence Flow expresses.
 *
 * A Boundary Event has no incoming Flow, so ordinary Flow traversal never reaches it; it becomes
 * reachable through the Activity it is attached to. That is a property of being attached, not of the
 * trigger, so every boundary kind contributes an edge. Matching a single kind here silently strands
 * the next one as unreachable, which reads as a profile-capability rejection rather than a missing edge.
 */
function exceptionalEdgesWithinScope(
  nodes: ReadonlyArray<CheckedNode>,
  nodeScopes: ReadonlyMap<string, string>,
  scopeId: string,
): ReadonlyArray<NodeEdge> {
  return nodes.flatMap((node) => {
    const host = attachedBoundaryHost(node);
    return host !== undefined && nodeScopes.get(host) === scopeId
      ? [{ source: host, target: node.id }]
      : [];
  });
}

/** The Activity a boundary Event is attached to, or `undefined` for any other node. */
function attachedBoundaryHost(node: CheckedNode): string | undefined {
  switch (node.kind) {
    case CheckedNodeKind.BoundaryErrorEvent:
    case CheckedNodeKind.TimerBoundaryEvent:
      return node.attachedToRef;
    default:
      return undefined;
  }
}

function reachableFrom(
  initial: ReadonlyArray<string>,
  edges: ReadonlyArray<NodeEdge>,
): ReadonlySet<string> {
  const reached = new Set(initial);
  const frontier = [...initial];
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (current === undefined) {
      continue;
    }
    for (const edge of edges) {
      if (edge.source === current && !reached.has(edge.target)) {
        reached.add(edge.target);
        frontier.push(edge.target);
      }
    }
  }
  return reached;
}

function isAcyclic(
  nodeIds: ReadonlyArray<string>,
  edges: ReadonlyArray<NodeEdge>,
): boolean {
  const incoming = new Map(
    nodeIds.map((id) => [
      id,
      edges.filter(({ target }) => target === id).length,
    ]),
  );
  const ready = nodeIds.filter((id) => incoming.get(id) === 0);
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) {
      continue;
    }
    visited += 1;
    for (const edge of edges) {
      if (edge.source !== current) {
        continue;
      }
      const nextIncoming = (incoming.get(edge.target) ?? 0) - 1;
      incoming.set(edge.target, nextIncoming);
      if (nextIncoming === 0) {
        ready.push(edge.target);
      }
    }
  }
  return visited === nodeIds.length;
}
