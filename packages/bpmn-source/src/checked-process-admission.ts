import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticProfileId,
  SimpleBooleanExpressionLanguage,
  profileAllowsOperationKinds,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

const bpmnDefaultExpressionLanguage = "http://www.w3.org/1999/XPath";

/**
 * Applies profile capability to a graph admitted independently by structural
 * BPMN facts. No complete model topology is named here.
 */
export function isAdmittedCheckedProcess(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  expressionLanguage: unknown,
  hasExplicitExpressionLanguage: boolean,
  semanticProfile: string,
): boolean {
  return (
    profileAllowsOperationKinds(
      semanticProfile,
      nodes.map(semanticOperationKind),
    ) &&
    hasSelectedExpressionLanguage(
      semanticProfile,
      expressionLanguage,
      hasExplicitExpressionLanguage,
    ) &&
    nodes.every((node) => hasSelectedArity(node, flows)) &&
    hasSelectedConditions(semanticProfile, flows) &&
    isConnectedAcyclicGraph(nodes, flows)
  );
}

function semanticOperationKind(node: CheckedNode): SemanticOperationKind {
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
      return SemanticOperationKind.Initiate;
    case CheckedNodeKind.UserTask:
      return SemanticOperationKind.AwaitUserTask;
    case CheckedNodeKind.IntermediateCatchTimerEvent:
      return SemanticOperationKind.AwaitTimer;
    case CheckedNodeKind.IntermediateCatchMessageEvent:
      return SemanticOperationKind.AwaitMessage;
    case CheckedNodeKind.ServiceTask:
      return SemanticOperationKind.AwaitEffect;
    case CheckedNodeKind.ParallelGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return SemanticOperationKind.Duplicate;
        case GatewayDirection.Converging:
          return SemanticOperationKind.Synchronize;
      }
    case CheckedNodeKind.ExclusiveGateway:
      return SemanticOperationKind.Choose;
    case CheckedNodeKind.NoneEndEvent:
      return SemanticOperationKind.Terminate;
  }
}

function hasSelectedExpressionLanguage(
  semanticProfile: string,
  expressionLanguage: unknown,
  hasExplicitExpressionLanguage: boolean,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
      return (
        hasExplicitExpressionLanguage &&
        expressionLanguage === SimpleBooleanExpressionLanguage
      );
    default:
      return (
        !hasExplicitExpressionLanguage &&
        expressionLanguage === bpmnDefaultExpressionLanguage
      );
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
    case CheckedNodeKind.UserTask:
    case CheckedNodeKind.IntermediateCatchTimerEvent:
    case CheckedNodeKind.IntermediateCatchMessageEvent:
    case CheckedNodeKind.ServiceTask:
      return incoming === 1 && outgoing === 1;
    case CheckedNodeKind.ParallelGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return incoming === 1 && outgoing === 2;
        case GatewayDirection.Converging:
          return incoming === 2 && outgoing === 1;
      }
    case CheckedNodeKind.ExclusiveGateway:
      return incoming === 1 && outgoing === 3;
    case CheckedNodeKind.NoneEndEvent:
      return incoming === 1 && outgoing === 0;
  }
}

function isConnectedAcyclicGraph(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  const nodeIds = new Set(nodes.map(({ id }) => id));
  if (
    flows.some(
      ({ sourceId, targetId }) =>
        !nodeIds.has(sourceId) || !nodeIds.has(targetId),
    )
  ) {
    return false;
  }
  const starts = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneStartEvent,
  );
  const ends = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneEndEvent,
  );
  const start = starts[0];
  if (starts.length !== 1 || start === undefined || ends.length === 0) {
    return false;
  }
  const edges = flows.map(({ sourceId: source, targetId: target }) => ({
    source,
    target,
  }));
  const reached = reachableFrom([start.id], edges);
  const canReachEnd = reachableFrom(
    ends.map(({ id }) => id),
    edges.map(({ source, target }) => ({
      source: target,
      target: source,
    })),
  );
  return (
    nodes.every(({ id }) => reached.has(id) && canReachEnd.has(id)) &&
    isAcyclic([...nodeIds], edges)
  );
}

type NodeEdge = Readonly<{
  source: string;
  target: string;
}>;

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
