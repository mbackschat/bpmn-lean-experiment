import {
  CheckedNodeKind,
  GatewayDirection,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  declaredGatewayDirectionMatches,
} from "./gateway-direction-source.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

export function projectEventBasedGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<CheckedNode, { kind: CheckedNodeKind.EventBasedGateway }> | undefined {
  const incoming = flows.filter(({ targetId }) => targetId === id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === id).length;
  return hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.EventBasedGateway,
    ) &&
      incoming === 1 &&
      outgoing === 2 &&
      declaredGatewayDirectionMatches(
        element.gatewayDirection,
        GatewayDirection.Diverging,
      ) &&
      (element.instantiate === undefined || element.instantiate === false) &&
      (element.eventGatewayType === undefined || element.eventGatewayType === "Exclusive")
    ? {
        kind: CheckedNodeKind.EventBasedGateway,
        id,
        direction: GatewayDirection.Diverging,
      }
    : undefined;
}
