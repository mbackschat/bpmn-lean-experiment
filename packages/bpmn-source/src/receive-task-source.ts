import {
  CheckedNodeKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
} from "@bpmn-lean/semantic-core";

import {
  hasOnlyOwnKeys,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  isDirectMessageRootArtifacts,
} from "./root-definition-selection.js";
import type {
  MessageRootArtifacts,
} from "./root-definition-selection.js";

/** Projects the exact non-instantiating, payload-free direct-Message slice. */
export function projectReceiveTask(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
): Extract<CheckedNode, { kind: CheckedNodeKind.ReceiveTask }> | undefined {
  if (
    !isDirectMessageRootArtifacts(artifacts) ||
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "messageRef",
      "instantiate",
    ]) ||
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
