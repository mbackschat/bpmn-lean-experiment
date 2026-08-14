import {
  decodeMessageStartPublication,
  decodePublicApiErrorResponse,
  decodePutMessageStartPublicationRequest,
  messageStartPublicationPath,
  MessageStartPublicationStatus,
  LegacyPublicApiErrorCodes,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicMessageStartCapability,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "./definitions-api.ts";
import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";

/** Same-origin Message Start publication client bound to one exact deployed definition. */
export class MessageStartPublicationApiClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Message Start publication API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async publish(
    publicationId: string,
    definition: DeployedDefinitionVersion,
    messageStart: PublicMessageStartCapability,
  ): Promise<MessageStartPublication> {
    const expected = snapshotTarget(publicationId, definition, messageStart);
    const response = await this.#fetch(this.#url(expected.publicationId), {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(expected.request),
    });
    switch (response.status) {
      case 200:
      case 201:
      case 202: {
        const publication = await readPublication(response);
        requirePublicationIdentity(publication, expected);
        requirePutStatus(response.status, publication.status);
        return publication;
      }
      default:
        return await this.#throwApiError(response);
    }
  }

  async get(
    publicationId: string,
    definition: DeployedDefinitionVersion,
    messageStart: PublicMessageStartCapability,
  ): Promise<MessageStartPublication> {
    const expected = snapshotTarget(publicationId, definition, messageStart);
    const response = await this.#fetch(this.#url(expected.publicationId), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const publication = await readPublication(response);
    requirePublicationIdentity(publication, expected);
    return publication;
  }

  #url(publicationId: string): URL {
    return new URL(messageStartPublicationPath(publicationId), this.#origin);
  }

  async #throwApiError(response: Response): Promise<never> {
    const decoded = decodeResponse(
      await readJson(response),
      (value) => decodePublicApiErrorResponse(value, LegacyPublicApiErrorCodes),
      "Message Start publication API error response",
    );
    throw new DefinitionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

type PublicationTargetSnapshot = Readonly<{
  publicationId: string;
  definition: DeployedDefinitionVersion;
  messageStart: PublicMessageStartCapability;
  request: PutMessageStartPublicationRequest;
}>;

function snapshotTarget(
  publicationId: string,
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
): PublicationTargetSnapshot {
  const expectedDefinition = snapshotExactDefinition(definition);
  const expectedRequest = decodePutMessageStartPublicationRequest({
    definition: {
      processId: expectedDefinition.processId,
      version: expectedDefinition.version,
    },
    messageStart: snapshotMessageStart(messageStart),
  });
  const matchingCapabilities = expectedDefinition.startCapabilities.messageStarts.filter(
    (capability) => sameMessageStart(capability, expectedRequest.messageStart),
  );
  if (matchingCapabilities.length !== 1) {
    throw new TypeError(
      "selected Message Start must be published exactly once by the exact definition",
    );
  }
  messageStartPublicationPath(publicationId);
  return {
    publicationId,
    definition: expectedDefinition,
    messageStart: expectedRequest.messageStart,
    request: expectedRequest,
  };
}

function snapshotMessageStart(
  messageStart: PublicMessageStartCapability,
): PublicMessageStartCapability {
  return {
    startEventId: messageStart.startEventId,
    channel: {
      kind: messageStart.channel.kind,
      interfaceId: messageStart.channel.interfaceId,
      interfaceOperationId: messageStart.channel.interfaceOperationId,
      messageId: messageStart.channel.messageId,
    },
  };
}

async function readPublication(response: Response): Promise<MessageStartPublication> {
  return decodeResponse(
    await readJson(response),
    decodeMessageStartPublication,
    "Message Start publication response",
  );
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DefinitionProtocolError(
      "Message Start publication API JSON response has an unexpected media type",
    );
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return parseStrictJson(bytes);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(
      "Message Start publication API returned malformed JSON",
      { cause },
    );
  }
}

function decodeResponse<Result>(
  value: unknown,
  decoder: (candidate: unknown) => Result,
  label: string,
): Result {
  try {
    return decoder(value);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(`${label} violates the public contract`, { cause });
  }
}

function requirePublicationIdentity(
  publication: MessageStartPublication,
  expected: PublicationTargetSnapshot,
): void {
  if (
    publication.publicationId !== expected.publicationId ||
    !sameExactDefinition(publication.definition, expected.definition) ||
    !sameMessageStart(publication.messageStart, expected.messageStart)
  ) {
    throw new DefinitionProtocolError(
      "Message Start publication response does not match the requested identity",
    );
  }
}

function requirePutStatus(
  httpStatus: 200 | 201 | 202,
  publicationStatus: MessageStartPublication["status"],
): void {
  switch (httpStatus) {
    case 200:
    case 201:
      if (publicationStatus !== MessageStartPublicationStatus.Accepted) {
        throw new DefinitionProtocolError(
          "Message Start publication HTTP status does not match its public status",
        );
      }
      return;
    case 202:
      if (publicationStatus === MessageStartPublicationStatus.Accepted) {
        throw new DefinitionProtocolError(
          "Message Start publication HTTP status does not match its public status",
        );
      }
      return;
    default:
      return assertNever(httpStatus);
  }
}

function sameMessageStart(
  left: PublicMessageStartCapability,
  right: PublicMessageStartCapability,
): boolean {
  return left.startEventId === right.startEventId &&
    left.channel.kind === right.channel.kind &&
    left.channel.interfaceId === right.channel.interfaceId &&
    left.channel.interfaceOperationId === right.channel.interfaceOperationId &&
    left.channel.messageId === right.channel.messageId;
}

function assertNever(value: never): never {
  throw new Error(`unexpected Message Start publication status: ${String(value)}`);
}
