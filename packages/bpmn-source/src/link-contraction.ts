/**
 * LNK-PAIR-01, LNK-CONT-01 and LNK-PROFILE-01 of the Link Events proposal ("Representation and runtime ownership"): a
 * Link throw and catch of one name behave as the Sequence Flow they replace (BPMN 2.0.2 Clause 10.5.5), so a Link
 * definition is admitted and lowered as its explicit-flow twin. Only the boundaries that see a raw Link graph contract:
 * the nested scope-data reader before its analyses and checked admission, and the compiler before lowering. Checked
 * admission and lowering themselves stay Link-free. The Lean twin is `BpmnSemantics.SemanticProcess.LinkContraction`.
 */
import { CheckedNodeKind, SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import { lowerCheckedProcess } from "./semantic-process-lowering.js";

type LinkEnd = Readonly<{ id: string; linkName: string }>;

/** Lean's `String` order compares code points, not UTF-16 code units. */
function codePointLess(left: string, right: string): boolean {
  const a = [...left], b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference < 0;
  }
  return a.length < b.length;
}

const strictlySorted = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || codePointLess(values[index - 1]!, value));

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** Lean's `sourceOwnershipValid` together with the identity rules the contraction can no longer show afterwards. */
function rawIdentityValid(process: CheckedProcess): boolean {
  const nodeIds = process.nodes.map(({ id }) => id);
  const flowIds = process.sequenceFlows.map(({ id }) => id);
  const scopeIds = new Set(process.definitionScopes.map(({ id }) => id));
  const nodeScope = new Map(process.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId] as const));
  const flowScope = new Map(process.sequenceFlowScopes.map(({ sequenceFlowId, scopeId }) => [sequenceFlowId, scopeId] as const));
  const flowIdSet = new Set(flowIds);
  return strictlySorted(nodeIds) && strictlySorted(flowIds) &&
    nodeIds.every(id => id !== "" && !flowIdSet.has(id)) && flowIds.every(id => id !== "") &&
    sameIds(process.nodeScopes.map(({ nodeId }) => nodeId), nodeIds) &&
    sameIds(process.sequenceFlowScopes.map(({ sequenceFlowId }) => sequenceFlowId), flowIds) &&
    process.nodeScopes.every(({ scopeId }) => scopeIds.has(scopeId)) &&
    process.sequenceFlowScopes.every(({ scopeId }) => scopeIds.has(scopeId)) &&
    process.sequenceFlows.every(flow => {
      const scope = flowScope.get(flow.id);
      return scope === nodeScope.get(flow.sourceId) && scope === nodeScope.get(flow.targetId);
    });
}

/** The parentless scope above `scopeId`; `undefined` past the scope count, so a cyclic parent chain fails closed. */
function scopeRoot(process: CheckedProcess, scopeId: string): CheckedProcess["definitionScopes"][number] | undefined {
  let current = scopeId;
  for (let step = 0; step <= process.definitionScopes.length; step += 1) {
    const scope = process.definitionScopes.find(({ id }) => id === current);
    if (scope === undefined) return undefined;
    if (scope.parentScopeId === null || scope.parentScopeId === undefined) return scope;
    current = scope.parentScopeId;
  }
  return undefined;
}

/**
 * Every rule that must see a pair before it is removed: the throw's one incoming flow and no outgoing flow, the catch's
 * no incoming flow and one unconditioned outgoing flow (CIB evaluates its condition on leaving the catch), no chain into
 * another throw, and one scope of the executed root Process for both Events (CIB `BpmnParse.java:313` keeps one name
 * space per resource; Links in a called Process are excluded).
 */
