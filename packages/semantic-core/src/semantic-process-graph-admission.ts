import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { CompensationEventSubProcessSnapshotTarget } from "./compensation-event-sub-process-snapshot-contract.js";
import type { DefinitionScope } from "./semantic-value-contract.js";
import type {
  ControlPlaceScopeOwnership,
  OperationScopeOwnership,
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  callCompletionEdges,
  callOperationsArePaired,
} from "./call-activity-admission.js";
import {
  SemanticGraphPolicyKind,
  semanticGraphPolicyForProfile,
} from "./semantic-process-graph-policy.js";
import {
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import {
  hasExactBalancedTwoBranchControlTopology,
} from "./exact-balanced-two-branch-topology.js";
import {
  compensationSourceCheckpointTopologyAdmitted,
} from "./compensation-source-checkpoint-topology.js";

export type SemanticProcessGraph = Readonly<{
  semanticProfile: string;
  processId: string;
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
  return isWellFormedSemanticProcessGraphWithDormantHandlers(graph, new Set());
}

/** Internal Program-composition seam; the package entry point deliberately does not export it. */
export function isWellFormedSemanticProcessProgramGraph(
  graph: SemanticProcessGraph,
  targets: ReadonlyArray<CompensationEventSubProcessSnapshotTarget>,
): boolean {
  return isWellFormedSemanticProcessGraphWithDormantHandlers(
    graph,
    new Set(targets.map(({ handlerScopeId }) => handlerScopeId)),
  );
}

function isWellFormedSemanticProcessGraphWithDormantHandlers(
  graph: SemanticProcessGraph,
  dormantHandlerScopeIds: ReadonlySet<string>,
): boolean {
  const graphPolicy = semanticGraphPolicyForProfile(graph.semanticProfile);
  if (graphPolicy === undefined) {
    return false;
  }
  const scopeIds = new Set(graph.definitionScopes.map(({ id }) => id));
  const entryRoots = graph.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === graph.processId,
  );
  const root = entryRoots[0];
  if (
    entryRoots.length !== 1 ||
    root === undefined ||
    !isWellFormedScopeForest(graph.definitionScopes)
  ) {
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
  if (!callOperationsArePaired(
    graph.processId,
    graph.definitionScopes,
    graph.operations,
    operationScope,
    placeScope,
  )) {
    return false;
  }
  if (!parallelMultiInstanceOperationsArePaired(
    graph.operations,
    operationScope,
  )) {
    return false;
  }

  const producers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  for (const placeId of graph.controlPlaceIds) {
    producers.set(placeId, []);
    consumers.set(placeId, []);
  }
  for (const operation of graph.operations) {
    if (!operationRespectsScopes(
      operation,
      graph,
      operationScope,
      placeScope,
      root.id,
    )) {
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

  const starts = [
    ...operationsOfKind(graph, SemanticOperationKind.Initiate),
    ...operationsOfKind(graph, SemanticOperationKind.InitiateMessage),
    ...operationsOfKind(graph, SemanticOperationKind.InitiateTimer),
  ];
  const rootCompletions = operationsOfKind(
    graph,
    SemanticOperationKind.CompleteScope,
  ).filter(({ scopeId }) => scopeId === root.id);
  const start = starts[0];
  const end = rootCompletions[0];
  if (
    starts.length !== 1 ||
    start === undefined ||
    operationScope.get(start.id) !== root.id ||
    rootCompletions.length !== 1 ||
    end === undefined ||
    !hasOneCompletionStrategyPerScope(
      graph,
      root.id,
      operationScope,
      dormantHandlerScopeIds,
    )
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
  const completionEdges = [
    ...operationsOfKind(graph, SemanticOperationKind.ReachNoneEnd),
    ...operationsOfKind(graph, SemanticOperationKind.TerminateScope),
  ].flatMap((predecessor) => {
    const scopeId = operationScope.get(predecessor.id);
    const completion = operationsOfKind(
      graph,
      SemanticOperationKind.CompleteScope,
    ).find((candidate) => candidate.scopeId === scopeId);
    return completion === undefined
      ? []
      : [{ source: predecessor.id, target: completion.id }];
  });
  const edges = [
    ...placeEdges,
    ...completionEdges,
    ...callCompletionEdges(graph.operations, operationScope),
    ...parallelMultiInstanceCompletionEdges(graph.operations),
  ];
  const operationIds = graph.operations.map(({ id }) => id);
  const reached = reachableFrom([start.id], edges);
  const canReachEnd = reachableFrom(
    [end.id],
    edges.map(({ source, target }) => ({ source: target, target: source })),
  );
  if (!operationIds.every(
    (id) => reached.has(id) && canReachEnd.has(id),
  )) {
    return false;
  }
  if (!hasSelectedParallelTopology(graph, placeEdges)) {
    return false;
  }
  if (!compensationSourceCheckpointTopologyAdmitted({
    semanticProfile: graph.semanticProfile,
    operations: graph.operations,
    edges,
    operationScope,
    rootScopeId: root.id,
  })) {
    return false;
  }
  switch (graphPolicy.kind) {
    case SemanticGraphPolicyKind.Acyclic:
      return isAcyclic(operationIds, edges);
    case SemanticGraphPolicyKind.ResumptionBounded: {
      const resumptionKinds = new Set<SemanticOperationKind>(
        graphPolicy.semanticResumptionOperationKinds,
      );
      const operationKinds = new Map(
        graph.operations.map(({ id, kind }) => [id, kind]),
      );
      return isAcyclic(
        operationIds,
        edges.filter(({ source }) => {
          const kind = operationKinds.get(source);
          return kind === undefined || !resumptionKinds.has(kind);
        }),
      );
    }
  }
}

function hasSelectedParallelTopology(
  graph: SemanticProcessGraph,
  edges: ReadonlyArray<OperationEdge>,
): boolean {
  if (
    graph.semanticProfile !== SemanticProfileId.ParallelForkJoin &&
    graph.semanticProfile !==
      SemanticProfileId.ParallelUserTaskAssignmentFormMetadata
  ) {
    return true;
  }
  const idsOfKind = <Kind extends SemanticOperationKind>(kind: Kind) =>
    operationsOfKind(graph, kind).map(({ id }) => id);
  return hasExactBalancedTwoBranchControlTopology({
    entryIds: idsOfKind(SemanticOperationKind.Initiate),
    splitIds: idsOfKind(SemanticOperationKind.Duplicate),
    branchIds: idsOfKind(SemanticOperationKind.AwaitUserTask),
    joinIds: idsOfKind(SemanticOperationKind.Synchronize),
    endIds: idsOfKind(SemanticOperationKind.ReachNoneEnd),
    edges,
  });
}

function operationRespectsScopes(
  operation: SemanticOperation,
  graph: SemanticProcessGraph,
  operationScope: ReadonlyMap<string, string>,
  placeScope: ReadonlyMap<string, string>,
  entryRootId: string,
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
    case SemanticOperationKind.InitiateMessage:
      return graph.definitionScopes.some(
        ({ id, parentScopeId }) => id === owner && parentScopeId === null,
      ) && referencesOwnedBy(operation.outputs, owner);
    case SemanticOperationKind.InitiateTimer:
      return graph.definitionScopes.some(
        ({ id, parentScopeId }) => id === owner && parentScopeId === null,
      ) && referencesOwnedBy(operation.outputs, owner);
    case SemanticOperationKind.EnterScope:
      return referencesOwnedBy([operation.input], owner) &&
        referencesOwnedBy([operation.childEntry], operation.childScopeId) &&
        graph.definitionScopes.some(
          ({ id, parentScopeId }) =>
            id === operation.childScopeId && parentScopeId === owner,
        );
    // The two outputs land in different scopes and that asymmetry is the rule: the child entry is
    // inside the new region, while the boundary route is produced beside the Sub-Process, because the
    // deadline belongs to the host Activity's own scope.
    case SemanticOperationKind.EnterBoundedScope:
      return referencesOwnedBy(
        [operation.input, operation.boundaryTimer.output],
        owner,
      ) &&
        referencesOwnedBy([operation.childEntry], operation.childScopeId) &&
        graph.definitionScopes.some(
          ({ id, parentScopeId }) =>
            id === operation.childScopeId && parentScopeId === owner,
        );
    case SemanticOperationKind.InvokeProcess:
      return referencesOwnedBy([operation.input], owner) &&
        referencesOwnedBy(
          [operation.calledEntry],
          operation.calledRootScopeId,
        );
    case SemanticOperationKind.ReturnProcess:
      return operation.calledRootScopeId === owner &&
        graph.definitionScopes.some(
          ({ id, parentScopeId }) => id === owner && parentScopeId === null,
        ) &&
        referencesOwnedBy([operation.callerOutput], entryRootId);
    case SemanticOperationKind.ThrowError: {
      const attached = graph.definitionScopes.find(
        ({ id }) => id === operation.handler.attachedScopeId,
      );
      return attached?.id === owner &&
        attached.parentScopeId !== null &&
        referencesOwnedBy([operation.input], owner) &&
        referencesOwnedBy([operation.handler.output], attached.parentScopeId);
    }
    case SemanticOperationKind.TriggerCompensation:
      return operation.definitionScopeId === owner &&
        graph.definitionScopes.some(
          ({ id, parentScopeId }) => id === owner && parentScopeId === null,
        ) &&
        referencesOwnedBy([operation.input, operation.output], owner);
    case SemanticOperationKind.TerminateScope:
      return operation.scopeId === owner &&
        referencesOwnedBy([operation.input], owner);
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

function hasOneCompletionStrategyPerScope(
  graph: SemanticProcessGraph,
  entryRootId: string,
  operationScope: ReadonlyMap<string, string>,
  dormantHandlerScopeIds: ReadonlySet<string>,
): boolean {
  const completions = operationsOfKind(
    graph,
    SemanticOperationKind.CompleteScope,
  );
  // Every kind that creates a child scope occurrence counts as that scope's one entry. Reading only
  // the unbounded kind would leave a deadline-bearing child scope with no entry at all, which reads
  // as a malformed program rather than as the missing case it is.
  const entries = [
    ...operationsOfKind(graph, SemanticOperationKind.EnterScope),
    ...operationsOfKind(graph, SemanticOperationKind.EnterBoundedScope),
  ];
  const returns = operationsOfKind(graph, SemanticOperationKind.ReturnProcess);
  return graph.definitionScopes.every(({ id, parentScopeId }) => {
    if (dormantHandlerScopeIds.has(id)) {
      return parentScopeId !== null &&
        completions.every(({ scopeId }) => scopeId !== id) &&
        entries.every(({ childScopeId }) => childScopeId !== id);
    }
    return (parentScopeId === null
      ? id === entryRootId
        ? completions.filter(({ scopeId }) => scopeId === id).length === 1 &&
          returns.every(({ id: operationId }) =>
            operationScope.get(operationId) !== id
          )
        : completions.every(({ scopeId }) => scopeId !== id) &&
          returns.filter(({ id: operationId }) =>
            operationScope.get(operationId) === id
          ).length === 1
      : completions.filter(({ scopeId }) => scopeId === id).length === 1) &&
    (parentScopeId === null
      ? entries.every(({ childScopeId }) => childScopeId !== id)
      : entries.filter(({ childScopeId }) => childScopeId === id).length === 1);
  });
}

function isWellFormedScopeForest(
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
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.CompleteScope:
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
    case SemanticOperationKind.ReturnProcess:
      return [];
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMessageBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.AwaitEventRace:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TriggerCompensation:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.ReachNoneEnd:
      return [operation.input];
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
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
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
      return [operation.output];
    case SemanticOperationKind.InitiateMessage:
      return operation.outputs;
    case SemanticOperationKind.InitiateTimer:
      return operation.outputs;
    case SemanticOperationKind.AwaitEventRace:
      return [operation.message.output, operation.timer.output];
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return [operation.normalOutput, operation.boundaryTimer.output];
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return [operation.boundaryTimer.output];
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return [operation.normalOutput];
    // Both arms are token-carrying control places: the boundary Sequence Flow receives a token when
    // the deadline wins, unlike an Event-Based Gateway's configuration flows. The monitored family
    // declares the same two outputs, though it can produce both within one run rather than one.
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMessageBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask
        ? [operation.task.output, operation.boundaryMessage.output]
        : [operation.task.output, operation.boundaryTimer.output];
    case SemanticOperationKind.EnterScope:
      return [operation.childEntry];
    // The normal route is deliberately absent, exactly as for `enterScope`: it is the child scope's
    // own `completeScope` parent output, because the deadline is withdrawn by child quiescence.
    case SemanticOperationKind.EnterBoundedScope:
      return [operation.childEntry, operation.boundaryTimer.output];
    case SemanticOperationKind.InvokeProcess:
      return [operation.calledEntry];
    case SemanticOperationKind.ReturnProcess:
      return [operation.callerOutput];
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
    case SemanticOperationKind.TriggerCompensation:
      return [operation.output];
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.ReachNoneEnd:
      return [];
    case SemanticOperationKind.CompleteScope:
      return operation.parentOutput === null ? [] : [operation.parentOutput];
  }
}

function parallelMultiInstanceOperationsArePaired(
  operations: ReadonlyArray<SemanticOperation>,
  operationScope: ReadonlyMap<string, string>,
): boolean {
  const entries = operations.filter(
    (operation): operation is Extract<
      SemanticOperation,
      { kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask }
    > => operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  );
  const completions = operations.filter(
    (operation): operation is Extract<
      SemanticOperation,
      { kind: SemanticOperationKind.CompleteParallelMultiInstanceUserTask }
    > => operation.kind === SemanticOperationKind.CompleteParallelMultiInstanceUserTask,
  );
  return entries.length === completions.length && entries.every((entry) => {
    const matches = completions.filter((completion) =>
      completion.entryOperationId === entry.id &&
      completion.origin.elementId === entry.origin.elementId &&
      completion.taskElementId === entry.task.elementId &&
      completion.normalOutput === entry.normalOutput &&
      operationScope.get(completion.id) === operationScope.get(entry.id)
    );
    return matches.length === 1;
  });
}

function parallelMultiInstanceCompletionEdges(
  operations: ReadonlyArray<SemanticOperation>,
): ReadonlyArray<OperationEdge> {
  return operations.flatMap((operation) =>
    operation.kind === SemanticOperationKind.CompleteParallelMultiInstanceUserTask
      ? [{ source: operation.entryOperationId, target: operation.id }]
      : []
  );
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
