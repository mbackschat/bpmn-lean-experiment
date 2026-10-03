import { BoundaryInterruption, CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "./checked-process-contract.js";
import { isMessageChannel, sameMessageChannel } from "./message-channel.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import { isWellFormedWireString } from "./wire.js";

type MessageEventSubProcessCheckedGraph = Pick<CheckedProcess,
  "processId" | "definitionScopes" | "nodeScopes" | "sequenceFlowScopes" | "nodes" |
  "interruptingMessageEventSubProcesses"> & Readonly<{ flows: readonly CheckedSequenceFlow[] }>;

/** Admits the reviewed two-check parent and linear handler by ownership, never fixture labels. */
export function interruptingMessageEventSubProcessCheckedGraph(graph: MessageEventSubProcessCheckedGraph): boolean {
  const declarations = graph.interruptingMessageEventSubProcesses;
  const declaration = declarations?.[0];
  if (declarations?.length !== 1 || declaration === undefined ||
      declaration.interruption !== BoundaryInterruption.Interrupting ||
      !isMessageChannel(declaration.channel) || declaration.channel.kind !== MessageChannelKind.OperationMessage ||
      graph.definitionScopes.length !== 2 || graph.nodes.length !== 10 || graph.flows.length !== 7 ||
      graph.nodeScopes.length !== graph.nodes.length || graph.sequenceFlowScopes.length !== graph.flows.length) return false;
  const sourceIds = [graph.processId, ...graph.nodes.map(({ id }) => id), ...graph.flows.map(({ id }) => id),
    declaration.channel.messageId, declaration.channel.interfaceId, declaration.channel.interfaceOperationId];
  if (new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => id.length === 0 || !isWellFormedWireString(id))) return false;
  const root = graph.definitionScopes.find(({ id }) => id === declaration.parentScopeId);
  const child = graph.definitionScopes.find(({ id }) => id === declaration.handlerScopeId);
  if (root === undefined || child === undefined || root.id === child.id ||
      ![root.id, child.id].every((id) => id.length > 0 && isWellFormedWireString(id)) ||
      root.parentScopeId !== null || root.originElementId !== graph.processId ||
      child.parentScopeId !== root.id || child.originElementId !== declaration.elementId) return false;
  const nodeScopes = new Map(graph.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const flowScopes = new Map(graph.sequenceFlowScopes.map(({ sequenceFlowId, scopeId }) => [sequenceFlowId, scopeId]));
  if (nodeScopes.size !== graph.nodes.length || flowScopes.size !== graph.flows.length ||
      graph.nodes.some(({ id }) => ![root.id, child.id].includes(nodeScopes.get(id) ?? "")) ||
      graph.flows.some(({ id, sourceId, targetId, condition }) => condition !== null ||
        !flowScopes.has(id) || nodeScopes.get(sourceId) !== flowScopes.get(id) ||
        nodeScopes.get(targetId) !== flowScopes.get(id))) return false;
  const nodesIn = (scopeId: string) => graph.nodes.filter(({ id }) => nodeScopes.get(id) === scopeId);
  const rootNodes = nodesIn(root.id);
  const childNodes = nodesIn(child.id);
  const one = <K extends CheckedNodeKind>(nodes: readonly CheckedNode[], kind: K): Extract<CheckedNode, { kind: K }> | undefined => {
    const matches = nodes.filter((node): node is Extract<CheckedNode, { kind: K }> => node.kind === kind);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const start = one(rootNodes, CheckedNodeKind.NoneStartEvent);
  const fork = one(rootNodes, CheckedNodeKind.ParallelGateway);
  const handler = one(rootNodes, CheckedNodeKind.EmbeddedSubProcess);
  const message = one(childNodes, CheckedNodeKind.MessageStartEvent);
  const handlerTask = one(childNodes, CheckedNodeKind.UserTask);
  const handlerEnd = one(childNodes, CheckedNodeKind.NoneEndEvent);
  const tasks = rootNodes.filter(({ kind }) => kind === CheckedNodeKind.UserTask);
  const ends = rootNodes.filter(({ kind }) => kind === CheckedNodeKind.NoneEndEvent);
  if (rootNodes.length !== 7 || childNodes.length !== 3 || start === undefined || fork === undefined ||
      fork.direction !== GatewayDirection.Diverging || handler === undefined ||
      handler.id !== declaration.elementId || handler.childScopeId !== child.id ||
      message === undefined || message.id !== declaration.startEventId ||
      !sameMessageChannel(message.channel, declaration.channel) || handlerTask === undefined || handlerEnd === undefined ||
      tasks.length !== 2 || ends.length !== 2 ||
      graph.nodes.some((node) => node.kind === CheckedNodeKind.UserTask && node.metadata !== undefined)) return false;
  const exactFlow = (from: string, to: string) => graph.flows.filter(({ sourceId, targetId }) => sourceId === from && targetId === to);
  const taskEnds = tasks.map(({ id }) => graph.flows.filter(({ sourceId }) => sourceId === id));
  const entry = exactFlow(message.id, handlerTask.id);
  return exactFlow(start.id, fork.id).length === 1 &&
    tasks.every(({ id }) => exactFlow(fork.id, id).length === 1) &&
    taskEnds.every((flows) => flows.length === 1 && ends.some(({ id }) => id === flows[0]?.targetId)) &&
    new Set(taskEnds.flatMap((flows) => flows.map(({ targetId }) => targetId))).size === 2 &&
    entry.length === 1 && entry[0]?.id === declaration.childEntryFlowId &&
    exactFlow(handlerTask.id, handlerEnd.id).length === 1 &&
    graph.flows.every(({ sourceId, targetId }) => sourceId !== handler.id && targetId !== handler.id);
}
