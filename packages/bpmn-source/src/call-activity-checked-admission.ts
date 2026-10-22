import {
  CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID,
  CallDataKind,
  callDataInterfaceValid,
  compareCanonicalStrings,
  CheckedNodeKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  DefinitionScope,
  ScalarIoSpecification,
} from "@bpmn-lean/semantic-core";

export type CallActivityCheckedGraph = Readonly<{
  processId: string;
  definitionScopes: ReadonlyArray<DefinitionScope>;
  nodes: ReadonlyArray<CheckedNode>;
  flows: ReadonlyArray<CheckedSequenceFlow>;
}>;

export function hasSelectedCallActivityDefinitions(
  semanticProfile: string,
  graph: CallActivityCheckedGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  const scalarData = semanticProfile === CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID;
  if (semanticProfile === SemanticProfileId.NestedEmbeddedScopeData) return hasMappedCallRoots(graph);
  if (semanticProfile === SemanticProfileId.EmbeddedSubProcessCompletion) return hasCallForestRoots(graph);
  if (semanticProfile !== SemanticProfileId.CalledProcessCallActivity && !scalarData) {
    return graph.definitionScopes.filter(({ parentScopeId }) =>
      parentScopeId === null
    ).length === 1;
  }
  const roots = graph.definitionScopes.filter(
    ({ parentScopeId }) => parentScopeId === null,
  );
  const entryRoots = roots.filter(
    ({ originElementId }) => originElementId === graph.processId,
  );
  const calls = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
      node.kind === CheckedNodeKind.CallActivity,
  );
  const entryRoot = entryRoots[0];
  const call = calls[0];
  const calledRoots = call === undefined
    ? []
    : roots.filter(({ originElementId }) =>
        originElementId === call.calledProcessId
      );
  const calledRoot = calledRoots[0];
  return roots.length === 2 &&
    entryRoots.length === 1 &&
    entryRoot !== undefined &&
    calls.length === 1 &&
    call !== undefined &&
    calledRoots.length === 1 &&
    calledRoot !== undefined &&
    calledRoot.id !== entryRoot.id &&
    nodeScopes.get(call.id) === entryRoot.id &&
    (!scalarData || hasScalarDataTopology(graph, nodeScopes, entryRoot.id, calledRoot.id, call));
}

/**
 * CVM-ADMIT-01's root census: one called root per Call, at most one Call, the caller root naming the checked Process.
 * This census does not decide placement: the nested scope-data analysis refuses a Call inside an embedded Sub-Process
 * (PC-SCOPE-05) and owns the called path.
 */
function hasMappedCallRoots(graph: CallActivityCheckedGraph): boolean {
  const roots = graph.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null);
  const calls = graph.nodes.filter((node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
    node.kind === CheckedNodeKind.CallActivity);
  return calls.length <= 1 && roots.length === calls.length + 1 &&
    roots.filter(({ originElementId }) => originElementId === graph.processId).length === 1 &&
    calls.every((call) => call.data.kind === CallDataKind.VariableMappings && call.calledProcessId !== graph.processId &&
      roots.filter(({ originElementId }) => originElementId === call.calledProcessId).length === 1);
}

/**
 * CALLN-ADMIT-01's root census: one root per distinct called definition plus the caller root naming the checked
 * Process, and only empty-data Calls of another root. Placement, acyclicity, depth and the concurrency rules are the
 * nested scope-control analysis's, which sees the whole forest.
 */
function hasCallForestRoots(graph: CallActivityCheckedGraph): boolean {
  const roots = graph.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null);
  const calls = graph.nodes.filter((node): node is Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }> =>
    node.kind === CheckedNodeKind.CallActivity);
  const calledProcessIds = new Set(calls.map(({ calledProcessId }) => calledProcessId));
  return roots.length === calledProcessIds.size + 1 &&
    roots.filter(({ originElementId }) => originElementId === graph.processId).length === 1 &&
    calls.every((call) => call.data.kind === CallDataKind.Empty && call.calledProcessId !== graph.processId &&
      roots.filter(({ originElementId }) => originElementId === call.calledProcessId).length === 1);
}

