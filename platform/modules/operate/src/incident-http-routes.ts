import {
  IncidentMutationBodyByteLimit,
  IncidentSnapshotUnavailableMessage,
  PublicApiErrorCode,
  decodeIncidentActionRequest,
  decodeIncidentActionResult,
  decodeIncidentAuditPage,
  decodePublicIncident,
  decodePublicIncidentSnapshot,
  matchIncidentActionPath,
  matchIncidentAuditPath,
  matchIncidentDetailPath,
  matchIncidentsPath,
  requireIncidentRequestBodyLength,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentActionRequest,
  IncidentAuditPage,
  NormalizedIncidentAuditRequest,
  PublicApiErrorCatalogCode,
  PublicApiErrorResponse,
  PublicEffectIncidentId,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";
import type {
  ActorResolver,
  OperationsAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import type { IncidentAggregationService } from "./incident-aggregation-service.js";
import {
  IncidentSnapshotUnavailableError,
} from "./incident-contracts.js";
import type {
  IncidentMutationResult,
} from "./incident-contracts.js";
import type { IncidentMutationService } from "./incident-mutation-service.js";

type IncidentAggregationOperations = Pick<
  IncidentAggregationService,
  "currentSnapshot"
>;

type IncidentMutationOperations = Pick<
  IncidentMutationService,
  "submitAuthorized"
>;

type IncidentAuditOperations = Readonly<{
  search(request: NormalizedIncidentAuditRequest): IncidentAuditPage;
}>;

type IncidentHttpRoutesOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<OperationsAuthorizationPolicy, "decide">;
  aggregation: IncidentAggregationOperations;
  mutations: IncidentMutationOperations;
  audit: IncidentAuditOperations;
  outbox: Readonly<{ reconcileAll(): void }>;
}>;

const RouteKind = {
  Action: "action",
  Audit: "audit",
  Detail: "detail",
  List: "list",
} as const;

type MatchedRoute =
  | Readonly<{ kind: typeof RouteKind.List }>
  | Readonly<{
      kind: typeof RouteKind.Detail;
      incidentId: PublicEffectIncidentId;
    }>
  | Readonly<{ kind: typeof RouteKind.Action; actionId: string }>
  | Readonly<{
      kind: typeof RouteKind.Audit;
      request: NormalizedIncidentAuditRequest;
    }>;

/** Strict authorized Fetch boundary for current incidents, actions, and audit. */
export class IncidentHttpRoutes {
  constructor(private readonly options: IncidentHttpRoutesOptions) {}

  async handle(request: Request): Promise<Response | null> {
    let route: MatchedRoute | null;
    try {
      route = matchRoute(request.url);
    } catch (error: unknown) {
      return error instanceof TypeError ? invalidRequest() : internalFailure();
    }
    if (route === null) return null;

    const expectedMethod = route.kind === RouteKind.Action ? "PUT" : "GET";
    if (request.method !== expectedMethod) return methodNotAllowed(expectedMethod);

    let actorId: string;
    try {
      const actor = this.options.actors.resolveActor();
      if (
        this.options.authorization.decide(actor, authorizationSurface(route)) !==
          OperationsAuthorizationDecision.Permitted
      ) {
        return forbidden();
      }
      actorId = actor.id;
    } catch {
      return internalFailure();
    }

    try {
      const actionRequest = route.kind === RouteKind.Action
        ? await readActionRequest(request)
        : await requireEmptyGet(request);
      this.options.outbox.reconcileAll();
      return await this.#dispatch(route, actorId, actionRequest);
    } catch (error: unknown) {
      if (error instanceof IncidentHttpRequestError) {
        return errorResponse(error.status, error.code, error.message);
      }
      if (error instanceof IncidentSnapshotUnavailableError) {
        return snapshotUnavailable();
      }
      return internalFailure();
    }
  }

  async #dispatch(
    route: MatchedRoute,
    actorId: string,
    actionRequest: IncidentActionRequest | null,
  ): Promise<Response> {
    switch (route.kind) {
      case RouteKind.List:
        return this.#list();
      case RouteKind.Detail:
        return this.#detail(route.incidentId);
      case RouteKind.Action:
        if (actionRequest === null) throw new TypeError("action request is missing");
        return this.#action(route.actionId, actorId, actionRequest);
      case RouteKind.Audit:
        return jsonResponse(
          200,
          decodeIncidentAuditPage(this.options.audit.search(route.request)),
        );
    }
  }

  async #list(): Promise<Response> {
    const snapshot = decodePublicIncidentSnapshot(
      await this.options.aggregation.currentSnapshot(),
    );
    return jsonResponse(200, snapshot);
  }

  async #detail(incidentId: PublicEffectIncidentId): Promise<Response> {
    const snapshot = decodePublicIncidentSnapshot(
      await this.options.aggregation.currentSnapshot(),
    );
    const incident = snapshot.incidents.find((candidate) =>
      incidentIdsEqual(candidate.incident.id, incidentId)
    );
    return incident === undefined
      ? notFound()
      : jsonResponse(200, decodePublicIncident(incident));
  }

  async #action(
    actionId: string,
    actorId: string,
    interaction: IncidentActionRequest,
  ): Promise<Response> {
    const result = await this.options.mutations.submitAuthorized(
      { actorId },
      actionId,
      interaction,
    );
    return incidentMutationResponse(result);
  }
}

