import {
  CheckedNodeKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
} from "@bpmn-lean/semantic-core";

import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  resolveOperationMessageEventDefinition,
} from "./operation-message-event-definition-source.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";
import type {
  MessageRootArtifacts,
} from "./root-definition-selection.js";

/** Projects one exact top-level, payload-free operation-addressed Message Start Event. */
export function projectMessageStartEvent(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
): Extract<CheckedNode, { kind: CheckedNodeKind.MessageStartEvent }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.MessageStartEvent,
    ) ||
    Object.hasOwn(element, "isInterrupting") ||
    Object.hasOwn(element, "parallelMultiple") ||
    element.eventDefinitionRef !== undefined ||
    element.dataOutputs !== undefined ||
    element.outputSet !== undefined ||
    element.dataOutputAssociations !== undefined
  ) {
    return undefined;
  }
  const channel = resolveOperationMessageEventDefinition(element, artifacts);
  return channel === undefined
    ? undefined
    : { kind: CheckedNodeKind.MessageStartEvent, id, channel };
}
