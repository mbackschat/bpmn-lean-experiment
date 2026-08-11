import {
  MessageStartPublicationStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  MessageStartPublication,
  PublicMessageStartCapability,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionMessageStartCapability } from "./contracts.js";
import {
  MessageStartPublicationIntegrityError,
  MessageStartPublicationState,
  MessageStartPublicationValidationError,
} from "./message-start-publication-contracts.js";
import type {
  MessageStartPublicationRecord,
} from "./message-start-publication-contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";

export function projectMessageStartPublication(
  record: MessageStartPublicationRecord,
): MessageStartPublication {
  const definition = toPublicDefinition(record.definition);
  const base = {
    publicationId: record.publicationId,
    definition,
    messageStart: toPublicMessageStart(record.messageStart),
  };
  switch (record.state) {
    case MessageStartPublicationState.Reserved:
    case MessageStartPublicationState.Starting:
      return {
        ...base,
        status: MessageStartPublicationStatus.Pending,
        instance: null,
      };
    case MessageStartPublicationState.Accepted:
      return {
        ...base,
        status: MessageStartPublicationStatus.Accepted,
        instance: {
          processInstanceId: record.identity.processInstanceId,
          definition,
        },
      };
    case MessageStartPublicationState.Indeterminate:
      return {
        ...base,
        status: MessageStartPublicationStatus.Indeterminate,
        instance: null,
      };
    case MessageStartPublicationState.IntegrityFailure:
      throw new MessageStartPublicationIntegrityError(
        "integrity-failed publication has no public projection",
      );
    default:
      return assertNever(record.state);
  }
}

export function clonePutMessageStartPublicationRequest(
  request: PutMessageStartPublicationRequest,
): PutMessageStartPublicationRequest {
  requireIdentity(request.definition.processId, "processId");
  if (!Number.isSafeInteger(request.definition.version) || request.definition.version <= 0) {
    throw new MessageStartPublicationValidationError(
      "version must be a positive safe integer",
    );
  }
  return {
    definition: { ...request.definition },
    messageStart: cloneMessageStart(request.messageStart),
  };
}

export function cloneMessageStart(
  value: PublicMessageStartCapability | DefinitionMessageStartCapability,
): DefinitionMessageStartCapability {
  requireIdentity(value.startEventId, "startEventId");
  if (value.channel.kind !== "operationMessage") {
    throw new MessageStartPublicationValidationError(
      "messageStart channel must be operationMessage",
    );
  }
  requireIdentity(value.channel.interfaceId, "interfaceId");
  requireIdentity(value.channel.interfaceOperationId, "interfaceOperationId");
  requireIdentity(value.channel.messageId, "messageId");
  return {
    startEventId: value.startEventId,
    channel: { ...value.channel },
  };
}

export function equalMessageStart(
  left: PublicMessageStartCapability | DefinitionMessageStartCapability,
  right: PublicMessageStartCapability | DefinitionMessageStartCapability,
): boolean {
  return left.startEventId === right.startEventId &&
    left.channel.kind === right.channel.kind &&
    left.channel.interfaceId === right.channel.interfaceId &&
    left.channel.interfaceOperationId === right.channel.interfaceOperationId &&
    left.channel.messageId === right.channel.messageId;
}

export function requirePublicationId(publicationId: string): void {
  requireIdentity(publicationId, "publicationId");
}

function toPublicMessageStart(
  messageStart: DefinitionMessageStartCapability,
): PublicMessageStartCapability {
  return {
    startEventId: messageStart.startEventId,
    channel: { ...messageStart.channel },
  };
}

function requireIdentity(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new MessageStartPublicationValidationError(
      `${name} must be nonempty well-formed Unicode`,
    );
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start publication state: ${String(value)}`);
}
