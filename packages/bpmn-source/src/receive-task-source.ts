import {
  CheckedNodeKind,
  isWellFormedWireString,
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
  const matches = artifacts?.filter(isDirectMessageRootArtifacts).filter(
    (candidate) => element.messageRef === candidate.message,
  );
  const matched = matches?.length === 1 ? matches[0] : undefined;
  if (
    matched === undefined ||
    typeof matched.message.name !== "string" || matched.message.name.length === 0 ||
    !isWellFormedWireString(matched.message.name) ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ReceiveTask,
    ) ||
    (element.instantiate !== undefined && element.instantiate !== false)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ReceiveTask,
    id,
    channel: matched.channel,
  };
}
