import {
  decodeProcessInstanceSearchPage,
  matchProcessInstancesPath,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  ProcessInstanceSearchRequest,
  PublicApiErrorCode as PublicApiErrorCodeValue,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";

import type {
  ProcessInstanceSearchService,
} from "./process-instance-search-service.js";

const canonicalNonnegativeInteger = /^[0-9]+$/u;

type SearchOperations = Pick<
  ProcessInstanceSearchService,
  "searchProcessInstances"
>;

/** Fetch-compatible identity-only search boundary over confirmed starts. */
export class ProcessInstanceHttpRoutes {
  readonly #search: SearchOperations;

  constructor(search: SearchOperations) {
    this.#search = search;
  }

  async handle(request: Request): Promise<Response | null> {
    let searchRequest: ProcessInstanceSearchRequest | null;
    try {
      const url = new URL(request.url);
      searchRequest = matchProcessInstancesPath(
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        return invalidRequest();
      }
      throw error;
    }
    if (searchRequest === null) {
      return null;
    }
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    try {
      await requireEmptyBody(request);
    } catch (error: unknown) {
      if (error instanceof InvalidSearchRequestError) {
        return invalidRequest();
      }
      return internalFailure();
    }

    try {
      const page = decodeProcessInstanceSearchPage(
        await this.#search.searchProcessInstances(searchRequest),
      );
      return jsonResponse(200, page);
    } catch {
      return internalFailure();
    }
  }
}

async function requireEmptyBody(request: Request): Promise<void> {
  if (request.headers.get("content-type") !== null) {
    throw new InvalidSearchRequestError();
  }
  const claimedLength = request.headers.get("content-length");
  if (claimedLength !== null) {
    if (!canonicalNonnegativeInteger.test(claimedLength)) {
      throw new InvalidSearchRequestError();
    }
    const length = Number(claimedLength);
    if (!Number.isSafeInteger(length) || length !== 0) {
      throw new InvalidSearchRequestError();
    }
  }
  if (request.body === null) {
    return;
  }
  const reader = request.body.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) {
      return;
    }
    if (result.value.byteLength > 0) {
      await reader.cancel().catch(() => undefined);
      throw new InvalidSearchRequestError();
    }
  }
}

function invalidRequest(): Response {
  return errorResponse(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The Process-instance search request is invalid.",
  );
}

function methodNotAllowed(): Response {
  return errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this Process-instance route.",
    { allow: "GET" },
  );
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The Process-instance search request could not be completed.",
  );
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(
  status: number,
  code: PublicApiErrorCodeValue,
  message: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const body = {
    error: { code, message },
  } as const satisfies PublicApiErrorResponse;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

class InvalidSearchRequestError extends Error {}
