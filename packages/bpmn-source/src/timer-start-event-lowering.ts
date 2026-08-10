import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  InitiateTimerOperation,
} from "@bpmn-lean/semantic-core";

import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";

/** Lowers the complete checked Timer Start identity and all outgoing control places. */
export function lowerTimerStartEvent(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.TimerStartEvent }>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): InitiateTimerOperation {
  const outputs = flows
    .filter(({ sourceId }) => sourceId === node.id)
    .map(({ id }) => controlPlaceId(id))
    .sort(compareCanonicalStrings);
  const [first, ...rest] = outputs;
  if (first === undefined || new Set(outputs).size !== outputs.length) {
    throw new TypeError(
      `Checked Timer Start ${node.id} requires distinct outgoing flows`,
    );
  }
  return {
    id: operationId(node.id),
    kind: SemanticOperationKind.InitiateTimer,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: node.id,
    },
    timer: { durationMs: normalizeDuration(node.durationLiteral) },
    outputs: [first, ...rest],
  };
}

function normalizeDuration(durationLiteral: "PT1S"): 1000 {
  switch (durationLiteral) {
    case "PT1S":
      return 1000;
  }
}