function pairValid(process: CheckedProcess, throwIds: ReadonlySet<string>, throwEvent: LinkEnd, catchEvent: LinkEnd): boolean {
  const flows = process.sequenceFlows;
  const scopeOf = (id: string) => process.nodeScopes.find(({ nodeId }) => nodeId === id)?.scopeId;
  const catchFlows = flows.filter(({ sourceId }) => sourceId === catchEvent.id);
  const throwScope = scopeOf(throwEvent.id);
  const root = throwScope === undefined ? undefined : scopeRoot(process, throwScope);
  return throwEvent.linkName !== "" &&
    flows.filter(({ targetId }) => targetId === throwEvent.id).length === 1 &&
    !flows.some(({ sourceId }) => sourceId === throwEvent.id) &&
    !flows.some(({ targetId }) => targetId === catchEvent.id) &&
    catchFlows.length === 1 && catchFlows[0]!.condition === null && !throwIds.has(catchFlows[0]!.targetId) &&
    throwScope !== undefined && throwScope === scopeOf(catchEvent.id) &&
    root?.originElementId === process.processId;
}

const linkEnds = (process: CheckedProcess, kind: CheckedNodeKind.LinkThrowEvent | CheckedNodeKind.LinkCatchEvent): LinkEnd[] =>
  process.nodes.flatMap(node => node.kind === kind ? [{ id: node.id, linkName: node.linkName }] : []);

const distinct = (values: readonly string[]): boolean => new Set(values).size === values.length;

/**
 * The explicit-flow twin: each throw's incoming flow is retargeted to its catch's successor, and the throw, the catch,
 * the catch's outgoing flow and their ownership entries are removed. The process itself when it holds no Link arm;
 * `undefined` for any excluded pairing form or for a Link arm under another profile.
 */
export function contractLinks(process: CheckedProcess): CheckedProcess | undefined {
  const throws = linkEnds(process, CheckedNodeKind.LinkThrowEvent);
  const catches = linkEnds(process, CheckedNodeKind.LinkCatchEvent);
  if (throws.length === 0 && catches.length === 0) return process;
  const throwIds = new Set(throws.map(({ id }) => id));
  const pairs = throws.flatMap(throwEvent => {
    const catchEvent = catches.find(({ linkName }) => linkName === throwEvent.linkName);
    return catchEvent === undefined ? [] : [[throwEvent, catchEvent] as const];
  });
  if (process.identity.semanticProfile !== SemanticProfileId.NestedEmbeddedScopeData || !rawIdentityValid(process) ||
    !distinct(throws.map(({ linkName }) => linkName)) || !distinct(catches.map(({ linkName }) => linkName)) ||
    pairs.length !== throws.length || throws.length !== catches.length ||
    !pairs.every(([throwEvent, catchEvent]) => pairValid(process, throwIds, throwEvent, catchEvent))) return undefined;
  const catchIds = new Set(catches.map(({ id }) => id));
  const catchFlows = process.sequenceFlows.filter(({ sourceId }) => catchIds.has(sourceId));
  const removedFlowIds = new Set(catchFlows.map(({ id }) => id));
  const successor = new Map(pairs.map(([throwEvent, catchEvent]) =>
    [throwEvent.id, catchFlows.find(({ sourceId }) => sourceId === catchEvent.id)!.targetId] as const));
  const removed = (id: string) => throwIds.has(id) || catchIds.has(id);
  return {
    ...process,
    nodes: process.nodes.filter(({ id }) => !removed(id)),
    nodeScopes: process.nodeScopes.filter(({ nodeId }) => !removed(nodeId)),
    sequenceFlows: process.sequenceFlows.filter(({ id }) => !removedFlowIds.has(id)).map(flow => {
      const target = successor.get(flow.targetId);
      return target === undefined ? flow : { ...flow, targetId: target };
    }),
    sequenceFlowScopes: process.sequenceFlowScopes.filter(({ sequenceFlowId }) => !removedFlowIds.has(sequenceFlowId)),
  };
}

/** The lowering of the contraction; meaningful only for an admitted Link definition, as `lowerCheckedProcess` is. */
export function lowerLinkedCheckedProcess(process: CheckedProcess): SemanticProcessProgram {
  return lowerCheckedProcess(contractLinks(process) ?? process);
}
