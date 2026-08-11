import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticGraphPolicyKind,
  SemanticProfileId,
  semanticGraphPolicyForProfile,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  DefinitionScope,
  NodeScopeOwnership,
  SemanticGraphPolicy,
  SequenceFlowScopeOwnership,
} from "@bpmn-lean/semantic-core";

export type CheckedProcessGraph = Readonly<{
  processId: string;
  definitionScopes: ReadonlyArray<DefinitionScope>;
  nodeScopes: ReadonlyArray<NodeScopeOwnership>;
  sequenceFlowScopes: ReadonlyArray<SequenceFlowScopeOwnership>;
  nodes: ReadonlyArray<CheckedNode>;
  flows: ReadonlyArray<CheckedSequenceFlow>;
}>;

type AdmittedCheckedProcessGraph = Readonly<{
  nodeScopes: ReadonlyMap<string, string>;
  flowScopes: ReadonlyMap<string, string>;
}>;

/** Resolves ownership only when every definition scope satisfies the selected profile graph policy. */
export function resolveAdmittedCheckedProcessGraph(
  graph: CheckedProcessGraph,
  semanticProfile: string = SemanticProfileId.UserTask,
): AdmittedCheckedProcessGraph | undefined {
  const graphPolicy = semanticGraphPolicyForProfile(semanticProfile);
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
  if (
    nodeScopes === undefined ||
    flowScopes === undefined ||
    graphPolicy === undefined ||
    !isDefinitionScopeForest(graph.definitionScopes) ||
    !graph.definitionScopes.every(({ id }) =>
      isAdmittedDefinitionScope(
        graph,
        id,
        nodeScopes,
        flowScopes,
        graphPolicy,
      )
    )
  ) {
    return undefined;
  }
  return { nodeScopes, flowScopes };
}

function isAdmittedDefinitionScope(
  graph: CheckedProcessGraph,
  scopeId: string,
  nodeScopes: ReadonlyMap<string, string>,
  flowScopes: ReadonlyMap<string, string>,
  graphPolicy: SemanticGraphPolicy,
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
    isConnectedGraphUnderPolicy(nodes, flows, exceptionalEdges, graphPolicy);
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

function hasSelectedArity(
  node: CheckedNode,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  const incoming = flows.filter(({ targetId }) => targetId === node.id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === node.id).length;
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
    case CheckedNodeKind.MessageStartEvent:
    case CheckedNodeKind.TimerStartEvent:
      return incoming === 0 && outgoing === 1;
    case CheckedNodeKind.EmbeddedSubProcess:
    case CheckedNodeKind.CallActivity:
    case CheckedNodeKind.UserTask:
    case CheckedNodeKind.IntermediateCatchTimerEvent:
    case CheckedNodeKind.IntermediateCatchMessageEvent:
    case CheckedNodeKind.ReceiveTask:
    case CheckedNodeKind.ServiceTask:
    case CheckedNodeKind.ConfiguredTask:
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
    case CheckedNodeKind.ExclusiveMerge:
      return incoming === 3 && outgoing === 1;
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
    case CheckedNodeKind.TerminateEndEvent:
    case CheckedNodeKind.NoneEndEvent:
      return incoming === 1 && outgoing === 0;
  }
}

function isConnectedGraphUnderPolicy(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  exceptionalEdges: ReadonlyArray<NodeEdge>,
  graphPolicy: SemanticGraphPolicy,
): boolean {
  const starts = nodes.filter(
    ({ kind }) =>
      kind === CheckedNodeKind.NoneStartEvent ||
      kind === CheckedNodeKind.MessageStartEvent ||
      kind === CheckedNodeKind.TimerStartEvent,
  );
  const ends = nodes.filter(
    ({ kind }) =>
      kind === CheckedNodeKind.NoneEndEvent ||
      kind === CheckedNodeKind.ErrorEndEvent ||
      kind === CheckedNodeKind.TerminateEndEvent,
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
    isAcyclic(
      nodes.map(({ id }) => id),
      graphEdgesSelectedByPolicy(nodes, edges, graphPolicy),
    );
}

function graphEdgesSelectedByPolicy(
  nodes: ReadonlyArray<CheckedNode>,
  edges: ReadonlyArray<NodeEdge>,
  graphPolicy: SemanticGraphPolicy,
): ReadonlyArray<NodeEdge> {
  switch (graphPolicy.kind) {
    case SemanticGraphPolicyKind.Acyclic:
      return edges;
    case SemanticGraphPolicyKind.ResumptionBounded: {
      const resumptionKinds = new Set<string>(
        graphPolicy.checkedResumptionNodeKinds,
      );
      const resumptionNodeIds = new Set(
        nodes
          .filter(({ kind }) => resumptionKinds.has(kind))
          .map(({ id }) => id),
      );
      return edges.filter(({ source }) => !resumptionNodeIds.has(source));
    }
  }
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
