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

const bpmnDefaultExpressionLanguage = "http://www.w3.org/1999/XPath";

export type CheckedProcessGraph = Readonly<{
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
    isDefinitionScopeTree(graph.definitionScopes) &&
    embeddedNodesOwnChildScopes(graph, nodeScopes) &&
    errorNodesHaveDirectHandlers(graph, nodeScopes) &&
    hasSelectedExpressionLanguage(
      semanticProfile,
      expressionLanguage,
      hasExplicitExpressionLanguage,
    ) &&
    hasSelectedConditions(semanticProfile, graph.flows) &&
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
  return roots.length === 1 &&
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

function isDefinitionScopeTree(
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
    case CheckedNodeKind.UserTask:
    case CheckedNodeKind.IntermediateCatchTimerEvent:
    case CheckedNodeKind.IntermediateCatchMessageEvent:
    case CheckedNodeKind.ReceiveTask:
    case CheckedNodeKind.ServiceTask:
      return incoming === 1 && outgoing === 1;
    case CheckedNodeKind.BoundaryErrorEvent:
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
    case CheckedNodeKind.ErrorEndEvent:
    case CheckedNodeKind.NoneEndEvent:
      return incoming === 1 && outgoing === 0;
  }
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

function exceptionalEdgesWithinScope(
  nodes: ReadonlyArray<CheckedNode>,
  nodeScopes: ReadonlyMap<string, string>,
  scopeId: string,
): ReadonlyArray<NodeEdge> {
  return nodes.flatMap((node) =>
    node.kind === CheckedNodeKind.BoundaryErrorEvent &&
      nodeScopes.get(node.attachedToRef) === scopeId
      ? [{ source: node.attachedToRef, target: node.id }]
      : []
  );
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
