import {
  compensationExecutionMatchesProgram,
  isCompensationExecutionDeclaration,
} from "./compensation-trigger-handler-program-admission.js";
import {
  InternalSchedulingMode,
  SemanticOperationKind as Kind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";

/** Coarse operation inventory; admission also requires the complete graph predicate. */
export function transactionCancellationProgramShape(
  operations: readonly SemanticOperation[],
  scopeCount: number,
): boolean {
  if (scopeCount !== 2) return false;
  const counts = new Map<Kind, number>();
  for (const operation of operations) {
    counts.set(operation.kind, (counts.get(operation.kind) ?? 0) + 1);
    let fields: readonly string[];
    switch (operation.kind) {
      case Kind.Initiate: fields = ["output"]; break;
      case Kind.EnterScope: fields = ["input", "childEntry", "childScopeId"]; break;
      case Kind.AwaitUserTask:
        if (!keys(operation.task, ["elementId", "name"]) ||
            operation.task.elementId !== operation.origin.elementId ||
            (operation.task.name !== null && !isWellFormedWireString(operation.task.name))) return false;
        fields = ["input", "output", "task"];
        break;
      case Kind.Duplicate:
        if (operation.outputs.length !== 2 || new Set(operation.outputs).size !== 2) return false;
        fields = ["input", "outputs"];
        break;
      case Kind.CancelTransaction:
        fields = ["definitionScopeId", "input", "output", "boundaryEventElementId"];
        break;
      case Kind.ReachNoneEnd: fields = ["input"]; break;
      case Kind.CompleteScope: fields = ["scopeId", "parentOutput"]; break;
      default: return false;
    }
    if (!keys(operation, ["id", "kind", "origin", ...fields]) ||
        !keys(operation.origin, ["kind", "elementId"]) ||
        operation.origin.kind !== SemanticOriginKind.BpmnElement ||
        !identifier(operation.origin.elementId) ||
        operation.id !== (operation.kind === Kind.CompleteScope
          ? `operation:complete-scope:${operation.scopeId}`
          : `operation:${operation.origin.elementId}`)) return false;
  }
  const tasks = counts.get(Kind.AwaitUserTask) ?? 0;
  return counts.get(Kind.Initiate) === 1 && counts.get(Kind.EnterScope) === 1 &&
    counts.get(Kind.Duplicate) === 1 && counts.get(Kind.CancelTransaction) === 1 &&
    counts.get(Kind.ReachNoneEnd) === 3 && counts.get(Kind.CompleteScope) === 2 &&
    tasks >= 3 && tasks <= 5;
}

/** Checks the bounded role grammar in TRANSACTION-CANCELLATION-PROPOSAL.md, independent of fixture IDs. */
export function transactionCancellationProgramGraph(program: SemanticProcessProgram): boolean {
  if (!keys(program, ["kind", "identity", "internalSchedulingMode", "processId", "definitionScopes",
      "operationScopes", "controlPlaceScopes", "controlPlaces", "operations",
      "compensationActivityRetention", "compensationExecution"]) ||
      program.kind !== SemanticProcessKind.SemanticProcess ||
      !keys(program.identity, ["compiler", "semanticProfile", "sourceId", "sourceSha256", "sourceOverlay"]) ||
      program.identity.compiler !== SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
      program.identity.semanticProfile !== "bpmn-2.0.2-transaction-cancellation-checkpoint-draft" ||
      program.identity.sourceOverlay !== null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      !transactionCancellationProgramShape(program.operations, program.definitionScopes.length)) return false;

  const root = program.definitionScopes.find((scope) => scope.parentScopeId === null);
  const child = program.definitionScopes.find((scope) => scope.parentScopeId !== null);
  if (root === undefined || child === undefined || root.originElementId !== program.processId ||
      child.parentScopeId !== root.id || child.id === root.id ||
      !program.definitionScopes.every((scope) => keys(scope, ["id", "originElementId", "parentScopeId"]) &&
        identifier(scope.originElementId) && scope.id === `scope:${scope.originElementId}`)) return false;

  const owners = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const placeOwners = new Map(program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) => [controlPlaceId, scopeId]));
  const places = new Map(program.controlPlaces.map((place) => [place.id, place]));
  if (owners.size !== program.operationScopes.length || owners.size !== program.operations.length ||
      new Set(program.operations.map(({ id }) => id)).size !== program.operations.length ||
      placeOwners.size !== program.controlPlaceScopes.length || places.size !== program.controlPlaces.length ||
      places.size !== placeOwners.size ||
      !program.operationScopes.every((owner) => keys(owner, ["operationId", "scopeId"])) ||
      !program.controlPlaceScopes.every((owner) => keys(owner, ["controlPlaceId", "scopeId"])) ||
      !program.controlPlaces.every((place) => keys(place, ["id", "origin"]) &&
        keys(place.origin, ["kind", "elementId"]) &&
        place.origin.kind === SemanticOriginKind.BpmnSequenceFlow && identifier(place.origin.elementId) &&
        place.id === `place:${place.origin.elementId}`)) return false;

  const start = program.operations.find((op) => op.kind === Kind.Initiate);
  const entry = program.operations.find((op) => op.kind === Kind.EnterScope);
  const split = program.operations.find((op) => op.kind === Kind.Duplicate);
  const cancel = program.operations.find((op) => op.kind === Kind.CancelTransaction);
  const rootCompletion = program.operations.find((op) => op.kind === Kind.CompleteScope && op.scopeId === root.id);
  const childCompletion = program.operations.find((op) => op.kind === Kind.CompleteScope && op.scopeId === child.id);
  if (start === undefined || entry === undefined || split === undefined || cancel === undefined ||
      rootCompletion?.kind !== Kind.CompleteScope || childCompletion?.kind !== Kind.CompleteScope ||
      rootCompletion.parentOutput !== null || childCompletion.parentOutput === null ||
      rootCompletion.origin.elementId !== root.originElementId ||
      childCompletion.origin.elementId !== child.originElementId ||
      entry.childScopeId !== child.id || entry.origin.elementId !== child.originElementId ||
      cancel.definitionScopeId !== child.id || !identifier(cancel.boundaryEventElementId)) return false;

  if (!declarationsMatch(program, child.id)) return false;
  const target = program.compensationActivityRetention!.targets[0]!;
  // BPMN IDs share one namespace; completion operations alone repeat their scope's provenance.
  const elementIds = [program.processId,
    ...program.operations.filter((op) => op.kind !== Kind.CompleteScope).map((op) => op.origin.elementId),
    ...program.controlPlaces.map((place) => place.origin.elementId),
    cancel.boundaryEventElementId, target.boundaryEventElementId, target.compensationActivityElementId];
  if (new Set(elementIds).size !== elementIds.length) return false;

  const visitedOperations = new Set<string>();
  const visitedPlaces = new Set<string>();
  const consumers = new Map<string, SemanticOperation>();
  for (const operation of program.operations) {
    if (!("input" in operation)) continue;
    if (consumers.has(operation.input)) return false;
    consumers.set(operation.input, operation);
  }
  const visit = (operation: SemanticOperation, scopeId: string): boolean => {
    if (visitedOperations.has(operation.id) || owners.get(operation.id) !== scopeId) return false;
    visitedOperations.add(operation.id);
    return true;
  };
  const edge = (placeId: string, scopeId: string): SemanticOperation | undefined => {
    if (!places.has(placeId) || placeOwners.get(placeId) !== scopeId || visitedPlaces.has(placeId)) return undefined;
    visitedPlaces.add(placeId);
    return consumers.get(placeId);
  };
  const end = (placeId: string): boolean => {
    const operation = edge(placeId, root.id);
    return operation?.kind === Kind.ReachNoneEnd && visit(operation, root.id);
  };
  if (!visit(start, root.id) || edge(start.output, root.id) !== entry || !visit(entry, root.id) ||
      !visit(rootCompletion, root.id) || !visit(childCompletion, child.id) ||
      edge(entry.childEntry, child.id) !== split || !visit(split, child.id) ||
      !end(childCompletion.parentOutput)) return false;

  const acknowledgement = edge(cancel.output, root.id);
  if (acknowledgement?.kind !== Kind.AwaitUserTask || !visit(acknowledgement, root.id) ||
      !end(acknowledgement.output)) return false;

  let cancelBranches = 0;
  let ordinaryBranches = 0;
  for (const output of split.outputs) {
    let operation = edge(output, child.id);
    const tasks: string[] = [];
    while (operation?.kind === Kind.AwaitUserTask) {
      if (tasks.length === 2 || !visit(operation, child.id)) return false;
      tasks.push(operation.task.elementId);
      operation = edge(operation.output, child.id);
    }
    if (tasks.length === 0 || operation === undefined || !visit(operation, child.id)) return false;
    switch (operation.kind) {
      case Kind.CancelTransaction:
        if (operation !== cancel || tasks.includes(target.activityElementId)) return false;
        cancelBranches += 1;
        break;
      case Kind.ReachNoneEnd:
        if (!tasks.includes(target.activityElementId)) return false;
        ordinaryBranches += 1;
        break;
      default: return false;
    }
  }
  return cancelBranches === 1 && ordinaryBranches === 1 &&
    visitedOperations.size === program.operations.length && visitedPlaces.size === program.controlPlaces.length;
}

function declarationsMatch(program: SemanticProcessProgram, childScopeId: string): boolean {
  const retention = program.compensationActivityRetention;
  const execution = program.compensationExecution;
  if (retention === undefined || !keys(retention, ["definitionScopeId", "targets", "limits"]) ||
      retention.definitionScopeId !== childScopeId || retention.targets.length !== 1 ||
      !keys(retention.limits, ["maxRecords", "maxCanonicalBytes"]) ||
      retention.limits.maxRecords !== 1 || retention.limits.maxCanonicalBytes !== 4096 ||
      !isCompensationExecutionDeclaration(execution) || execution.definitionScopeId !== childScopeId ||
      execution.subjects.length !== 1 || execution.dependencies.length !== 0 ||
      execution.limits.maxTriggers !== 1 || execution.limits.maxHandlers !== 1 ||
      execution.limits.maxCanonicalBytes !== 20480) return false;
  const target = retention.targets[0];
  return target !== undefined && keys(target, ["activityElementId", "boundaryEventElementId", "compensationActivityElementId"]) &&
    identifier(target.activityElementId) && identifier(target.boundaryEventElementId) &&
    identifier(target.compensationActivityElementId) && compensationExecutionMatchesProgram(program);
}

function identifier(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function keys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}
