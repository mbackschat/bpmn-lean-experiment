import {
  decodeDeployedDefinitionVersion,
  decodePublicMessageStartCapability,
} from "./deployed-definition-decoder.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import type {
  DeployedDefinitionVersion,
  PublicMessageStartCapability,
  PublicOperationMessageChannel,
} from "./definitions.js";
import {
  MessageStartPublicationStatus,
} from "./message-start-publications.js";
import type {
  MessageStartPublication,
  MessageStartPublicationBase,
  PutMessageStartPublicationRequest,
} from "./message-start-publications.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";

/** Decodes the closed exact-target Message Start publication request. */
export function decodePutMessageStartPublicationRequest(
  value: unknown,
): PutMessageStartPublicationRequest {
  requireObject(value, "message-start publication request");
  requireExactKeys(value, "message-start publication request", [
    "definition",
    "messageStart",
  ]);
  const definition = readOwn(value, "definition");
  requireObject(definition, "definition");
  requireExactKeys(definition, "definition", ["processId", "version"]);
  return {
    definition: {
      processId: requireNonemptyString(
        readOwn(definition, "processId"),
        "definition.processId",
      ),
      version: requirePositiveSafeInteger(
        readOwn(definition, "version"),
        "definition.version",
      ),
    },
    messageStart: decodePublicMessageStartCapability(
      readOwn(value, "messageStart"),
    ),
  };
}

/** Decodes one closed publication and validates all repeated public identities. */
export function decodeMessageStartPublication(
  value: unknown,
): MessageStartPublication {
  requireObject(value, "message-start publication");
  requireExactKeys(value, "message-start publication", [
    "definition",
    "instance",
    "messageStart",
    "publicationId",
    "status",
  ]);
  const base = decodePublicationBase(value);
  const status = readOwn(value, "status");
  const instance = readOwn(value, "instance");
  switch (status) {
    case MessageStartPublicationStatus.Pending:
    case MessageStartPublicationStatus.Indeterminate:
      if (instance !== null) {
        throw new TypeError(`${status} publication.instance must be null`);
      }
      return { ...base, status, instance };
    case MessageStartPublicationStatus.Accepted: {
      if (instance === null) {
        throw new TypeError(
          "accepted publication.instance must be a public Process-instance identity",
        );
      }
      const decodedInstance = decodePublicProcessInstanceIdentity(instance);
      if (!definitionsEqual(decodedInstance.definition, base.definition)) {
        throw new TypeError("instance.definition must equal definition");
      }
      return { ...base, status, instance: decodedInstance };
    }
    default:
      throw new TypeError(
        "message-start publication.status is not a public publication status",
      );
  }
}

function decodePublicationBase(value: object): MessageStartPublicationBase {
  const definition = decodeDeployedDefinitionVersion(
    readOwn(value, "definition"),
    "definition",
  );
  const messageStart = decodePublicMessageStartCapability(
    readOwn(value, "messageStart"),
  );
  if (
    definition.startCapabilities.messageStarts.filter((capability) =>
      messageStartCapabilitiesEqual(capability, messageStart)
    ).length !== 1
  ) {
    throw new TypeError(
      "messageStart must be published exactly once by definition.startCapabilities",
    );
  }
  return {
    publicationId: requireNonemptyString(
      readOwn(value, "publicationId"),
      "publicationId",
    ),
    definition,
    messageStart,
  };
}

function definitionsEqual(
  left: DeployedDefinitionVersion,
  right: DeployedDefinitionVersion,
): boolean {
  return left.processId === right.processId &&
    left.version === right.version &&
    left.semanticProfile === right.semanticProfile &&
    left.source.kind === right.source.kind &&
    left.source.id === right.source.id &&
    left.source.sha256 === right.source.sha256 &&
    left.source.byteLength === right.source.byteLength &&
    left.source.declaredEncoding === right.source.declaredEncoding &&
    left.source.decodedAs === right.source.decodedAs &&
    left.startCapabilities.messageStarts.length ===
      right.startCapabilities.messageStarts.length &&
    left.startCapabilities.messageStarts.every((capability, index) => {
      const other = right.startCapabilities.messageStarts[index];
      return other !== undefined &&
        messageStartCapabilitiesEqual(capability, other);
    }) &&
    left.startCapabilities.timerStarts.length ===
      right.startCapabilities.timerStarts.length &&
    left.startCapabilities.timerStarts.every((capability, index) => {
      const other = right.startCapabilities.timerStarts[index];
      return other !== undefined &&
        capability.startEventId === other.startEventId &&
        capability.durationMs === other.durationMs;
    });
}

function messageStartCapabilitiesEqual(
  left: PublicMessageStartCapability,
  right: PublicMessageStartCapability,
): boolean {
  return left.startEventId === right.startEventId &&
    operationMessageChannelsEqual(left.channel, right.channel);
}

function operationMessageChannelsEqual(
  left: PublicOperationMessageChannel,
  right: PublicOperationMessageChannel,
): boolean {
  return left.kind === right.kind &&
    left.interfaceId === right.interfaceId &&
    left.interfaceOperationId === right.interfaceOperationId &&
    left.messageId === right.messageId;
}
