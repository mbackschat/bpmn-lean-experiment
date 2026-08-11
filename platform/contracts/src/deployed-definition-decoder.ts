import type {
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
  PublicDefinitionStartCapabilities,
  PublicMessageStartCapability,
  PublicOperationMessageChannel,
  PublicTimerStartCapability,
} from "./definitions.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireNullableNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
  requireString,
} from "./decoder-primitives.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

export function decodeDeployedDefinitionVersion(
  value: unknown,
  label: string,
): DeployedDefinitionVersion {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "processId",
    "semanticProfile",
    "source",
    "startCapabilities",
    "version",
  ]);
  return {
    processId: requireNonemptyString(readOwn(value, "processId"), `${label}.processId`),
    version: requirePositiveSafeInteger(readOwn(value, "version"), `${label}.version`),
    source: decodeExactPublicSourceIdentity(
      readOwn(value, "source"),
      `${label}.source`,
    ),
    semanticProfile: requireNonemptyString(
      readOwn(value, "semanticProfile"),
      `${label}.semanticProfile`,
    ),
    startCapabilities: decodePublicDefinitionStartCapabilities(
      readOwn(value, "startCapabilities"),
      `${label}.startCapabilities`,
    ),
  };
}

/** Decodes the closed platform-owned start-capability projection. */
export function decodePublicDefinitionStartCapabilities(
  value: unknown,
  label = "start capabilities",
): PublicDefinitionStartCapabilities {
  requireObject(value, label);
  requireExactKeys(value, label, ["messageStarts", "timerStarts"]);
  const messageStarts = readOwn(value, "messageStarts");
  if (!Array.isArray(messageStarts)) {
    throw new TypeError(`${label}.messageStarts must be an array`);
  }
  const timerStarts = readOwn(value, "timerStarts");
  if (!Array.isArray(timerStarts)) {
    throw new TypeError(`${label}.timerStarts must be an array`);
  }
  return {
    messageStarts: Array.from(messageStarts, (capability, index) =>
      decodePublicMessageStartCapability(
        capability,
        `${label}.messageStarts[${index}]`,
      )
    ),
    timerStarts: Array.from(timerStarts, (capability, index) =>
      decodePublicTimerStartCapability(
        capability,
        `${label}.timerStarts[${index}]`,
      )
    ),
  };
}

/** Decodes one closed Message Start capability and its complete channel. */
export function decodePublicMessageStartCapability(
  value: unknown,
  label = "Message Start capability",
): PublicMessageStartCapability {
  requireObject(value, label);
  requireExactKeys(value, label, ["channel", "startEventId"]);
  return {
    startEventId: requireNonemptyString(
      readOwn(value, "startEventId"),
      `${label}.startEventId`,
    ),
    channel: decodePublicOperationMessageChannel(
      readOwn(value, "channel"),
      `${label}.channel`,
    ),
  };
}

/** Decodes the closed public operation-addressed Message channel. */
export function decodePublicOperationMessageChannel(
  value: unknown,
  label = "operation Message channel",
): PublicOperationMessageChannel {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "interfaceId",
    "interfaceOperationId",
    "kind",
    "messageId",
  ]);
  const kind = readOwn(value, "kind");
  if (kind !== "operationMessage") {
    throw new TypeError(`${label}.kind must be operationMessage`);
  }
  return {
    kind,
    interfaceId: requireNonemptyString(
      readOwn(value, "interfaceId"),
      `${label}.interfaceId`,
    ),
    interfaceOperationId: requireNonemptyString(
      readOwn(value, "interfaceOperationId"),
      `${label}.interfaceOperationId`,
    ),
    messageId: requireNonemptyString(
      readOwn(value, "messageId"),
      `${label}.messageId`,
    ),
  };
}

/** Decodes one closed Timer Start capability without admitting host-private fields. */
export function decodePublicTimerStartCapability(
  value: unknown,
  label = "Timer Start capability",
): PublicTimerStartCapability {
  requireObject(value, label);
  requireExactKeys(value, label, ["durationMs", "startEventId"]);
  return {
    startEventId: requireNonemptyString(
      readOwn(value, "startEventId"),
      `${label}.startEventId`,
    ),
    durationMs: requireNonnegativeSafeInteger(
      readOwn(value, "durationMs"),
      `${label}.durationMs`,
    ),
  };
}

export function decodeExactPublicSourceIdentity(
  value: unknown,
  label: string,
): ExactPublicSourceIdentity {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "byteLength",
    "declaredEncoding",
    "decodedAs",
    "id",
    "kind",
    "sha256",
  ]);
  const kind = readOwn(value, "kind");
  if (kind !== "bpmnSource") {
    throw new TypeError(`${label}.kind must be bpmnSource`);
  }
  const sha256 = requireString(readOwn(value, "sha256"), `${label}.sha256`);
  if (!lowercaseSha256.test(sha256)) {
    throw new TypeError(`${label}.sha256 must be a lowercase SHA-256 digest`);
  }
  const decodedAs = readOwn(value, "decodedAs");
  if (decodedAs !== null && decodedAs !== "UTF-8") {
    throw new TypeError(`${label}.decodedAs must be null or UTF-8`);
  }
  return {
    kind,
    id: requireNonemptyString(readOwn(value, "id"), `${label}.id`),
    sha256,
    byteLength: requireNonnegativeSafeInteger(
      readOwn(value, "byteLength"),
      `${label}.byteLength`,
    ),
    declaredEncoding: requireNullableNonemptyString(
      readOwn(value, "declaredEncoding"),
      `${label}.declaredEncoding`,
    ),
    decodedAs,
  };
}
