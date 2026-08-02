import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  ControlPlaceScopeOwnership,
  DefinitionScope,
  OperationScopeOwnership,
  SemanticOperation,
} from "./semantic-process-contract.js";

export type SemanticProcessGraph = Readonly<{
  definitionScopes: ReadonlyArray<DefinitionScope>;
  operationScopes: ReadonlyArray<OperationScopeOwnership>;
  controlPlaceScopes: ReadonlyArray<ControlPlaceScopeOwnership>;
  controlPlaceIds: ReadonlyArray<string>;
  operations: ReadonlyArray<SemanticOperation>;
}>;

/** Validates generic scoped ownership, producer, consumer, progress, and cycle facts. */
export function isWellFormedSemanticProcessGraph(
  graph: SemanticProcessGraph,
): boolean {
  const scopeIds = new Set(graph.definitionScopes.map(({ id }) => id));
  const root = onlyRootScope(graph.definitionScopes);
  if (root === undefined || !isWellFormedScopeTree(graph.definitionScopes)) {
    return false;
  }
  const operationScope = ownershipMap(
    graph.operationScopes,
    "operationId",
    graph.operations.map(({ id }) => id),
    scopeIds,
  );
  const placeScope = ownershipMap(
    graph.controlPlaceScopes,
    "controlPlaceId",
    graph.controlPlaceIds,
    scopeIds,
  );
  if (operationScope === undefined || placeScope === undefined) {
    return false;
  }

  const producers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  for (const placeId of graph.controlPlaceIds) {
    producers.set(placeId, []);
    consumers.set(placeId, []);
  }
  for (const operation of graph.operations) {
    if (!operationRespectsScopes(operation, graph, operationScope, placeScope)) {
      return false;
    }
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

  const starts = operationsOfKind(graph, SemanticOperationKind.Initiate);
  const rootCompletions = operationsOfKind(
    graph,
    SemanticOperationKind.CompleteScope,
  ).filter(({ scopeId }) => scopeId === root.id);
  const start = starts[0];
  const end = rootCompletions[0];
  if (
    starts.length !== 1 ||
    start === undefined ||
    rootCompletions.length !== 1 ||
    end === undefined ||
    !hasOneCompletionAndEntryPerScope(graph)
  ) {
    return false;
  }

  const placeEdges = graph.controlPlaceIds.flatMap((placeId) => {
    const source = producers.get(placeId)?.[0];
    const target = consumers.get(placeId)?.[0];
    return source === undefined || target === undefined
      ? []
      : [{ source, target }];
  });
  const completionEdges = operationsOfKind(
    graph,
    SemanticOperationKind.ReachNoneEnd,
  ).flatMap((reach) => {
    const scopeId = operationScope.get(reach.id);
    const completion = operationsOfKind(
      graph,
      SemanticOperationKind.CompleteScope,
    ).find((candidate) => candidate.scopeId === scopeId);
    return completion === undefined
      ? []
      : [{ source: reach.id, target: completion.id }];
  });
  const edges = [...placeEdges, ...completionEdges];
  const operationIds = graph.operations.map(({ id }) => id);
  const reached = reachableFrom([start.id], edges);
  const canReachEnd = reachableFrom(
    [end.id],
    edges.map(({ source, target }) => ({ source: target, target: source })),
  );
  return operationIds.every(
    (id) => reached.has(id) && canReachEnd.has(id),
  ) && isAcyclic(operationIds, edges);
}

function operationRespectsScopes(
  operation: SemanticOperation,
  graph: SemanticProcessGraph,
  operationScope: ReadonlyMap<string, string>,
  placeScope: ReadonlyMap<string, string>,
): boolean {
  const owner = operationScope.get(operation.id);
  if (owner === undefined) {
    return false;
  }
  const referencesOwnedBy = (
    placeIds: ReadonlyArray<string>,
    scopeId: string,
  ): boolean => placeIds.every((placeId) => placeScope.get(placeId) === scopeId);
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
      return graph.definitionScopes.some(
        ({ id, parentScopeId }) => id === owner && parentScopeId === null,
      ) && referencesOwnedBy([operation.output], owner);
    case SemanticOperationKind.EnterScope:
      return referencesOwnedBy([operation.input], owner) &&
        referencesOwnedBy([operation.childEntry], operation.childScopeId) &&
        graph.definitionScopes.some(
          ({ id, parentScopeId }) =>
            id === operation.childScopeId && parentScopeId === owner,
        );
    case SemanticOperationKind.ThrowError: {
      const attached = graph.definitionScopes.find(
        ({ id }) => id === operation.handler.attachedScopeId,
      );
      return attached?.id === owner &&
        attached.parentScopeId !== null &&
        referencesOwnedBy([operation.input], owner) &&
        referencesOwnedBy([operation.handler.output], attached.parentScopeId);
    }
    case SemanticOperationKind.CompleteScope: {
      const scope = graph.definitionScopes.find(({ id }) => id === owner);
      return operation.scopeId === owner &&
        scope !== undefined &&
        (scope.parentScopeId === null
          ? operation.parentOutput === null
          : operation.parentOutput !== null &&
            referencesOwnedBy([operation.parentOutput], scope.parentScopeId));
    }
    default:
      return referencesOwnedBy(
        [...operationInputs(operation), ...operationOutputs(operation)],
        owner,
      );
  }
}

