import {
  MessageChannelKind,
} from "./semantic-process-contract.js";
import type {
  MessageChannel,
} from "./semantic-process-contract.js";
import {
  isWellFormedWireString,
} from "./wire.js";

/** Exact equality over the closed definition-addressed Message union. */
export function sameMessageChannel(
  left: MessageChannel,
  right: MessageChannel,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case MessageChannelKind.OperationMessage:
      return right.kind === MessageChannelKind.OperationMessage &&
        left.interfaceId === right.interfaceId &&
        left.interfaceOperationId === right.interfaceOperationId &&
        left.messageId === right.messageId;
    case MessageChannelKind.DirectMessage:
      return right.kind === MessageChannelKind.DirectMessage &&
        left.messageId === right.messageId;
    default:
      return assertNever(left);
  }
}

/** Strictly validates one current Message-channel arm without legacy inference. */
export function isMessageChannel(value: unknown): value is MessageChannel {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case MessageChannelKind.OperationMessage:
      return hasOnlyKeys(value, [
          "kind",
          "interfaceId",
          "interfaceOperationId",
          "messageId",
        ]) &&
        isNonEmptyString(value.interfaceId) &&
        isNonEmptyString(value.interfaceOperationId) &&
        isNonEmptyString(value.messageId);
    case MessageChannelKind.DirectMessage:
      return hasOnlyKeys(value, ["kind", "messageId"]) &&
        isNonEmptyString(value.messageId);
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function assertNever(value: never): never {
  throw new TypeError(`unsupported Message channel: ${JSON.stringify(value)}`);
}
