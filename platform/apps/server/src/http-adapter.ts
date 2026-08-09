import { createServer } from "node:http";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type {
  PublicApiErrorCode as PublicApiErrorCodeValue,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";

import {
  validatePublicOrigin,
} from "./public-origin.js";
import type { ValidatedPublicOrigin } from "./public-origin.js";

export type PlatformHttpRoute = (
  request: Request,
) => Promise<Response | null>;

export type PlatformHttpServerOptions = Readonly<{
  publicOrigin: string;
  routes: ReadonlyArray<PlatformHttpRoute>;
}>;

type StreamingRequestInit = RequestInit & Readonly<{
  duplex: "half";
}>;

/** Adapts Node HTTP transport to ordered Fetch routes without assigning request authority to Host. */
export function createPlatformHttpServer(
  options: PlatformHttpServerOptions,
): Server {
  return createPlatformHttpServerFromValidatedOrigin({
    publicOrigin: validatePublicOrigin(options.publicOrigin),
    routes: options.routes,
  });
}

export function createPlatformHttpServerFromValidatedOrigin(
  options: Readonly<{
    publicOrigin: ValidatedPublicOrigin;
    routes: ReadonlyArray<PlatformHttpRoute>;
  }>,
): Server {
  const publicOrigin = options.publicOrigin;
  const routes = snapshotRoutes(options.routes);
  return createServer((incoming, outgoing) => {
    void serveIncomingRequest(publicOrigin, routes, incoming, outgoing);
  });
}

async function serveIncomingRequest(
  publicOrigin: string,
  routes: ReadonlyArray<PlatformHttpRoute>,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  try {
    const request = createFetchRequest(publicOrigin, incoming);
    const response = await dispatch(routes, request)
      ?? errorResponse(404, PublicApiErrorCode.NotFound, "Resource not found.");
    await writeFetchResponse(request.method, response, outgoing);
  } catch {
    if (outgoing.headersSent || outgoing.writableEnded) {
      if (!outgoing.destroyed) {
        outgoing.destroy();
      }
      return;
    }
    const response = errorResponse(
      500,
      PublicApiErrorCode.InternalFailure,
      "Internal server error.",
    );
    try {
      await writeFetchResponse(incoming.method ?? "GET", response, outgoing);
    } catch {
      if (!outgoing.destroyed) {
        outgoing.destroy();
      }
    }
  }
}

function createFetchRequest(
  publicOrigin: string,
  incoming: IncomingMessage,
): Request {
  const method = incoming.method ?? "GET";
  const url = requestUrl(publicOrigin, incoming.url ?? "/");
  const headers = requestHeaders(incoming.rawHeaders, incoming.headers);
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const init: StreamingRequestInit = {
    method,
    headers,
    body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
    duplex: "half",
  };
  return new Request(url, init);
}

function requestUrl(publicOrigin: string, target: string): URL {
  if (!target.startsWith("/") || target.startsWith("//")) {
    throw new TypeError("incoming request target must use origin form");
  }
  return new URL(target, publicOrigin);
}

function requestHeaders(
  rawHeaders: ReadonlyArray<string>,
  fallbackHeaders: IncomingHttpHeaders,
): Headers {
  const headers = new Headers();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) {
      headers.append(name, value);
    }
  }
  if (rawHeaders.length === 0) {
    for (const [name, value] of Object.entries(fallbackHeaders)) {
      if (Array.isArray(value)) {
        value.forEach((item) => headers.append(name, item));
      } else if (value !== undefined) {
        headers.append(name, value);
      }
    }
  }
  return headers;
}

async function dispatch(
  routes: ReadonlyArray<PlatformHttpRoute>,
  request: Request,
): Promise<Response | null> {
  for (const route of routes) {
    const response = await route(request);
    if (response !== null) {
      return response;
    }
  }
  return null;
}

async function writeFetchResponse(
  requestMethod: string,
  response: Response,
  outgoing: ServerResponse,
): Promise<void> {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") {
      outgoing.setHeader(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    outgoing.setHeader("set-cookie", cookies);
  }
  outgoing.flushHeaders();

  if (requestMethod === "HEAD") {
    await response.body?.cancel();
    outgoing.end();
    return;
  }
  if (response.body === null) {
    outgoing.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), outgoing);
}

function errorResponse(
  status: number,
  code: PublicApiErrorCodeValue,
  message: string,
): Response {
  const body = {
    error: { code, message },
  } as const satisfies PublicApiErrorResponse;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function snapshotRoutes(
  routes: ReadonlyArray<PlatformHttpRoute>,
): ReadonlyArray<PlatformHttpRoute> {
  const snapshot = [...routes];
  if (snapshot.some((route) => typeof route !== "function")) {
    throw new TypeError("routes must contain only route functions");
  }
  return snapshot;
}
