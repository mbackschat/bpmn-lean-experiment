import { CheckedNodeKind as K, GatewayDirection } from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess } from "@bpmn-lean/semantic-core";

/** Checks the complete role grammar in the Transaction capsule, independently of source identities. */
export function transactionCheckedGraphValid(source: CheckedProcess): boolean {
  const { nodes, sequenceFlows: flows, definitionScopes: scopes, transactionCancellation: declaration } = source;
  const only = <T>(values: readonly T[]): T | undefined => values.length === 1 ? values[0] : undefined;
  const transaction = only(nodes.filter((node) => node.kind === K.TransactionSubProcess));
  const boundary = only(nodes.filter((node) => node.kind === K.CancelBoundaryEvent));
  const cancel = only(nodes.filter((node) => node.kind === K.CancelEndEvent));
  const root = only(scopes.filter(({ parentScopeId }) => parentScopeId === null));
  const child = scopes.find(({ id }) => id === transaction?.childScopeId);
  if (!transaction || !boundary || !cancel || !root || !child || !declaration ||
      source.compensation !== undefined || scopes.length !== 2 ||
      root.originElementId !== source.processId || child.parentScopeId !== root.id ||
      child.originElementId !== transaction.id || transaction.method !== "##Compensate" ||
      boundary.attachedToRef !== transaction.id || declaration.definitionScopeId !== child.id ||
      declaration.triggerElementId !== cancel.id ||
      new Set(nodes.map(({ id }) => id)).size !== nodes.length ||
      new Set(flows.map(({ id }) => id)).size !== flows.length ||
      source.nodeScopes.length !== nodes.length || source.sequenceFlowScopes.length !== flows.length) return false;
  const owners = new Map(source.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const flowOwners = new Map(source.sequenceFlowScopes.map(({ sequenceFlowId, scopeId }) => [sequenceFlowId, scopeId]));
  if (owners.size !== nodes.length || flowOwners.size !== flows.length ||
      nodes.some(({ id }) => !owners.has(id)) || flows.some(({ id, sourceId, targetId, condition }) =>
        condition !== null || !owners.has(sourceId) || !owners.has(targetId) ||
        owners.get(sourceId) !== owners.get(targetId) || flowOwners.get(id) !== owners.get(sourceId))) return false;
  const rootNodes = nodes.filter(({ id }) => owners.get(id) === root.id);
  const childNodes = nodes.filter(({ id }) => owners.get(id) === child.id);
  const rootStart = only(rootNodes.filter((node) => node.kind === K.NoneStartEvent));
  const ack = only(rootNodes.filter((node) => node.kind === K.UserTask));
  const rootEnds = rootNodes.filter((node) => node.kind === K.NoneEndEvent);
  const start = only(childNodes.filter((node) => node.kind === K.NoneStartEvent));
  const split = only(childNodes.filter((node) => node.kind === K.ParallelGateway));
  const end = only(childNodes.filter((node) => node.kind === K.NoneEndEvent));
  const tasks = childNodes.filter((node) => node.kind === K.UserTask);
  if (rootNodes.length !== 6 || rootEnds.length !== 2 || !rootStart || !ack || !start || !split || !end ||
      split.direction !== GatewayDirection.Diverging || !rootNodes.includes(transaction) ||
      !rootNodes.includes(boundary) || !childNodes.includes(cancel) ||
      childNodes.length !== tasks.length + 4 || tasks.length < 2 || tasks.length > 4 ||
      nodes.some((node) => node.kind === K.UserTask && node.metadata !== undefined)) return false;
  const out = (id: string) => flows.filter(({ sourceId }) => sourceId === id);
  const incoming = (id: string) => flows.filter(({ targetId }) => targetId === id);
  const next = (id: string) => only(out(id));
  const target = (id: string) => next(id)?.targetId;
  const normalEnd = target(transaction.id);
  const ackEnd = target(ack.id);
  if (target(rootStart.id) !== transaction.id || target(boundary.id) !== ack.id ||
      next(boundary.id)?.id !== boundary.outputFlowId || normalEnd === ackEnd ||
      !rootEnds.some(({ id }) => id === normalEnd) || !rootEnds.some(({ id }) => id === ackEnd) ||
      target(start.id) !== split.id || incoming(rootStart.id).length !== 0 ||
      incoming(boundary.id).length !== 0 || incoming(start.id).length !== 0 ||
      nodes.some((node) => ![rootStart.id, boundary.id, start.id].includes(node.id) && incoming(node.id).length !== 1) ||
      [...rootEnds, end, cancel].some(({ id }) => out(id).length !== 0)) return false;
  const branches = out(split.id);
  if (branches.length !== 2) return false;
  const walk = (first: string): { tasks: string[]; end: CheckedNode } | undefined => {
    const traversed: string[] = [];
    let current = nodes.find(({ id }) => id === first);
    while (current?.kind === K.UserTask && owners.get(current.id) === child.id && traversed.length < 2) {
      if (traversed.includes(current.id)) return undefined;
      traversed.push(current.id);
      current = nodes.find(({ id }) => id === target(current!.id));
    }
    return traversed.length > 0 && current !== undefined && (current === cancel || current === end)
      ? { tasks: traversed, end: current } : undefined;
  };
  const paths = branches.map(({ targetId }) => walk(targetId));
  const nonCancel = paths.find((path) => path?.end === end);
  if (paths.some((path) => path === undefined) || !nonCancel || !paths.some((path) => path?.end === cancel)) return false;
  const covered = paths.flatMap((path) => path?.tasks ?? []);
  const subject = declaration.subject;
  return covered.length === tasks.length && new Set(covered).size === tasks.length &&
    tasks.every(({ id }) => covered.includes(id)) &&
    flows.length === 7 + tasks.length &&
    subject.kind === "boundaryActivity" && nonCancel.tasks.includes(subject.subjectElementId) &&
    subject.body.kind === "singleEffect" && subject.body.input.kind === "empty" &&
    subject.body.handlerElementId === subject.body.effectElementId &&
    subject.body.descriptor.protocol === "urn:bpmn-lean:effect-protocol:activity-v1" &&
    subject.body.descriptor.operation === "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" &&
    declaration.retentionLimits.maxRecords === 1 && declaration.retentionLimits.maxCanonicalBytes === 4096 &&
    declaration.executionLimits.maxTriggers === 1 && declaration.executionLimits.maxHandlers === 1 &&
    declaration.executionLimits.maxCanonicalBytes === 20480;
}
