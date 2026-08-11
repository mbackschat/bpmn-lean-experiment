import {
  CheckedNodeKind,
  SemanticCheckpointProfileId,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";

import type { CheckedProcessGraph } from "./checked-process-graph-admission.js";

/** Locks the selected Start-to-configured-to-User-to-End topology without fixture IDs. */
export function hasSelectedConfiguredTaskTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticCheckpointProfileId.ConfiguredTask) {
    return true;
  }
  const only = <Kind extends CheckedNodeKind>(
    kind: Kind,
  ): Extract<CheckedNode, { kind: Kind }> | undefined => {
    const matches = graph.nodes.filter(
      (node): node is Extract<CheckedNode, { kind: Kind }> =>
        node.kind === kind,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const rootScope = graph.definitionScopes[0];
  const start = only(CheckedNodeKind.NoneStartEvent);
  const configured = only(CheckedNodeKind.ConfiguredTask);
  const user = only(CheckedNodeKind.UserTask);
  const end = only(CheckedNodeKind.NoneEndEvent);
  if (
    graph.definitionScopes.length !== 1 ||
    rootScope?.parentScopeId !== null ||
    rootScope.originElementId !== graph.processId ||
    graph.nodes.length !== 4 ||
    graph.flows.length !== 3 ||
    start === undefined ||
    configured === undefined ||
    user === undefined ||
    end === undefined
  ) {
    return false;
  }
  const exactFlow = (sourceId: string, targetId: string) =>
    graph.flows.filter(
      (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
    ).length === 1;
  return exactFlow(start.id, configured.id) &&
    exactFlow(configured.id, user.id) &&
    exactFlow(user.id, end.id);
}
