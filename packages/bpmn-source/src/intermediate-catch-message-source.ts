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
import type { MessageRootArtifacts } from "./root-definition-selection.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

export function projectIntermediateCatchMessage(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.IntermediateCatchMessageEvent }
> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.IntermediateCatchEvent,
    )
  ) {
    return undefined;
  }
  const channel = resolveOperationMessageEventDefinition(element, artifacts);
  if (channel === undefined) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.IntermediateCatchMessageEvent,
    id,
    channel,
  };
}
