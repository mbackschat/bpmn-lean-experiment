/** Message-identity edits for test deliveries; the unspecified arm carries no identity to edit. */
import { MessageChannelKind } from "@bpmn-lean/semantic-core";
import type { MessageChannel } from "@bpmn-lean/semantic-core";

export function messageIdOf(channel: MessageChannel): string {
  if (channel.kind === MessageChannelKind.UnspecifiedMessage) {
    throw new TypeError("an unspecified Message channel carries no Message identity");
  }
  return channel.messageId;
}

export function withMessageId(channel: MessageChannel, messageId: string): MessageChannel {
  if (channel.kind === MessageChannelKind.UnspecifiedMessage) {
    throw new TypeError("an unspecified Message channel carries no Message identity");
  }
  return { ...channel, messageId };
}
