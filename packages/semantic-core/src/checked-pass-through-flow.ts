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

/** A checked node that splits a token, as the Program's `duplicate` and `selectMany` do. */
export function checkedNodeForks(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): boolean {
  return ((node.kind === CheckedNodeKind.ParallelGateway || node.kind === CheckedNodeKind.InclusiveGateway) &&
    node.direction === GatewayDirection.Diverging) || checkedNodeSplits(node, flows);
}
