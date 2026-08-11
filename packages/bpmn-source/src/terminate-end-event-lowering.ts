import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";

type ScopedTerminateOperation = Readonly<{
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.TerminateScope }
  >;
  scopeId: string;
}>;

/** Lowers validated source endpoints and ownership without inventing a continuation output. */
export function lowerTerminateEndEvent(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.TerminateEndEvent }>,
  source: CheckedProcess,
): ScopedTerminateOperation {
  const incoming = source.sequenceFlows.filter(
    ({ targetId }) => targetId === node.id,
  );
  const input = incoming[0];
  const owners = source.nodeScopes.filter(({ nodeId }) => nodeId === node.id);
  const owner = owners[0];
  if (incoming.length !== 1 || input === undefined) {
    throw new TypeError(
      `Checked Terminate End ${node.id} requires exactly one incoming flow`,
    );
  }
  if (owners.length !== 1 || owner === undefined) {
    throw new TypeError(
      `Checked Terminate End ${node.id} requires exactly one definition scope`,
    );
  }
  return {
    scopeId: owner.scopeId,
    operation: {
      id: operationId(node.id),
      kind: SemanticOperationKind.TerminateScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: node.id,
      },
      input: controlPlaceId(input.id),
      scopeId: owner.scopeId,
    },
  };
}
