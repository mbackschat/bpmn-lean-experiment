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
  isDirectMessageRootArtifacts,
} from "./root-definition-selection.js";
import type {
  MessageRootArtifacts,
} from "./root-definition-selection.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

/** Projects the exact non-instantiating, payload-free direct-Message slice. */
export function projectReceiveTask(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
): Extract<CheckedNode, { kind: CheckedNodeKind.ReceiveTask }> | undefined {
  if (
    !isDirectMessageRootArtifacts(artifacts) ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ReceiveTask,
    ) ||
    element.messageRef !== artifacts.message ||
    (element.instantiate !== undefined && element.instantiate !== false)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ReceiveTask,
    id,
    channel: artifacts.channel,
  };
}
