import {
  CheckedNodeKind,
  MessageChannelKind,
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

/**
 * Projects the exact non-instantiating, payload-free Receive Task slice.
 *
 * A task naming a Message takes the direct channel of its root Message. A task naming none takes the
 * field-free unspecified channel, only where `admitsAddressless` holds (the addressless Receive Task
 * profile, which admits no direct task) and only when no root Message exists (ARECV-ADDRESS-01).
 */
export function projectReceiveTask(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
  admitsAddressless: boolean,
): Extract<CheckedNode, { kind: CheckedNodeKind.ReceiveTask }> | undefined {
  const exact = hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.ReceiveTask) &&
    (element.instantiate === undefined || element.instantiate === false);
  if (element.messageRef === undefined) {
    return admitsAddressless && artifacts?.length === 0 && exact
      ? { kind: CheckedNodeKind.ReceiveTask, id, channel: { kind: MessageChannelKind.UnspecifiedMessage } }
      : undefined;
  }
  const matches = artifacts?.filter(isDirectMessageRootArtifacts).filter(
    (candidate) => element.messageRef === candidate.message,
  );
  const matched = matches?.length === 1 ? matches[0] : undefined;
  if (
    matched === undefined ||
    typeof matched.message.name !== "string" || matched.message.name.length === 0 ||
    !isWellFormedWireString(matched.message.name) ||
    !exact
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ReceiveTask,
    id,
    channel: matched.channel,
  };
}
