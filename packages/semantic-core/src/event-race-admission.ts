import {
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "./semantic-process-contract.js";
import type {
  AwaitEventRaceOperation,
} from "./semantic-process-contract.js";
import {
  isMessageChannel,
} from "./message-channel.js";
import {
  isWellFormedWireString,
} from "./wire.js";

export function isWellFormedAwaitEventRaceOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitEventRaceOperation {
  if (
    !hasOnlyKeys(value, ["id", "kind", "origin", "input", "message", "timer"]) ||
    value.kind !== SemanticOperationKind.AwaitEventRace ||
    !isPlaceReference(value.input, placeIds) ||
    !isRecord(value.message) ||
    !isRecord(value.timer) ||
    !hasOnlyKeys(value.message, [
      "configurationOrigin",
      "elementId",
      "channel",
      "output",
    ]) ||
    !hasOnlyKeys(value.timer, [
      "configurationOrigin",
      "elementId",
      "durationMs",
      "output",
    ]) ||
    !isConfigurationOrigin(value.message.configurationOrigin) ||
    !isConfigurationOrigin(value.timer.configurationOrigin) ||
    !isNonEmptyString(value.message.elementId) ||
    !isNonEmptyString(value.timer.elementId) ||
    !isPlaceReference(value.message.output, placeIds) ||
    !isPlaceReference(value.timer.output, placeIds) ||
    !isMessageChannel(value.message.channel) ||
    value.message.channel.kind !== MessageChannelKind.OperationMessage ||
    value.timer.durationMs !== 1000
  ) {
    return false;
  }
  const controlOrigins = new Set(placeOrigins.values());
  const messageOrigin = value.message.configurationOrigin.elementId;
  const timerOrigin = value.timer.configurationOrigin.elementId;
  const gatewayElementId = isRecord(value.origin) &&
      isNonEmptyString(value.origin.elementId)
    ? value.origin.elementId
    : undefined;
  return value.input !== value.message.output &&
    value.input !== value.timer.output &&
    value.message.output !== value.timer.output &&
    value.message.elementId !== value.timer.elementId &&
    gatewayElementId !== undefined &&
    gatewayElementId !== value.message.elementId &&
    gatewayElementId !== value.timer.elementId &&
    messageOrigin !== timerOrigin &&
    !controlOrigins.has(messageOrigin) &&
    !controlOrigins.has(timerOrigin);
}

function isConfigurationOrigin(
  value: unknown,
): value is Readonly<{
  kind: SemanticOriginKind.BpmnSequenceFlow;
  elementId: string;
}> {
  return isRecord(value) &&
    hasOnlyKeys(value, ["kind", "elementId"]) &&
    value.kind === SemanticOriginKind.BpmnSequenceFlow &&
    isNonEmptyString(value.elementId);
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
