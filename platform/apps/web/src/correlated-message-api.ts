import {
  decodeDefinitionCorrelatedMessageCapabilities,
  decodeDefinitionCorrelatedMessagePublication,
  decodePublicApiErrorResponse,
  decodePublicCorrelatedMessageCapability,
  decodePutDefinitionCorrelatedMessagePublicationRequest,
  definitionCorrelatedMessagePublicationPath,
  definitionCorrelatedMessagesPath,
  LegacyPublicApiErrorCodes,
  parseStrictJson,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  DeployedDefinitionVersion,
  PublicCorrelatedMessageCapability,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "./definitions-api.ts";
import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "./exact-definition.ts";

const jsonMediaType = "application/json";
const responseByteLimit = 1_048_576;

export interface CorrelatedMessageApi {
  getCapabilities(
    definition: DeployedDefinitionVersion,
  ): Promise<DefinitionCorrelatedMessageCapabilities>;
  publish(
    commandId: string,
    capabilities: DefinitionCorrelatedMessageCapabilities,
    correlatedMessage: PublicCorrelatedMessageCapability,
    request: PutDefinitionCorrelatedMessagePublicationRequest,
  ): Promise<DefinitionCorrelatedMessagePublication>;
}

/** Same-origin client for exact-definition target-free correlated Message publication. */
export class CorrelatedMessageApiClient implements CorrelatedMessageApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("correlated Message API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getCapabilities(
    requestedDefinition: DeployedDefinitionVersion,
  ): Promise<DefinitionCorrelatedMessageCapabilities> {
    const definition = snapshotExactDefinition(requestedDefinition);
    const response = await this.#fetch(new URL(definitionCorrelatedMessagesPath(
      definition.processId,
      definition.version,
    ), this.#origin), {
      method: "GET",
      headers: { accept: jsonMediaType },
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const capabilities = decodeResponse(
      await readStrictJson(response),
      decodeDefinitionCorrelatedMessageCapabilities,
      "correlated Message capability response",
    );
    if (!sameExactDefinition(capabilities.definition, definition)) {
      throw new DefinitionProtocolError(
        "correlated Message capability response does not match the requested identity",
      );
    }
    return capabilities;
  }

  async publish(
    commandId: string,
    requestedCapabilities: DefinitionCorrelatedMessageCapabilities,
    requestedMessage: PublicCorrelatedMessageCapability,
    requestedPublication: PutDefinitionCorrelatedMessagePublicationRequest,
  ): Promise<DefinitionCorrelatedMessagePublication> {
    const expected = snapshotPublication(
      commandId,
      requestedCapabilities,
      requestedMessage,
      requestedPublication,
    );
    const response = await this.#fetch(new URL(
      definitionCorrelatedMessagePublicationPath(
        expected.capabilities.definition.processId,
        expected.capabilities.definition.version,
        expected.correlatedMessage.catchEventId,
        expected.commandId,
      ),
      this.#origin,
    ), {
      method: "PUT",
      headers: {
        accept: jsonMediaType,
        "content-type": jsonMediaType,
      },
      body: JSON.stringify(expected.request),
    });
    if (response.status !== 200) {
      return await this.#throwApiError(response);
    }
    const publication = decodeResponse(
      await readStrictJson(response),
      decodeDefinitionCorrelatedMessagePublication,
      "correlated Message publication response",
    );
    if (
      !sameExactDefinition(
        publication.definition,
        expected.capabilities.definition,
      ) ||
      !sameCapability(publication.correlatedMessage, expected.correlatedMessage) ||
      publication.resolution.commandId !== expected.commandId
    ) {
      throw new DefinitionProtocolError(
        "correlated Message publication response does not match the requested identity",
      );
    }
    return publication;
  }

  async #throwApiError(response: Response): Promise<never> {
    if (!isApprovedErrorStatus(response.status)) {
      throw new DefinitionProtocolError(
        `correlated Message API returned unexpected HTTP status ${response.status}`,
      );
    }
    const decoded = decodeResponse(
      await readStrictJson(response),
      (value) => decodePublicApiErrorResponse(value, LegacyPublicApiErrorCodes),
      "correlated Message API error response",
    );
    if (!statusMatchesCode(response.status, decoded.error.code)) {
      throw new DefinitionProtocolError(
        "correlated Message API error status does not match its public code",
      );
    }
    throw new DefinitionApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
    );
  }
}

