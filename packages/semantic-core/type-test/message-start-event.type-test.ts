import {
  CheckedNodeKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  StimulusKind,
} from "../src/index.js";
import type {
  CheckedNode,
  InitiateMessageOperation,
  TriggerMessageStartStimulus,
} from "../src/index.js";

const trigger = {
  kind: StimulusKind.TriggerMessageStart,
  commandId: "trigger-message-start",
  processId: "Process_1",
  instanceId: "Instance_1",
  startEventId: "StartEvent_Message",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_1",
    interfaceOperationId: "Operation_1",
    messageId: "Message_1",
  },
} as const satisfies TriggerMessageStartStimulus;

const operation = {
  id: "operation:StartEvent_Message",
  kind: SemanticOperationKind.InitiateMessage,
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: "StartEvent_Message",
  },
  channel: trigger.channel,
  outputs: ["place:Flow_1"],
} as const satisfies InitiateMessageOperation;

const checkedNode = {
  kind: CheckedNodeKind.MessageStartEvent,
  id: "StartEvent_Message",
  channel: trigger.channel,
} as const satisfies CheckedNode;

// @ts-expect-error Message-start command identity is immutable
trigger.startEventId = "OtherStart";
// @ts-expect-error nested channel identity is immutable
trigger.channel.interfaceOperationId = "OtherOperation";
// @ts-expect-error IL outgoing-place arrays are deeply immutable
operation.outputs.push("place:Flow_2");
// @ts-expect-error checked-source Message channels are deeply immutable
checkedNode.channel.messageId = "OtherMessage";

void trigger;
void operation;
void checkedNode;
