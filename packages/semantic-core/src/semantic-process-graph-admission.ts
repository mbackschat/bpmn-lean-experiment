import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";

export type SemanticProcessGraph = Readonly<{
  controlPlaceIds: ReadonlyArray<string>;
  operations: ReadonlyArray<SemanticOperation>;
}>;

/** Validates topology-independent producer, consumer, progress, and cycle facts. */
export function isWellFormedSemanticProcessGraph(
  graph: SemanticProcessGraph,
): boolean {
  const producers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  for (const placeId of graph.controlPlaceIds) {
    producers.set(placeId, []);
    consumers.set(placeId, []);
  }
  for (const operation of graph.operations) {
    for (const output of operationOutputs(operation)) {
      producers.get(output)?.push(operation.id);
    }
    for (const input of operationInputs(operation)) {
      consumers.get(input)?.push(operation.id);
    }
  }
  if (
    graph.controlPlaceIds.some(
      (placeId) =>
        producers.get(placeId)?.length !== 1 ||
        consumers.get(placeId)?.length !== 1,
    )
  ) {
    return false;
  }

  const starts = graph.operations.filter(
    ({ kind }) => kind === SemanticOperationKind.Initiate,
  );
  const ends = graph.operations.filter(
    ({ kind }) => kind === SemanticOperationKind.Terminate,
  );
  const start = starts[0];
  if (starts.length !== 1 || start === undefined || ends.length === 0) {
    return false;
  }

  const edges = graph.controlPlaceIds.map((placeId) => ({
    source: producers.get(placeId)?.[0],
    target: consumers.get(placeId)?.[0],
  }));
  if (
    edges.some(
      ({ source, target }) => source === undefined || target === undefined,
    )
  ) {
    return false;
  }
  const completeEdges = edges.flatMap(({ source, target }) =>
    source === undefined || target === undefined
      ? []
      : [{ source, target }]
  );
  const operationIds = graph.operations.map(({ id }) => id);
  const reached = reachableFrom([start.id], completeEdges);
  const canReachEnd = reachableFrom(
    ends.map(({ id }) => id),
    completeEdges.map(({ source, target }) => ({
      source: target,
      target: source,
    })),
  );
  return (
    operationIds.every((id) => reached.has(id) && canReachEnd.has(id)) &&
    isAcyclic(operationIds, completeEdges)
  );
}

type OperationEdge = Readonly<{
  source: string;
  target: string;
}>;

function reachableFrom(
  initial: ReadonlyArray<string>,
  edges: ReadonlyArray<OperationEdge>,
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
  operationIds: ReadonlyArray<string>,
  edges: ReadonlyArray<OperationEdge>,
): boolean {
  const remainingIncoming = new Map(
    operationIds.map((id) => [
      id,
      edges.filter(({ target }) => target === id).length,
    ]),
  );
  const ready = operationIds.filter(
    (id) => remainingIncoming.get(id) === 0,
  );
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
      const nextIncoming = (remainingIncoming.get(edge.target) ?? 0) - 1;
      remainingIncoming.set(edge.target, nextIncoming);
      if (nextIncoming === 0) {
        ready.push(edge.target);
      }
    }
  }
  return visited === operationIds.length;
}

function operationInputs(
  operation: SemanticOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
      return [];
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.Terminate:
      return [operation.input];
    case SemanticOperationKind.Synchronize:
      return operation.inputs;
  }
}

function operationOutputs(
  operation: SemanticOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.Synchronize:
      return [operation.output];
    case SemanticOperationKind.AwaitEffect:
      return [
        operation.output,
        ...(operation.bpmnErrorRoute === null
          ? []
          : [operation.bpmnErrorRoute.output]),
      ];
    case SemanticOperationKind.Duplicate:
      return operation.outputs;
    case SemanticOperationKind.Choose:
      return [
        ...operation.candidates.map(({ output }) => output),
        operation.defaultOutput,
      ];
    case SemanticOperationKind.Terminate:
      return [];
  }
}
