import {
  BoundaryInterruption,
  CheckedNodeKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "../src/index.js";
import type {
  AwaitMessageBoundedUserTaskOperation,
  CheckedNode,
} from "../src/index.js";

const channel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ApplicationMessages",
  interfaceOperationId: "Operation_WithdrawApplication",
  messageId: "Message_ApplicationWithdrawn",
} as const;

const checkedBoundary = {
  kind: CheckedNodeKind.MessageBoundaryEvent,
  id: "Withdrawal",
  attachedToRef: "ReviewApplication",
  interruption: BoundaryInterruption.Interrupting,
  channel,
  outputFlowId: "Flow_Withdrawal",
} as const satisfies Extract<
  CheckedNode,
  { kind: CheckedNodeKind.MessageBoundaryEvent }
>;

const operation = {
  id: "operation:ReviewApplication",
  kind: SemanticOperationKind.AwaitMessageBoundedUserTask,
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: "ReviewApplication",
  },
  input: "place:Flow_Start",
  task: {
    elementId: "ReviewApplication",
    name: "Review application",
    output: "place:Flow_Normal",
  },
  boundaryMessage: {
    elementId: "Withdrawal",
    channel,
    output: "place:Flow_Withdrawal",
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: "Flow_Withdrawal",
    },
  },
} as const satisfies AwaitMessageBoundedUserTaskOperation;

// @ts-expect-error checked Message-boundary channels are deeply immutable
checkedBoundary.channel.messageId = "Message_Changed";
// @ts-expect-error the operation's normal route is deeply immutable
operation.task.output = "place:Flow_Changed";
// @ts-expect-error the handler route provenance is deeply immutable
operation.boundaryMessage.origin.elementId = "Flow_Changed";

export { checkedBoundary, operation };
