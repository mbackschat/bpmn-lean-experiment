import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  sameCallDataInterface,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  DefinitionScope,
  InvokeProcessOperation,
  ReturnProcessOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlaceId } from "./semantic-process-identifiers.js";

export type ScopedCallOperation = Readonly<{
  operation: InvokeProcessOperation | ReturnProcessOperation;
  scopeId: string;
}>;

export function lowerCallActivityInvoke(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }>,
  source: CheckedProcess,
): ScopedCallOperation {
  const callerScopeId = requireNodeScope(source, node.id);
  const calledRoot = requireCalledRoot(source, node);
  const calledStart = requireOnlyNode(
    source,
    calledRoot.id,
    CheckedNodeKind.NoneStartEvent,
  );
  return {
    scopeId: callerScopeId,
    operation: {
      id: operationId(node.id),
      kind: SemanticOperationKind.InvokeProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: node.id },
      input: requireOnlyFlowPlace(source, node.id, "incoming"),
      calledProcessId: node.calledProcessId,
      calledRootScopeId: calledRoot.id,
      calledEntry: requireOnlyFlowPlace(source, calledStart.id, "outgoing"),
      returnOperationId: returnOperationId(node.id),
      data: node.data,
    },
  };
}

/**
 * Lowers a called root's completion: one `returnProcess` per Call naming it, each continuing that Call's output
 * (CALLN-RETURN-01). `undefined` marks a scope that is not a called root.
 */
export function lowerCalledProcessReturns(
  scope: DefinitionScope,
  source: CheckedProcess,
): ReadonlyArray<ScopedCallOperation> | undefined {
  if (scope.parentScopeId !== null || scope.originElementId === source.processId) {
    return undefined;
  }
  const calls = source.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
      node.kind === CheckedNodeKind.CallActivity &&
      node.calledProcessId === scope.originElementId,
  );
  if (calls.length === 0) {
    return undefined;
  }
  return calls.map((call) => ({
    scopeId: scope.id,
    operation: {
      id: returnOperationId(call.id),
      kind: SemanticOperationKind.ReturnProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: call.id },
      calledProcessId: call.calledProcessId,
      calledRootScopeId: scope.id,
      callerOutput: requireOnlyFlowPlace(source, call.id, "outgoing"),
      data: call.data,
    },
  }));
}

/** Checks Call-specific source-to-IL identity, entry, return, and ownership binding of the one Call. */
export function callActivityDefinitionBindingValid(
  source: CheckedProcess,
  program: SemanticProcessProgram,
): boolean {
  return source.nodes.filter(({ kind }) => kind === CheckedNodeKind.CallActivity).length === 1 &&
    callForestDefinitionBindingValid(source, program);
}

/**
 * Checks that every Call lowers to exactly its own invocation and return, bound to its called root, and that the
 * Program's one `initiate` starts the entry Process (CALLN-ADMIT-01).
 */
export function callForestDefinitionBindingValid(
  source: CheckedProcess,
  program: SemanticProcessProgram,
): boolean {
  const calls = source.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
      node.kind === CheckedNodeKind.CallActivity,
  );
  const invokes = program.operations.filter(
    (operation): operation is InvokeProcessOperation =>
      operation.kind === SemanticOperationKind.InvokeProcess,
  );
  const returns = program.operations.filter(
    (operation): operation is ReturnProcessOperation =>
      operation.kind === SemanticOperationKind.ReturnProcess,
  );
  const entryRoots = source.definitionScopes.filter(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === source.processId);
  const entryRoot = entryRoots[0];
  const initiates = program.operations.filter(
    (operation) => operation.kind === SemanticOperationKind.Initiate,
  );
  const initiate = initiates[0];
  if (
    source.processId !== program.processId ||
    !sameDefinitionScopes(source.definitionScopes, program.definitionScopes) ||
    calls.length === 0 || invokes.length !== calls.length || returns.length !== calls.length ||
    entryRoots.length !== 1 || entryRoot === undefined ||
    initiates.length !== 1 || initiate === undefined
  ) {
    return false;
  }
  const operationOwner = (operationId: string): string | undefined =>
    program.operationScopes.find((entry) => entry.operationId === operationId)
      ?.scopeId;
  const entryStarts = source.nodes.filter(
    (node) =>
      node.kind === CheckedNodeKind.NoneStartEvent &&
      requireNodeScope(source, node.id) === entryRoot.id,
  );
  const entryStart = entryStarts[0];
  return entryStarts.length === 1 && entryStart !== undefined &&
    initiate.id === operationId(entryStart.id) &&
    initiate.origin.elementId === entryStart.id &&
    initiate.output === requireOnlyFlowPlace(source, entryStart.id, "outgoing") &&
    operationOwner(initiate.id) === entryRoot.id &&
    calls.every((call) => callBindingValid(source, call, invokes, returns, operationOwner));
}

