/**
 * XND-ADMIT-01's effect-closure exclusion for the nested scope-data reader.
 *
 * A default-less Choice that a mapped Service or Send Task's result can reach within the same command is refused. In
 * CIB that command is the task's asynchronous job, whose `ENGINE-02004` failure is retried and then raises an incident,
 * which this profile does not admit (Exclusive Choice without a default proposal, "Required, optional and excluded
 * scope"). The traversal over-approximates: it follows every outgoing flow of every node that completes within the
 * command, stops at User Tasks, effect tasks and Call Activities, enters a Sub-Process at its None Start, and leaves a
 * Sub-Process body from any of its End Events to the Sub-Process's outgoing flows. A refused model may therefore be one
 * whose effect closure never reaches the Choice; an admitted model never has such a closure.
 */
import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";

type CheckedNode = CheckedProcess["nodes"][number];

export function effectResultReachesDefaultlessChoice(process: CheckedProcess): boolean {
  const nodes = new Map(process.nodes.map(node => [node.id, node] as const));
  const scopeOf = new Map(process.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId] as const));
  const ownerOfScope = new Map(process.nodes.flatMap(node =>
    node.kind === CheckedNodeKind.EmbeddedSubProcess ? [[node.childScopeId, node.id] as const] : []));
  const successors = (id: string): readonly string[] =>
    process.sequenceFlows.filter(({ sourceId }) => sourceId === id).map(({ targetId }) => targetId);
  const continuations = (node: CheckedNode): readonly string[] => {
    switch (node.kind) {
      case CheckedNodeKind.UserTask:
      case CheckedNodeKind.ServiceTask:
      case CheckedNodeKind.CallActivity:
        return [];
      case CheckedNodeKind.EmbeddedSubProcess:
        return process.nodes.filter(child => child.kind === CheckedNodeKind.NoneStartEvent &&
          scopeOf.get(child.id) === node.childScopeId).map(({ id }) => id);
      case CheckedNodeKind.NoneEndEvent: {
        const owner = ownerOfScope.get(scopeOf.get(node.id) ?? "");
        return owner === undefined ? [] : successors(owner);
      }
      default:
        return successors(node.id);
    }
  };
  const seen = new Set<string>();
  const pending = process.nodes.filter(({ kind }) => kind === CheckedNodeKind.ServiceTask).flatMap(({ id }) => successors(id));
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (node === undefined) continue;
    if (node.kind === CheckedNodeKind.ExclusiveGateway && node.defaultFlowId === undefined) return true;
    pending.push(...continuations(node));
  }
  return false;
}
