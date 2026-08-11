import type {
  DefinitionMessageStartCapability,
  DefinitionStartCapabilities,
  DefinitionTimerStartCapability,
} from "./contracts.js";

export function cloneDefinitionStartCapabilities(
  value: unknown,
): DefinitionStartCapabilities {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["messageStarts", "timerStarts"])
  ) {
    throw new TypeError(
      "definition start capabilities must contain only messageStarts and timerStarts",
    );
  }
  if (!Array.isArray(value.messageStarts)) {
    throw new TypeError("definition messageStarts capability must be an array");
  }
  if (!Array.isArray(value.timerStarts)) {
    throw new TypeError("definition timerStarts capability must be an array");
  }
  return {
    messageStarts: value.messageStarts.map(decodeMessageStartCapability),
    timerStarts: value.timerStarts.map(decodeTimerStartCapability),
  };
}

export function encodeDefinitionStartCapabilities(
  capabilities: DefinitionStartCapabilities,
): string {
  return JSON.stringify(cloneDefinitionStartCapabilities(capabilities));
}

export function decodeDefinitionStartCapabilities(
  encoded: string,
): DefinitionStartCapabilities {
  let decoded: unknown;
  try {
    decoded = JSON.parse(encoded);
  } catch {
    throw new TypeError("SQLite definition row has invalid start_capabilities_json");
  }
  const capabilities = cloneDefinitionStartCapabilities(decoded);
  if (encodeDefinitionStartCapabilities(capabilities) !== encoded) {
    throw new TypeError(
      "SQLite definition row has noncanonical start_capabilities_json",
    );
  }
  return capabilities;
}

export function equalDefinitionStartCapabilities(
  left: DefinitionStartCapabilities,
  right: DefinitionStartCapabilities,
): boolean {
  return encodeDefinitionStartCapabilities(left) ===
    encodeDefinitionStartCapabilities(right);
}

function decodeTimerStartCapability(value: unknown): DefinitionTimerStartCapability {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["startEventId", "durationMs"]) ||
    typeof value.startEventId !== "string" ||
    value.startEventId.length === 0 ||
    !value.startEventId.isWellFormed() ||
    typeof value.durationMs !== "number" ||
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs <= 0
  ) {
    throw new TypeError("definition timerStarts capability is invalid");
  }
  return {
    startEventId: value.startEventId,
    durationMs: value.durationMs,
  };
}

function decodeMessageStartCapability(
  value: unknown,
): DefinitionMessageStartCapability {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["startEventId", "channel"]) ||
    !isNonemptyWellFormedString(value.startEventId) ||
    !isRecord(value.channel) ||
    !hasOnlyKeys(value.channel, [
      "kind",
      "interfaceId",
      "interfaceOperationId",
      "messageId",
    ]) ||
    value.channel.kind !== "operationMessage" ||
    !isNonemptyWellFormedString(value.channel.interfaceId) ||
    !isNonemptyWellFormedString(value.channel.interfaceOperationId) ||
    !isNonemptyWellFormedString(value.channel.messageId)
  ) {
    throw new TypeError("definition messageStarts capability is invalid");
  }
  return {
    startEventId: value.startEventId,
    channel: {
      kind: value.channel.kind,
      interfaceId: value.channel.interfaceId,
      interfaceOperationId: value.channel.interfaceOperationId,
      messageId: value.channel.messageId,
    },
  };
}

function isNonemptyWellFormedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.isWellFormed();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key));
}