function matchRoute(requestUrl: string): MatchedRoute | null {
  const url = new URL(requestUrl);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const actionId = matchIncidentActionPath(target);
  if (actionId !== null) return { kind: RouteKind.Action, actionId };
  const audit = matchIncidentAuditPath(target);
  if (audit !== null) return { kind: RouteKind.Audit, request: audit };
  const incidentId = matchIncidentDetailPath(target);
  if (incidentId !== null) return { kind: RouteKind.Detail, incidentId };
  return matchIncidentsPath(target) ? { kind: RouteKind.List } : null;
}

function authorizationSurface(
  route: MatchedRoute,
): OperationsAuthorizationSurface {
  switch (route.kind) {
    case RouteKind.List:
      return OperationsAuthorizationSurface.IncidentList;
    case RouteKind.Detail:
      return OperationsAuthorizationSurface.IncidentDetail;
    case RouteKind.Action:
      return OperationsAuthorizationSurface.IncidentAction;
    case RouteKind.Audit:
      return OperationsAuthorizationSurface.IncidentAudit;
  }
}

async function readActionRequest(request: Request): Promise<IncidentActionRequest> {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") throw unsupportedMediaType();
  const bytes = await readBody(request);
  try {
    requireIncidentRequestBodyLength("PUT", bytes.byteLength);
    return decodeIncidentActionRequest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (error: unknown) {
    if (error instanceof RangeError) throw payloadTooLarge();
    throw invalidTransport();
  }
}

async function requireEmptyGet(request: Request): Promise<null> {
  if (request.headers.get("content-type") !== null) throw invalidTransport();
  try {
    const bytes = await readBody(request);
    requireIncidentRequestBodyLength("GET", bytes.byteLength);
  } catch {
    throw invalidTransport();
  }
  return null;
}

async function readBody(request: Request): Promise<Uint8Array> {
  const claimed = request.headers.get("content-length");
  if (claimed !== null) {
    if (!/^[0-9]+$/u.test(claimed)) throw invalidTransport();
    const length = Number(claimed);
    if (!Number.isSafeInteger(length)) throw invalidTransport();
    if (length > IncidentMutationBodyByteLimit) throw payloadTooLarge();
  }
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.byteLength > IncidentMutationBodyByteLimit - length) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }
    chunks.push(next.value);
    length += next.value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function incidentMutationResponse(result: IncidentMutationResult): Response {
  switch (result.kind) {
    case "forbidden":
      return forbidden();
    case "conflict":
      return conflict();
    case "result": {
      const decoded = decodeIncidentActionResult(result.result);
      return jsonResponse(decoded.state === "indeterminate" ? 202 : 200, decoded);
    }
  }
}

function incidentIdsEqual(
  left: PublicEffectIncidentId,
  right: PublicEffectIncidentId,
): boolean {
  return left.generation === right.generation &&
    left.effectId.processInstanceId === right.effectId.processInstanceId &&
    left.effectId.elementId === right.effectId.elementId &&
    left.effectId.activation === right.effectId.activation;
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function invalidRequest(): Response {
  return errorResponse(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The incident request is invalid.",
  );
}

function methodNotAllowed(allow: "GET" | "PUT"): Response {
  const response = errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this incident route.",
  );
  response.headers.set("allow", allow);
  return response;
}

function forbidden(): Response {
  return errorResponse(
    403,
    PublicApiErrorCode.Forbidden,
    "The requested incident operation is forbidden.",
  );
}

function notFound(): Response {
  return errorResponse(
    404,
    PublicApiErrorCode.NotFound,
    "The current incident was not found.",
  );
}

function conflict(): Response {
  return errorResponse(
    409,
    PublicApiErrorCode.Conflict,
    "The incident action conflicts with current state.",
  );
}

function snapshotUnavailable(): Response {
  return errorResponse(
    503,
    PublicApiErrorCode.IncidentSnapshotUnavailable,
    IncidentSnapshotUnavailableMessage,
  );
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The incident request could not be completed.",
  );
}

function errorResponse(
  status: number,
  code: PublicApiErrorCatalogCode,
  message: string,
): Response {
  const body = { error: { code, message } } as const satisfies PublicApiErrorResponse<
    PublicApiErrorCatalogCode
  >;
  return jsonResponse(status, body);
}

class IncidentHttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicApiErrorCatalogCode,
    message: string,
  ) {
    super(message);
    this.name = "IncidentHttpRequestError";
  }
}

function invalidTransport(): IncidentHttpRequestError {
  return new IncidentHttpRequestError(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The incident request is invalid.",
  );
}

function unsupportedMediaType(): IncidentHttpRequestError {
  return new IncidentHttpRequestError(
    415,
    PublicApiErrorCode.UnsupportedMediaType,
    "Incident actions require application/json.",
  );
}

function payloadTooLarge(): IncidentHttpRequestError {
  return new IncidentHttpRequestError(
    413,
    PublicApiErrorCode.PayloadTooLarge,
    "The incident action body exceeds 4096 bytes.",
  );
}
