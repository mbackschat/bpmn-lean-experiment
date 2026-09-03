/** Exact control topology admitted by the source-bound Compensation hosting checkpoint. */
import {
  SemanticOperationKind,
  type SemanticOperation,
} from "./semantic-process-contract.js";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
} from "./semantic-profile-catalog.js";

type OperationEdge = Readonly<{ source: string; target: string }>;

type CompensationCheckpointTopology = Readonly<{
  semanticProfile: string;
  operations: ReadonlyArray<SemanticOperation>;
  edges: ReadonlyArray<OperationEdge>;
  operationScope: ReadonlyMap<string, string>;
  rootScopeId: string;
}>;

/** Keeps the hosted trigger behind both split branches; see the capsule's Temporal preflight. */
export function compensationSourceCheckpointTopologyAdmitted({
  semanticProfile,
  operations,
  edges,
  operationScope,
  rootScopeId,
}: CompensationCheckpointTopology): boolean {
  if (semanticProfile !== COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID) {
    return true;
  }
  const starts = operationsOfKind(operations, SemanticOperationKind.Initiate);
  const splits = operationsOfKind(operations, SemanticOperationKind.Duplicate);
  const tasks = operationsOfKind(operations, SemanticOperationKind.AwaitUserTask);
  const entries = operationsOfKind(operations, SemanticOperationKind.EnterScope);
  const joins = operationsOfKind(operations, SemanticOperationKind.Synchronize);
  const triggers = operationsOfKind(
    operations,
    SemanticOperationKind.TriggerCompensation,
  );
  const ends = operationsOfKind(operations, SemanticOperationKind.ReachNoneEnd);
  const completions = operationsOfKind(
    operations,
    SemanticOperationKind.CompleteScope,
  );
  const start = starts[0];
  const split = splits[0];
  const entry = entries[0];
  const join = joins[0];
  const trigger = triggers[0];
  if (
    starts.length !== 1 || start === undefined ||
    splits.length !== 1 || split === undefined ||
    tasks.length !== 3 ||
    entries.length !== 1 || entry === undefined ||
    joins.length !== 1 || join === undefined ||
    triggers.length !== 1 || trigger === undefined ||
    ends.length !== 2 || completions.length !== 2 ||
    operationScope.get(start.id) !== rootScopeId ||
    operationScope.get(split.id) !== rootScopeId ||
    operationScope.get(entry.id) !== rootScopeId ||
    operationScope.get(join.id) !== rootScopeId ||
    operationScope.get(trigger.id) !== rootScopeId
  ) {
    return false;
  }

  const rootTasks = tasks.filter(({ id }) => operationScope.get(id) === rootScopeId);
  const childTasks = tasks.filter(({ id }) => operationScope.get(id) === entry.childScopeId);
  const rootEnds = ends.filter(({ id }) => operationScope.get(id) === rootScopeId);
  const childEnds = ends.filter(({ id }) => operationScope.get(id) === entry.childScopeId);
  const rootCompletions = completions.filter(({ scopeId }) => scopeId === rootScopeId);
  const childCompletions = completions.filter(
    ({ scopeId }) => scopeId === entry.childScopeId,
  );
  const reserveTask = rootTasks.find(({ id }) => hasEdge(edges, id, entry.id));
  const insuranceTasks = rootTasks.filter(({ id }) => id !== reserveTask?.id);
  const insuranceTask = insuranceTasks[0];
  const childTask = childTasks[0];
  const rootEnd = rootEnds[0];
  const childEnd = childEnds[0];
  const rootCompletion = rootCompletions[0];
  const childCompletion = childCompletions[0];
  if (
    rootTasks.length !== 2 || reserveTask === undefined ||
    insuranceTasks.length !== 1 || insuranceTask === undefined ||
    childTasks.length !== 1 || childTask === undefined ||
    rootEnds.length !== 1 || rootEnd === undefined ||
    childEnds.length !== 1 || childEnd === undefined ||
    rootCompletions.length !== 1 || rootCompletion === undefined ||
    childCompletions.length !== 1 || childCompletion === undefined
  ) {
    return false;
  }

  return hasExactlyEdges(edges, [
    { source: start.id, target: split.id },
    { source: split.id, target: reserveTask.id },
    { source: split.id, target: insuranceTask.id },
    { source: reserveTask.id, target: entry.id },
    { source: entry.id, target: childTask.id },
    { source: childTask.id, target: childEnd.id },
    { source: childEnd.id, target: childCompletion.id },
    { source: childCompletion.id, target: join.id },
    { source: insuranceTask.id, target: join.id },
    { source: join.id, target: trigger.id },
    { source: trigger.id, target: rootEnd.id },
    { source: rootEnd.id, target: rootCompletion.id },
  ]);
}

function operationsOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): ReadonlyArray<Extract<SemanticOperation, { kind: Kind }>> {
  return operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: Kind }> =>
      operation.kind === kind,
  );
}

function hasEdge(
  edges: ReadonlyArray<OperationEdge>,
  source: string,
  target: string,
): boolean {
  return edges.some((edge) => edge.source === source && edge.target === target);
}

function hasExactlyEdges(
  actual: ReadonlyArray<OperationEdge>,
  expected: ReadonlyArray<OperationEdge>,
): boolean {
  return actual.length === expected.length && expected.every(({ source, target }) =>
    actual.filter((edge) => edge.source === source && edge.target === target).length === 1
  );
}