/** CDATA-MATCH-01 binds task endpoints and the exact serial topology to the retained Call declaration. */
function hasScalarDataTopology(
  graph: CallActivityCheckedGraph,
  nodeScopes: ReadonlyMap<string, string>,
  callerScope: string,
  calledScope: string,
  call: Extract<CheckedNode, { kind: CheckedNodeKind.CallActivity }>,
): boolean {
  const data = call.data;
  if (data.kind !== CallDataKind.Scalar || !callDataInterfaceValid(data, call.id, call.calledProcessId) ||
      graph.definitionScopes.length !== 2 || data.directInput.source.kind !== "property" ||
      data.directOutput.target.kind !== "property" ||
      data.callerProperties.some((id, index) => index > 0 && compareCanonicalStrings(data.callerProperties[index - 1] ?? "", id) >= 0)) return false;
  const caller = graph.nodes.filter(({ id }) => nodeScopes.get(id) === callerScope);
  const called = graph.nodes.filter(({ id }) => nodeScopes.get(id) === calledScope);
  const callerStart = only(caller, CheckedNodeKind.NoneStartEvent);
  const callerTask = only(caller, CheckedNodeKind.DataInputOutputUserTask);
  const callerEnd = only(caller, CheckedNodeKind.NoneEndEvent);
  const calledStart = only(called, CheckedNodeKind.NoneStartEvent);
  const calledTask = only(called, CheckedNodeKind.DataInputOutputUserTask);
  const calledEnd = only(called, CheckedNodeKind.NoneEndEvent);
  if (caller.length !== 4 || called.length !== 3 || callerStart === undefined || callerTask === undefined ||
      callerEnd === undefined || calledStart === undefined || calledTask === undefined || calledEnd === undefined ||
      callerTask.directInput.source.kind !== "property" || callerTask.directOutput.target.kind !== "property" ||
      calledTask.directInput.source.kind !== "processDataInput" || calledTask.directOutput.target.kind !== "processDataOutput") return false;
  const receipt = callerTask.directOutput.target.propertyId;
  if (callerTask.directInput.source.propertyId !== data.directOutput.target.propertyId ||
      !data.callerProperties.includes(receipt) || receipt === data.directInput.source.propertyId ||
      receipt === data.directOutput.target.propertyId ||
      calledTask.directInput.source.dataInputId !== data.called.input.id ||
      calledTask.directOutput.target.dataOutputId !== data.called.output.id) return false;
  const edges = [[callerStart.id, call.id], [call.id, callerTask.id], [callerTask.id, callerEnd.id],
    [calledStart.id, calledTask.id], [calledTask.id, calledEnd.id]];
  const ids = [graph.processId, call.calledProcessId, ...graph.nodes.map(({ id }) => id),
    ...graph.flows.map(({ id }) => id), ...data.callerProperties, ...interfaceDeclarationIds(data.call),
    ...interfaceDeclarationIds(data.called), data.directInput.associationId, data.directOutput.associationId,
    ...[callerTask, calledTask].flatMap(({ directInput, directOutput }) =>
      [directInput.associationId, directInput.targetDataInputId, directOutput.associationId, directOutput.sourceDataOutputId])];
  return ids.every((id) => id.length > 0) && new Set(ids).size === ids.length &&
    graph.flows.length === edges.length && edges.every(([source, target]) =>
      graph.flows.filter(({ sourceId, targetId, condition }) => sourceId === source && targetId === target && condition === null).length === 1);
}

function only<Kind extends CheckedNodeKind>(nodes: ReadonlyArray<CheckedNode>, kind: Kind): Extract<CheckedNode, { kind: Kind }> | undefined {
  const matches = nodes.filter((node): node is Extract<CheckedNode, { kind: Kind }> => node.kind === kind);
  return matches.length === 1 ? matches[0] : undefined;
}

function interfaceDeclarationIds(io: ScalarIoSpecification): ReadonlyArray<string> {
  return [io.id, io.input.id, io.output.id, io.inputSet.id, io.outputSet.id];
}
