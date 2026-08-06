import type { CheckedNode } from "../src/checked-process-contract.js";
import { MessageChannelKind } from "../src/semantic-value-contract.js";
import { CheckedNodeKind } from "../src/checked-process-contract.js";

const operationMessageChannel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_1",
  interfaceOperationId: "Operation_1",
  messageId: "Message_1",
} as const;

const directMessageChannel = {
  kind: MessageChannelKind.DirectMessage,
  messageId: "Message_1",
} as const;

type ReceiveTaskChannel = Extract<
  CheckedNode,
  { kind: CheckedNodeKind.ReceiveTask }
>["channel"];
type CatchEventChannel = Extract<
  CheckedNode,
  { kind: CheckedNodeKind.IntermediateCatchMessageEvent }
>["channel"];

// @ts-expect-error Receive Task checked source preserves the direct-Message locus
const receiveTaskWithOperationChannel: ReceiveTaskChannel =
  operationMessageChannel;

// @ts-expect-error Intermediate Catch Message checked source preserves the Operation locus
const catchEventWithDirectChannel: CatchEventChannel = directMessageChannel;

void receiveTaskWithOperationChannel;
void catchEventWithDirectChannel;
