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

/** Projects a payload-free operation channel; only the selected handler can spell out its interruption default. */
export function projectMessageStartEvent(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
  interruptingHandler = false,
): Extract<CheckedNode, { kind: CheckedNodeKind.MessageStartEvent }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.MessageStartEvent,
    ) ||
    (interruptingHandler ? (element.isInterrupting !== undefined && element.isInterrupting !== true) : Object.hasOwn(element, "isInterrupting")) ||
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
