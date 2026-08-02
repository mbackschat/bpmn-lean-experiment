import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  DefinitionScope,
  InvokeProcessOperation,
  ReturnProcessOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

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
    },
  };
}

export function lowerCalledProcessReturn(
  scope: DefinitionScope,
  source: CheckedProcess,
): ScopedCallOperation | undefined {
  if (scope.parentScopeId !== null || scope.originElementId === source.processId) {
    return undefined;
  }
  const calls = source.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
      node.kind === CheckedNodeKind.CallActivity &&
      node.calledProcessId === scope.originElementId,
  );
  const call = calls[0];
  if (calls.length !== 1 || call === undefined) {
    return undefined;
  }
  return {
    scopeId: scope.id,
    operation: {
      id: returnOperationId(call.id),
      kind: SemanticOperationKind.ReturnProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: call.id },
      calledProcessId: call.calledProcessId,
      calledRootScopeId: scope.id,
      callerOutput: requireOnlyFlowPlace(source, call.id, "outgoing"),
    },
  };
}

/** Checks Call-specific source-to-IL identity, entry, return, and ownership binding. */
export function callActivityDefinitionBindingValid(
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
  const call = calls[0];
  const invoke = invokes[0];
  const returned = returns[0];
  if (
    source.processId !== program.processId ||
    !sameDefinitionScopes(source.definitionScopes, program.definitionScopes) ||
    calls.length !== 1 ||
    call === undefined ||
    invokes.length !== 1 ||
    invoke === undefined ||
    returns.length !== 1 ||
    returned === undefined
  ) {
    return false;
  }
  const callerScopeId = requireNodeScope(source, call.id);
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
    calledRoots.length !== 1 ||
    calledRoot === undefined ||
    calledStarts.length !== 1 ||
    calledStart === undefined
  ) {
    return false;
  }
  const operationOwner = (operationId: string): string | undefined =>
    program.operationScopes.find((entry) => entry.operationId === operationId)
      ?.scopeId;
  const callerStarts = source.nodes.filter(
    (node) =>
      node.kind === CheckedNodeKind.NoneStartEvent &&
      requireNodeScope(source, node.id) === callerScopeId,
  );
  const callerStart = callerStarts[0];
  const initiates = program.operations.filter(
    (operation) => operation.kind === SemanticOperationKind.Initiate,
  );
  const initiate = initiates[0];
  if (
    callerStarts.length !== 1 ||
    callerStart === undefined ||
    initiates.length !== 1 ||
    initiate === undefined
  ) {
    return false;
  }
  return invoke.origin.elementId === call.id &&
    invoke.input === requireOnlyFlowPlace(source, call.id, "incoming") &&
    invoke.calledProcessId === call.calledProcessId &&
    invoke.calledRootScopeId === calledRoot.id &&
    invoke.calledEntry === requireOnlyFlowPlace(source, calledStart.id, "outgoing") &&
    invoke.returnOperationId === returned.id &&
    returned.id === returnOperationId(call.id) &&
    returned.origin.elementId === call.id &&
    returned.calledProcessId === call.calledProcessId &&
    returned.calledRootScopeId === calledRoot.id &&
    returned.callerOutput === requireOnlyFlowPlace(source, call.id, "outgoing") &&
    operationOwner(invoke.id) === callerScopeId &&
    operationOwner(returned.id) === calledRoot.id &&
    initiate.id === operationId(callerStart.id) &&
    initiate.origin.elementId === callerStart.id &&
    initiate.output === requireOnlyFlowPlace(source, callerStart.id, "outgoing") &&
    operationOwner(initiate.id) === callerScopeId;
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
  return `place:${flow.id}`;
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