type PublicationSnapshot = Readonly<{
  commandId: string;
  capabilities: DefinitionCorrelatedMessageCapabilities;
  correlatedMessage: PublicCorrelatedMessageCapability;
  request: PutDefinitionCorrelatedMessagePublicationRequest;
}>;

function snapshotPublication(
  commandId: string,
  capabilities: DefinitionCorrelatedMessageCapabilities,
  correlatedMessage: PublicCorrelatedMessageCapability,
  request: PutDefinitionCorrelatedMessagePublicationRequest,
): PublicationSnapshot {
  definitionCorrelatedMessagePublicationPath(
    capabilities.definition.processId,
    capabilities.definition.version,
    correlatedMessage.catchEventId,
    commandId,
  );
  const snapshotCapabilities = decodeDefinitionCorrelatedMessageCapabilities(capabilities);
  const snapshotMessage = decodePublicCorrelatedMessageCapability(correlatedMessage);
  const matching = snapshotCapabilities.messages.filter((candidate) =>
    sameCapability(candidate, snapshotMessage)
  );
  if (matching.length !== 1) {
    throw new TypeError(
      "selected correlated Message capability must occur exactly once in the discovered set",
    );
  }
  return {
    commandId,
    capabilities: snapshotCapabilities,
    correlatedMessage: snapshotMessage,
    request: decodePutDefinitionCorrelatedMessagePublicationRequest(request),
  };
}

function sameCapability(
  left: PublicCorrelatedMessageCapability,
  right: PublicCorrelatedMessageCapability,
): boolean {
  return left.catchEventId === right.catchEventId &&
    left.correlationKeyId === right.correlationKeyId &&
    left.channel.kind === right.channel.kind &&
    left.channel.interfaceId === right.channel.interfaceId &&
    left.channel.interfaceOperationId === right.channel.interfaceOperationId &&
    left.channel.messageId === right.channel.messageId;
}

async function readStrictJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== jsonMediaType) {
    throw new DefinitionProtocolError(
      "correlated Message API response has an unexpected media type",
    );
  }
  const bytes = await readBoundedBytes(response);
  try {
    return parseStrictJson(bytes);
  } catch (cause: unknown) {
    throw new DefinitionProtocolError(
      "correlated Message API returned malformed JSON",
      { cause },
    );
  }
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const claimed = response.headers.get("content-length");
  if (claimed !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(claimed) || !Number.isSafeInteger(Number(claimed))) {
      throw new DefinitionProtocolError(
        "correlated Message API response has an invalid content length",
      );
    }
    if (Number(claimed) > responseByteLimit) {
      throw new DefinitionProtocolError(
        "correlated Message API response exceeds the byte limit",
      );
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.byteLength > responseByteLimit - byteLength) {
      await reader.cancel();
      throw new DefinitionProtocolError(
        "correlated Message API response exceeds the byte limit",
      );
    }
    chunks.push(next.value);
    byteLength += next.value.byteLength;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeResponse<Result>(
  value: unknown,
  decoder: (candidate: unknown) => Result,
  label: string,
): Result {
  try {
    return decoder(value);
  } catch (cause: unknown) {
    if (cause instanceof DefinitionProtocolError) throw cause;
    throw new DefinitionProtocolError(`${label} violates the public contract`, { cause });
  }
}

function isApprovedErrorStatus(status: number): boolean {
  switch (status) {
    case 400:
    case 404:
    case 405:
    case 409:
    case 413:
    case 415:
    case 500:
      return true;
    default:
      return false;
  }
}

function statusMatchesCode(
  status: number,
  code: typeof LegacyPublicApiErrorCodes[number],
): boolean {
  switch (status) {
    case 400:
      return code === PublicApiErrorCode.InvalidRequest;
    case 404:
      return code === PublicApiErrorCode.NotFound;
    case 405:
      return code === PublicApiErrorCode.MethodNotAllowed;
    case 409:
      return code === PublicApiErrorCode.Conflict;
    case 413:
      return code === PublicApiErrorCode.PayloadTooLarge;
    case 415:
      return code === PublicApiErrorCode.UnsupportedMediaType;
    case 500:
      return code === PublicApiErrorCode.InternalFailure;
    default:
      return false;
  }
}
