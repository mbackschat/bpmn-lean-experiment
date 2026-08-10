import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  InitiateMessageOperation,
} from "@bpmn-lean/semantic-core";

import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";

/** Lowers the complete checked Message Start identity and all outgoing control places. */
export function lowerMessageStartEvent(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.MessageStartEvent }>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): InitiateMessageOperation {
  const outputs = flows
    .filter(({ sourceId }) => sourceId === node.id)
    .map(({ id }) => controlPlaceId(id))
    .sort(compareCanonicalStrings);
  const [first, ...rest] = outputs;
  if (first === undefined || new Set(outputs).size !== outputs.length) {
    throw new TypeError(
      `Checked Message Start ${node.id} requires distinct outgoing flows`,
    );
  }
  return {
    id: operationId(node.id),
    kind: SemanticOperationKind.InitiateMessage,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: node.id,
    },
    channel: node.channel,
    outputs: [first, ...rest],
  };
}