function hasOneCompletionAndEntryPerScope(
  graph: SemanticProcessGraph,
): boolean {
  const completions = operationsOfKind(
    graph,
    SemanticOperationKind.CompleteScope,
  );
  const entries = operationsOfKind(graph, SemanticOperationKind.EnterScope);
  return graph.definitionScopes.every(({ id, parentScopeId }) =>
    completions.filter(({ scopeId }) => scopeId === id).length === 1 &&
    (parentScopeId === null
      ? entries.every(({ childScopeId }) => childScopeId !== id)
      : entries.filter(({ childScopeId }) => childScopeId === id).length === 1)
  );
}

function isWellFormedScopeTree(
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

function onlyRootScope(
  scopes: ReadonlyArray<DefinitionScope>,
): DefinitionScope | undefined {
  const roots = scopes.filter(({ parentScopeId }) => parentScopeId === null);
  return roots.length === 1 ? roots[0] : undefined;
}

function ownershipMap<K extends "operationId" | "controlPlaceId">(
  entries: ReadonlyArray<Readonly<Record<K, string> & { scopeId: string }>>,
  idKey: K,
  expectedIds: ReadonlyArray<string>,
  scopeIds: ReadonlySet<string>,
): ReadonlyMap<string, string> | undefined {
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

type OperationEdge = Readonly<{ source: string; target: string }>;

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
  const ready = operationIds.filter((id) => remainingIncoming.get(id) === 0);
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
    case SemanticOperationKind.CompleteScope:
      return [];
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.ReachNoneEnd:
      return [operation.input];
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
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
    case SemanticOperationKind.EnterScope:
      return [operation.childEntry];
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
    case SemanticOperationKind.SelectMany:
      return [
        ...operation.candidates.map(({ output }) => output),
        operation.defaultBranch.output,
      ];
    case SemanticOperationKind.SynchronizeSelected:
      return [operation.output];
    case SemanticOperationKind.ThrowError:
      return [operation.handler.output];
    case SemanticOperationKind.ReachNoneEnd:
      return [];
    case SemanticOperationKind.CompleteScope:
      return operation.parentOutput === null ? [] : [operation.parentOutput];
  }
}

function operationsOfKind<K extends SemanticOperationKind>(
  graph: SemanticProcessGraph,
  kind: K,
): ReadonlyArray<Extract<SemanticOperation, { kind: K }>> {
  return graph.operations.filter(
    (
      operation,
    ): operation is Extract<SemanticOperation, { kind: K }> =>
      operation.kind === kind,
  );
}
