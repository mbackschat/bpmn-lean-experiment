import {
  CheckedNodeKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  DefinitionScope,
} from "@bpmn-lean/semantic-core";

export type CallActivityCheckedGraph = Readonly<{
  processId: string;
  definitionScopes: ReadonlyArray<DefinitionScope>;
  nodes: ReadonlyArray<CheckedNode>;
}>;

export function hasSelectedCallActivityDefinitions(
  semanticProfile: string,
  graph: CallActivityCheckedGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  if (semanticProfile !== SemanticProfileId.CalledProcessCallActivity) {
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
    nodeScopes.get(call.id) === entryRoot.id;
}
