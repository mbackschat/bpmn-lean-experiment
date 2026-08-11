import {
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicApiErrorCode as PublicApiErrorCodeValue,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";

import {
  HttpRequestFailure,
} from "./http-request.js";

export function requireNoQuery(request: Request, url: URL): void {
  if (url.search.length > 0 || request.url.includes("?")) {
    throw new HttpRequestFailure(
      400,
      PublicApiErrorCode.InvalidRequest,
      "This definition route does not accept query parameters.",
    );
  }
}

export function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(
  status: number,
  code: PublicApiErrorCodeValue,
  message: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  const body = { error: { code, message } } as const satisfies PublicApiErrorResponse;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

export function methodNotAllowed(allow: string): Response {
  return errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this definition route.",
    { allow },
  );
}
