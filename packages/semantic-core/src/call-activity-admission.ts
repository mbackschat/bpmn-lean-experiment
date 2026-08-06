import { SemanticOperationKind, SemanticOriginKind } from "./semantic-process-contract.js";
import type { DefinitionScope } from "./semantic-value-contract.js";
import type {
  InvokeProcessOperation,
  ReturnProcessOperation,
  SemanticOperation,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";

type OperationEdge = Readonly<{ source: string; target: string }>;

export function isWellFormedInvokeProcessOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  scopeOrigins: ReadonlyMap<string, string>,
): value is InvokeProcessOperation {
  return hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "calledProcessId",
      "calledRootScopeId",
      "calledEntry",
      "returnOperationId",
    ]) &&
    isPlaceReference(value.input, placeIds) &&
    isNonEmptyString(value.calledProcessId) &&
    isNonEmptyString(value.calledRootScopeId) &&
    scopeOrigins.has(value.calledRootScopeId) &&
    isPlaceReference(value.calledEntry, placeIds) &&
    isNonEmptyString(value.returnOperationId);
}

export function isWellFormedReturnProcessOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  scopeOrigins: ReadonlyMap<string, string>,
): value is ReturnProcessOperation {
  return hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "calledProcessId",
      "calledRootScopeId",
      "callerOutput",
    ]) &&
    isNonEmptyString(value.calledProcessId) &&
    isNonEmptyString(value.calledRootScopeId) &&
    scopeOrigins.has(value.calledRootScopeId) &&
    isPlaceReference(value.callerOutput, placeIds);
}

/** Requires each invocation to cross from the entry root into one exact called-root return pair. */
export function callOperationsArePaired(
  processId: string,
  definitionScopes: ReadonlyArray<DefinitionScope>,
  operations: ReadonlyArray<SemanticOperation>,
  operationScope: ReadonlyMap<string, string>,
  placeScope: ReadonlyMap<string, string>,
): boolean {
  const invokes = operationsOfKind(operations, SemanticOperationKind.InvokeProcess);
  const returns = operationsOfKind(operations, SemanticOperationKind.ReturnProcess);
  if (invokes.length === 0 && returns.length === 0) {
    return true;
  }
  const entryRoots = definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === processId,
  );
  if (entryRoots.length !== 1) {
    return false;
  }
  const entryRoot = entryRoots[0];
  return entryRoot !== undefined &&
    invokes.length === returns.length &&
    invokes.every((invoke) => {
      const matching = returns.filter(({ id }) => id === invoke.returnOperationId);
      const returned = matching[0];
      const calledRoots = definitionScopes.filter(
        ({ parentScopeId, originElementId }) =>
          parentScopeId === null &&
          originElementId === invoke.calledProcessId,
      );
      const calledRoot = calledRoots[0];
      return matching.length === 1 &&
        returned !== undefined &&
        calledRoots.length === 1 &&
        calledRoot !== undefined &&
        calledRoot.id === invoke.calledRootScopeId &&
        calledRoot.id !== entryRoot.id &&
        operationScope.get(invoke.id) === entryRoot.id &&
        operationScope.get(returned.id) === calledRoot.id &&
        placeScope.get(invoke.input) === entryRoot.id &&
        placeScope.get(invoke.calledEntry) === calledRoot.id &&
        placeScope.get(returned.callerOutput) === entryRoot.id &&
        returned.origin.kind === SemanticOriginKind.BpmnElement &&
        returned.origin.elementId === invoke.origin.elementId &&
        returned.calledProcessId === invoke.calledProcessId &&
        returned.calledRootScopeId === invoke.calledRootScopeId;
    }) &&
    returns.every((returned) =>
      invokes.filter(({ returnOperationId }) => returnOperationId === returned.id)
        .length === 1
    );
}

/** Supplies the virtual called-End-to-return edge erased from control places. */
export function callCompletionEdges(
  operations: ReadonlyArray<SemanticOperation>,
  operationScope: ReadonlyMap<string, string>,
): ReadonlyArray<OperationEdge> {
  return operationsOfKind(operations, SemanticOperationKind.ReturnProcess)
    .flatMap((returned) => {
      const owner = operationScope.get(returned.id);
      const ends = operationsOfKind(operations, SemanticOperationKind.ReachNoneEnd)
        .filter(({ id }) => operationScope.get(id) === owner);
      return ends.length === 1 && ends[0] !== undefined
        ? [{ source: ends[0].id, target: returned.id }]
        : [];
    });
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

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
