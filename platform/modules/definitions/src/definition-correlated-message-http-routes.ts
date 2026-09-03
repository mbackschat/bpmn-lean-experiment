import {
  decodePutDefinitionCorrelatedMessagePublicationRequest,
  matchDefinitionCorrelatedMessagePublicationPath,
  matchDefinitionCorrelatedMessagesPath,
  parseStrictJson,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionCorrelatedMessageIntegrityError,
  DefinitionCorrelatedMessagePublishStatus,
} from "./definition-correlated-message-contracts.js";
import type {
  DefinitionCorrelatedMessageOperations,
} from "./definition-correlated-message-contracts.js";
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  requireNoQuery,
} from "./definition-http-responses.js";
import {
  HttpRequestFailure,
  readBoundedBody,
  requireEmptyRequestBody,
} from "./http-request.js";

const publicationRequestBodyLimit = 4_096;

/** Fetch-compatible boundary for definition-scoped target-free Message publication. */
export class DefinitionCorrelatedMessageHttpRoutes {
  readonly #operations: DefinitionCorrelatedMessageOperations;

  constructor(operations: DefinitionCorrelatedMessageOperations) {
    this.#operations = operations;
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    let capabilitiesMatch;
    let publicationMatch;
    try {
      capabilitiesMatch = matchDefinitionCorrelatedMessagesPath(url.pathname);
      publicationMatch = matchDefinitionCorrelatedMessagePublicationPath(url.pathname);
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        return errorResponse(
          400,
          PublicApiErrorCode.InvalidRequest,
          "The correlated Message route identity is malformed.",
        );
      }
      throw error;
    }
    if (capabilitiesMatch !== null) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      try {
        requireNoQuery(request, url);
        await requireEmptyRequestBody(request, "correlated Message capability GET");
        const result = await this.#operations.describe(capabilitiesMatch);
        return result === null
          ? notFound("The definition version was not found.")
          : jsonResponse(200, result);
      } catch (error: unknown) {
        return correlatedMessageErrorResponse(error);
      }
    }
    if (publicationMatch === null) return null;
    if (request.method !== "PUT") return methodNotAllowed("PUT");
    try {
      requireNoQuery(request, url);
      const input = await readPublicationRequest(request);
      const result = await this.#operations.publish({
        definition: {
          processId: publicationMatch.processId,
          version: publicationMatch.version,
        },
        catchEventId: publicationMatch.catchEventId,
        commandId: publicationMatch.commandId,
        payload: { ...input.payload },
      });
      switch (result.status) {
        case DefinitionCorrelatedMessagePublishStatus.Resolved:
          return jsonResponse(200, result.publication);
        case DefinitionCorrelatedMessagePublishStatus.DefinitionNotFound:
          return notFound("The definition version was not found.");
        case DefinitionCorrelatedMessagePublishStatus.CapabilityNotFound:
          return notFound("The correlated Message capability was not found.");
        case DefinitionCorrelatedMessagePublishStatus.IdentityConflict:
          return errorResponse(
            409,
            PublicApiErrorCode.Conflict,
            "The command identity conflicts with another correlated Message publication.",
          );
        default:
          return assertNever(result);
      }
    } catch (error: unknown) {
      return correlatedMessageErrorResponse(error);
    }
  }
}

async function readPublicationRequest(
  request: Request,
): Promise<PutDefinitionCorrelatedMessagePublicationRequest> {
  if (request.headers.get("content-type") !== "application/json") {
    throw new HttpRequestFailure(
      415,
      PublicApiErrorCode.UnsupportedMediaType,
      "Correlated Message publication requires application/json.",
    );
  }
  const bytes = await readBoundedBody(request, publicationRequestBodyLimit, {
    empty: "The correlated Message publication body must not be empty.",
    tooLarge: "The correlated Message publication exceeds 4096 bytes.",
  });
  let value: unknown;
  try {
    value = parseStrictJson(bytes);
  } catch {
    throw invalidRequest(
      "The correlated Message publication must be valid UTF-8 JSON.",
    );
  }
  try {
    return decodePutDefinitionCorrelatedMessagePublicationRequest(value);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw invalidRequest("The correlated Message publication shape is invalid.");
    }
    throw error;
  }
}

function correlatedMessageErrorResponse(error: unknown): Response {
  if (error instanceof HttpRequestFailure) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof DefinitionCorrelatedMessageIntegrityError) {
    return internalFailure();
  }
  return internalFailure();
}

function invalidRequest(message: string): HttpRequestFailure {
  return new HttpRequestFailure(400, PublicApiErrorCode.InvalidRequest, message);
}

function notFound(message: string): Response {
  return errorResponse(404, PublicApiErrorCode.NotFound, message);
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The correlated Message request could not be completed.",
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlated Message result: ${String(value)}`);
}
