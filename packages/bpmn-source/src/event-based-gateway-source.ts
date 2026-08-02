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
import {
  hasOnlyOwnKeys,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";

export function projectEventBasedGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<CheckedNode, { kind: CheckedNodeKind.EventBasedGateway }> | undefined {
  const incoming = flows.filter(({ targetId }) => targetId === id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === id).length;
  return hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "gatewayDirection",
      "instantiate",
      "eventGatewayType",
    ]) &&
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
