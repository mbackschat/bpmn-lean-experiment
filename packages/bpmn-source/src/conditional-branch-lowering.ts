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
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
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

export function lowerInclusiveCandidate(
  source: CheckedProcess,
  splitId: string,
  flowId: string,
) {
  return {
    ...lowerConditionalCandidate(source.sequenceFlows, flowId),
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

function expectedJoinInputForBranch(
  source: CheckedProcess,
  splitId: string,
  flowId: string,
): string {
  const branch = source.sequenceFlows.find(
    (flow) => flow.id === flowId && flow.sourceId === splitId,
  );
  const task = branch === undefined
    ? undefined
    : source.nodes.find(({ id }) => id === branch.targetId);
  const join = source.nodes.find(
    (node): node is Extract<CheckedNode, {
      kind: CheckedNodeKind.InclusiveGateway;
      direction: GatewayDirection.Converging;
    }> =>
      node.kind === CheckedNodeKind.InclusiveGateway &&
      node.direction === GatewayDirection.Converging &&
      node.pairedGatewayId === splitId,
  );
  const joinInputs = task === undefined || join === undefined
    ? []
    : source.sequenceFlows.filter(
        ({ sourceId, targetId }) => sourceId === task.id && targetId === join.id,
      );
  const joinInput = joinInputs[0];
  if (task?.kind !== CheckedNodeKind.UserTask || joinInputs.length !== 1 || joinInput === undefined) {
    throw new TypeError(`Checked Inclusive branch ${flowId} has no unique paired join input`);
  }
  return controlPlaceId(joinInput.id);
}
