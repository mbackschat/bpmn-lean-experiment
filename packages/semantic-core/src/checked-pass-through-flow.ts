/**
 * PTSM-ADMIT-01: every checked analysis classifies a node as the Program-level analysis classifies its lowered operation.
 * A pass-through Task or None Throw with two or more outgoing flows lowers to a `duplicate` with the node as origin, so it
 * forks; one with two or more incoming flows lowers to a many-input `mergeExclusive`, so it merges. Arity admission keeps
 * both forms apart and confines them to the nested scope-data profile, so these predicates need no profile. Owner: the
 * [pass-through implicit split and merge specification](../../../docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#admission);
 * the Lean twin is `CheckedPassThroughFlow`.
 */
import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedSequenceFlow } from "./checked-process-contract.js";

const passThrough = (node: CheckedNode): boolean =>
  node.kind === CheckedNodeKind.NonOperationalTask || node.kind === CheckedNodeKind.NoneIntermediateThrowEvent;

/** A pass-through node with two or more outgoing flows, which lowers to a node-origin `duplicate`. */
export function checkedNodeSplits(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return passThrough(node) && flows.filter(({ sourceId }) => sourceId === node.id).length >= 2;
}

/** A pass-through node with two or more incoming flows, which lowers to a many-input `mergeExclusive`. */
export function checkedNodeMerges(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return passThrough(node) && flows.filter(({ targetId }) => targetId === node.id).length >= 2;
}

/** SCPH-ADMIT-01: a None Start with two or more outgoing flows, which lowers to a scope host over them. */
export function checkedNodeSplittingStart(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return node.kind === CheckedNodeKind.NoneStartEvent && flows.filter(({ sourceId }) => sourceId === node.id).length >= 2;
}

/** SCPH-ADMIT-01: an embedded Sub-Process with two or more outgoing flows, which lowers to a scope exit over them. */
export function checkedNodeSplittingSubProcess(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return node.kind === CheckedNodeKind.EmbeddedSubProcess && flows.filter(({ sourceId }) => sourceId === node.id).length >= 2;
}

/** ACSP-ADMIT-01: a User or Service Task with two or more outgoing flows, which lowers to a splitting Activity host. */
export function checkedNodeSplittingTask(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return (node.kind === CheckedNodeKind.UserTask || node.kind === CheckedNodeKind.ServiceTask) &&
    flows.filter(({ sourceId }) => sourceId === node.id).length >= 2;
}

/**
 * A checked node that splits a token, as the Program's `duplicate`, `selectMany`, splitting scope hosts and exits and
 * splitting Activity hosts do (SCPH-ADMIT-01 and ACSP-ADMIT-01 routing).
 */
export function checkedNodeForks(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return ((node.kind === CheckedNodeKind.ParallelGateway || node.kind === CheckedNodeKind.InclusiveGateway) &&
    node.direction === GatewayDirection.Diverging) || checkedNodeSplits(node, flows) ||
    checkedNodeSplittingStart(node, flows) || checkedNodeSplittingSubProcess(node, flows) ||
    checkedNodeSplittingTask(node, flows);
}

/**
 * ACTH-ADMIT-01: a User or Service Task with two or more incoming flows, which lowers to one merging Activity host over
 * those flows. Routing counts it as the re-entry account's merge and the concurrent account refuses it, as both do the
 * Program's merging host.
 */
export function checkedNodeMergingTask(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return (node.kind === CheckedNodeKind.UserTask || node.kind === CheckedNodeKind.ServiceTask) &&
    flows.filter(({ targetId }) => targetId === node.id).length >= 2;
}
