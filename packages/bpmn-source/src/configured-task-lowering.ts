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

type ScopedConfiguredTaskOperation = Readonly<{
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >;
  scopeId: string;
}>;

/** Lowers only checked endpoints and the exact configured descriptor to the neutral effect wait. */
export function lowerConfiguredTask(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.ConfiguredTask }>,
  source: CheckedProcess,
): ScopedConfiguredTaskOperation {
  const incoming = source.sequenceFlows.filter(
    ({ targetId }) => targetId === node.id,
  );
  const outgoing = source.sequenceFlows.filter(
    ({ sourceId }) => sourceId === node.id,
  );
  const input = incoming[0];
  const output = outgoing[0];
  const owners = source.nodeScopes.filter(({ nodeId }) => nodeId === node.id);
  const owner = owners[0];
  if (
    incoming.length !== 1 || input === undefined ||
    outgoing.length !== 1 || output === undefined
  ) {
    throw new TypeError(
      `Checked configured Task ${node.id} requires exactly one incoming and outgoing flow`,
    );
  }
  if (owners.length !== 1 || owner === undefined) {
    throw new TypeError(
      `Checked configured Task ${node.id} requires exactly one definition scope`,
    );
  }
  return {
    scopeId: owner.scopeId,
    operation: {
      id: operationId(node.id),
      kind: SemanticOperationKind.AwaitEffect,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: node.id,
      },
      input: controlPlaceId(input.id),
      output: controlPlaceId(output.id),
      effect: {
        elementId: node.id,
        descriptor: node.descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
  };
}
