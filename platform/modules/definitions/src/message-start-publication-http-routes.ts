import {
  decodePutMessageStartPublicationRequest,
  matchMessageStartPublicationPath,
  MessageStartPublicationStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  MessageStartPublication,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  MessageStartPublicationConflictError,
  MessageStartPublicationDeliveryUnavailableError,
  MessageStartPublicationIntegrityError,
  MessageStartPublicationNotFoundError,
  MessageStartPublicationValidationError,
} from "./message-start-publication-contracts.js";
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
import type {
  MessageStartPublicationService,
} from "./message-start-publication-service.js";

const publicationRequestBodyLimit = 4_096;

type PublicationOperations = Pick<
  MessageStartPublicationService,
  "put" | "get"
>;

/** Global Fetch-compatible boundary for one immutable Message Start publication. */
export class MessageStartPublicationHttpRoutes {
  readonly #publications: PublicationOperations;

  constructor(publications: PublicationOperations) {
    this.#publications = publications;
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    let match: Readonly<{ publicationId: string }> | null;
    try {
      match = matchMessageStartPublicationPath(url.pathname);
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        return errorResponse(
          400,
          PublicApiErrorCode.InvalidRequest,
          "The Message Start publication identity is malformed.",
        );
      }
      throw error;
    }
    if (match === null) {
      return null;
    }
    try {
      switch (request.method) {
        case "PUT":
          return await this.#put(match.publicationId, request, url);
        case "GET":
          return await this.#get(match.publicationId, request, url);
        default:
          return methodNotAllowed("GET, PUT");
      }
    } catch (error: unknown) {
      return publicationErrorResponse(error);
    }
  }

  async #put(
    publicationId: string,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    const input = await readPublicationRequest(request);
    const result = await this.#publications.put(publicationId, input);
    return jsonResponse(
      putStatus(result.created, result.publication),
      result.publication,
    );
  }

  async #get(
    publicationId: string,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    await requireEmptyRequestBody(request, "Message Start publication GET");
    const publication = await this.#publications.get(publicationId);
    return publication === null
      ? notFound("The Message Start publication was not found.")
      : jsonResponse(200, publication);
  }
}

async function readPublicationRequest(
  request: Request,
): Promise<PutMessageStartPublicationRequest> {
  if (request.headers.get("content-type") !== "application/json") {
    throw new HttpRequestFailure(
      415,
      PublicApiErrorCode.UnsupportedMediaType,
      "Message Start publication requires application/json.",
    );
  }
  const bytes = await readBoundedBody(request, publicationRequestBodyLimit, {
    empty: "The Message Start publication request body must not be empty.",
    tooLarge: "The Message Start publication request exceeds 4096 bytes.",
  });
  let value: unknown;
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(source) as unknown;
  } catch {
    throw invalidRequest(
      "The Message Start publication request must be valid UTF-8 JSON.",
    );
  }
  try {
    return decodePutMessageStartPublicationRequest(value);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw invalidRequest(
        "The Message Start publication request shape is invalid.",
      );
    }
    throw error;
  }
}

function putStatus(
  created: boolean,
  publication: MessageStartPublication,
): number {
  switch (publication.status) {
    case MessageStartPublicationStatus.Accepted:
      return created ? 201 : 200;
    case MessageStartPublicationStatus.Pending:
    case MessageStartPublicationStatus.Indeterminate:
      return 202;
    default:
      return assertNever(publication);
  }
}

function publicationErrorResponse(error: unknown): Response {
  if (error instanceof HttpRequestFailure) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof MessageStartPublicationConflictError) {
    return errorResponse(
      409,
      PublicApiErrorCode.Conflict,
      "The publication identity conflicts with an existing immutable request.",
    );
  }
  if (error instanceof MessageStartPublicationNotFoundError) {
    return notFound("The exact definition version was not found.");
  }
  if (error instanceof MessageStartPublicationValidationError) {
    return errorResponse(
      422,
      PublicApiErrorCode.InvalidRequest,
      "The exact Message Start target is not admitted.",
    );
  }
  if (
    error instanceof MessageStartPublicationIntegrityError ||
    error instanceof MessageStartPublicationDeliveryUnavailableError
  ) {
    return internalFailure();
  }
  return internalFailure();
}

function invalidRequest(message: string): HttpRequestFailure {
  return new HttpRequestFailure(
    400,
    PublicApiErrorCode.InvalidRequest,
    message,
  );
}

function notFound(message: string): Response {
  return errorResponse(404, PublicApiErrorCode.NotFound, message);
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The Message Start publication request could not be completed.",
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start publication: ${String(value)}`);
}
