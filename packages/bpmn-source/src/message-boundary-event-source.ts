/** Projects the payload-free Message boundary disposition selected by the source profile. */
import {
  BoundaryInterruption,
  CheckedNodeKind,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  asElement,
  readId,
} from "./moddle-graph.js";
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

/**
 * The original Message-boundary capsule selects omission-only interruption.
 *
 * `bpmn-moddle` exposes the BPMN default `true` through the element prototype and creates an own
 * key only when the XML wrote the attribute. Both facts are checked because this capsule selects
 * the omission lexeme, not every source spelling whose resolved interruption value is true.
 */
export function projectMessageBoundaryEvent(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  artifacts: MessageRootArtifacts | undefined,
  semanticProfile: string,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.MessageBoundaryEvent }
> | undefined {
  if (
    (semanticProfile === REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID
      ? element.cancelActivity !== true && element.cancelActivity !== false
      : Object.hasOwn(element, "cancelActivity") || element.cancelActivity !== true) ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.BoundaryEvent,
    )
  ) {
    return undefined;
  }
  const channel = resolveOperationMessageEventDefinition(element, artifacts);
  const attached = asElement(element.attachedToRef);
  const attachedToRef = attached === undefined ? undefined : readId(attached);
  const outputs = flows.filter(({ sourceId }) => sourceId === id);
  const inputs = flows.filter(({ targetId }) => targetId === id);
  const output = outputs[0];
  if (
    channel === undefined ||
    attachedToRef === undefined ||
    outputs.length !== 1 ||
    inputs.length !== 0 ||
    output === undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.MessageBoundaryEvent,
    id,
    attachedToRef,
    interruption: element.cancelActivity === false
      ? BoundaryInterruption.NonInterrupting
      : BoundaryInterruption.Interrupting,
    channel,
    outputFlowId: output.id,
  };
}