function callBindingValid(
  source: CheckedProcess,
  call: Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }>,
  invokes: ReadonlyArray<InvokeProcessOperation>,
  returns: ReadonlyArray<ReturnProcessOperation>,
  operationOwner: (operationId: string) => string | undefined,
): boolean {
  const ownInvokes = invokes.filter(({ origin }) => origin.elementId === call.id);
  const ownReturns = returns.filter(({ origin }) => origin.elementId === call.id);
  const invoke = ownInvokes[0];
  const returned = ownReturns[0];
  const calledRoots = source.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === call.calledProcessId,
  );
  const calledRoot = calledRoots[0];
  const calledStarts = calledRoot === undefined
    ? []
    : source.nodes.filter(
        (node) =>
          node.kind === CheckedNodeKind.NoneStartEvent &&
          requireNodeScope(source, node.id) === calledRoot.id,
      );
  const calledStart = calledStarts[0];
  if (
    ownInvokes.length !== 1 || invoke === undefined ||
    ownReturns.length !== 1 || returned === undefined ||
    calledRoots.length !== 1 || calledRoot === undefined ||
    calledStarts.length !== 1 || calledStart === undefined
  ) {
    return false;
  }
  return invoke.id === operationId(call.id) &&
    sameCallDataInterface(invoke.data, call.data) && sameCallDataInterface(returned.data, call.data) &&
    invoke.input === requireOnlyFlowPlace(source, call.id, "incoming") &&
    invoke.calledProcessId === call.calledProcessId &&
    invoke.calledRootScopeId === calledRoot.id &&
    invoke.calledEntry === requireOnlyFlowPlace(source, calledStart.id, "outgoing") &&
    invoke.returnOperationId === returned.id &&
    returned.id === returnOperationId(call.id) &&
    returned.calledProcessId === call.calledProcessId &&
    returned.calledRootScopeId === calledRoot.id &&
    returned.callerOutput === requireOnlyFlowPlace(source, call.id, "outgoing") &&
    operationOwner(invoke.id) === requireNodeScope(source, call.id) &&
    operationOwner(returned.id) === calledRoot.id;
}

function requireCalledRoot(
  source: CheckedProcess,
  node: Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }>,
): DefinitionScope {
  const roots = source.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === node.calledProcessId,
  );
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) {
    throw new TypeError(`Checked Call Activity ${node.id} requires one called root`);
  }
  return root;
}

function requireOnlyNode<Kind extends CheckedNodeKind>(
  source: CheckedProcess,
  scopeId: string,
  kind: Kind,
): Extract<CheckedNode, { kind: Kind }> {
  const nodes = source.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: Kind }> =>
      node.kind === kind && requireNodeScope(source, node.id) === scopeId,
  );
  const node = nodes[0];
  if (nodes.length !== 1 || node === undefined) {
    throw new TypeError(`Checked scope ${scopeId} requires one ${kind}`);
  }
  return node;
}

function requireNodeScope(source: CheckedProcess, nodeId: string): string {
  const owners = source.nodeScopes.filter(({ nodeId: candidate }) =>
    candidate === nodeId
  );
  const owner = owners[0];
  if (owners.length !== 1 || owner === undefined) {
    throw new TypeError(`Checked node ${nodeId} requires one definition scope`);
  }
  return owner.scopeId;
}

function requireOnlyFlowPlace(
  source: CheckedProcess,
  nodeId: string,
  direction: "incoming" | "outgoing",
): string {
  const flows = source.sequenceFlows.filter((flow) =>
    direction === "incoming" ? flow.targetId === nodeId : flow.sourceId === nodeId
  );
  const flow = flows[0];
  if (flows.length !== 1 || flow === undefined) {
    throw new TypeError(`Checked node ${nodeId} requires one ${direction} flow`);
  }
  return controlPlaceId(flow.id);
}

function sameDefinitionScopes(
  left: ReadonlyArray<DefinitionScope>,
  right: ReadonlyArray<DefinitionScope>,
): boolean {
  return left.length === right.length && left.every((scope, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      scope.id === candidate.id &&
      scope.parentScopeId === candidate.parentScopeId &&
      scope.originElementId === candidate.originElementId;
  });
}

function operationId(elementId: string): string {
  return `operation:${elementId}`;
}

function returnOperationId(elementId: string): string {
  return `operation:return-process:${elementId}`;
}
