/**
 * Lowering for the conditional branch descriptors the two condition-evaluating Gateways share.
 *
 * The Exclusive Gateway consumes a candidate directly; the Inclusive Gateway wraps the same candidate
 * with the paired join input its selected-branch synchronization needs. Keeping both here is what
 * makes that sharing visible instead of duplicated, and follows the per-family lowering modules this
 * compiler already uses.
 *
 * Return types are deliberately inferred rather than annotated. Each descriptor is an `as const`
 * literal whose exact shape the caller consumes through `ReturnType`, so an annotation would widen
 * the very narrowness the caller depends on. These are package-internal boundaries; the package's
 * public contract is its entry point.
 */
import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticOriginKind,
  SimpleBooleanExpressionKind,
  checkedRegionGraph,
  regionBranchEnd,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import { controlPlaceId } from "./semantic-process-identifiers.js";
import { parseSimpleBooleanExpression } from "./simple-boolean-expression.js";

export function lowerConditionalCandidate(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  flowId: string,
) {
  const flow = flows.find(({ id }) => id === flowId);
  if (flow === undefined || flow.condition === null) {
    throw new TypeError(
      `Checked conditional Sequence Flow ${flowId} is missing its condition`,
    );
  }
  const condition = parseSimpleBooleanExpression(flow.condition.body);
  if (condition === undefined) {
    throw new TypeError(
      `Checked conditional Sequence Flow ${flowId} has an invalid expression`,
    );
  }
  return {
    condition,
    output: controlPlaceId(flow.id),
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: flow.id,
    },
  } as const;
}

/**
 * An Inclusive candidate: an output without a condition lowers to the Simple Boolean literal `true`, because CIB takes
 * it unconditionally and Clause 8.4.13 leaves it ungated (CIB-INT-0005); the checked graph keeps the condition `null`.
 */
export function lowerInclusiveCandidate(
  source: CheckedProcess,
  splitId: string,
  flowId: string,
) {
  const flow = source.sequenceFlows.find(({ id }) => id === flowId);
  const candidate = flow !== undefined && flow.condition === null
    ? {
      condition: { kind: SimpleBooleanExpressionKind.Literal, value: true },
      output: controlPlaceId(flow.id),
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: flow.id },
    } as const
    : lowerConditionalCandidate(source.sequenceFlows, flowId);
  return {
    ...candidate,
    expectedJoinInput: expectedJoinInputForBranch(source, splitId, flowId),
  } as const;
}

export function lowerInclusiveDefaultBranch(
  source: CheckedProcess,
  splitId: string,
  flowId: string,
) {
  const flow = source.sequenceFlows.find(({ id }) => id === flowId);
  if (flow === undefined || flow.condition !== null || flow.sourceId !== splitId) {
    throw new TypeError(`Checked Inclusive default Sequence Flow ${flowId} is invalid`);
  }
  return {
    output: controlPlaceId(flow.id),
    expectedJoinInput: expectedJoinInputForBranch(source, splitId, flowId),
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: flow.id },
  } as const;
}

/** IGR-BIND-01: the input of the paired join that the branch starting at `flowId` reaches, by the shared region walk. */
function expectedJoinInputForBranch(
  source: CheckedProcess,
  splitId: string,
  flowId: string,
): string {
  const branch = source.sequenceFlows.find(
    (flow) => flow.id === flowId && flow.sourceId === splitId,
  );
  const graph = checkedRegionGraph(source);
  const end = branch === undefined ? undefined : regionBranchEnd(graph, { id: branch.id, target: branch.targetId });
  const join = end === undefined ? undefined : source.nodes.find(({ id }) => id === end.target);
  if (
    end === undefined ||
    join?.kind !== CheckedNodeKind.InclusiveGateway ||
    join.direction !== GatewayDirection.Converging ||
    join.pairedGatewayId !== splitId
  ) {
    throw new TypeError(`Checked Inclusive branch ${flowId} has no unique paired join input`);
  }
  return controlPlaceId(end.id);
}
