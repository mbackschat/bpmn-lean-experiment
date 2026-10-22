import { SemanticOperationKind, SemanticOriginKind } from "./semantic-process-contract.js";
import type { DefinitionScope } from "./semantic-value-contract.js";
import type {
  InvokeProcessOperation,
  ReturnProcessOperation,
  SemanticOperation,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";
import { callDataInterfaceValid, isCallDataInterface, sameCallDataInterface } from "./call-data-admission.js";

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
      "data",
    ]) &&
    isPlaceReference(value.input, placeIds) &&
    isNonEmptyString(value.calledProcessId) &&
    isNonEmptyString(value.calledRootScopeId) &&
    scopeOrigins.has(value.calledRootScopeId) &&
    isPlaceReference(value.calledEntry, placeIds) &&
    isNonEmptyString(value.returnOperationId) &&
    hasOwnedCallData(value);
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
      "data",
    ]) &&
    isNonEmptyString(value.calledProcessId) &&
    isNonEmptyString(value.calledRootScopeId) &&
    scopeOrigins.has(value.calledRootScopeId) &&
    isPlaceReference(value.callerOutput, placeIds) &&
    hasOwnedCallData(value);
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
        callerScopeOf(definitionScopes, operationScope.get(invoke.id), entryRoot.id) &&
        operationScope.get(returned.id) === calledRoot.id &&
        placeScope.get(invoke.input) === operationScope.get(invoke.id) &&
        placeScope.get(invoke.calledEntry) === calledRoot.id &&
        placeScope.get(returned.callerOutput) === operationScope.get(invoke.id) &&
        returned.origin.kind === SemanticOriginKind.BpmnElement &&
        returned.origin.elementId === invoke.origin.elementId &&
        returned.calledProcessId === invoke.calledProcessId &&
        returned.calledRootScopeId === invoke.calledRootScopeId &&
        sameCallDataInterface(invoke.data, returned.data);
    }) &&
    returns.every((returned) =>
      invokes.filter(({ returnOperationId }) => returnOperationId === returned.id)
        .length === 1
    );
}

/**
 * A Call sits in the entry root or in an embedded scope below it, never in a called root: the Call record, not a parent
 * pointer, links the called root to that occurrence, and the scope count bounds a cyclic parent relation.
 */
function callerScopeOf(
  definitionScopes: ReadonlyArray<DefinitionScope>,
  scopeId: string | undefined,
  entryRootId: string,
): boolean {
  let current = scopeId;
  for (let fuel = definitionScopes.length; fuel > 0 && current !== undefined; fuel -= 1) {
    if (current === entryRootId) return true;
    const matching = definitionScopes.filter(({ id }) => id === current);
    current = matching.length === 1 ? matching[0]?.parentScopeId ?? undefined : undefined;
  }
  return false;
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

function hasOwnedCallData(value: Record<string, unknown>): boolean {
  const origin = value.origin;
  return typeof origin === "object" && origin !== null && "elementId" in origin &&
    isNonEmptyString(origin.elementId) && isNonEmptyString(value.calledProcessId) &&
    isCallDataInterface(value.data) && callDataInterfaceValid(value.data, origin.elementId, value.calledProcessId);
}
