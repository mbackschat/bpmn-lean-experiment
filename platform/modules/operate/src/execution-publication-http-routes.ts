import {
  ExecutionPublicationUnavailableMessage,
  PublicApiErrorCode,
  matchExecutionPublicationExportPath,
  matchExecutionPublicationPath,
  requireExecutionPublicationRequestBodyLength,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationRouteRequest,
  PublicApiErrorCatalogCode,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";
import type {
  ActorResolver,
  OperationsAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import type { ExecutionPublicationRepository } from "./execution-publication-contracts.js";
import {
  ExecutionPublicationReconciliationKind,
} from "./execution-publication-reconciliation-service.js";
import type {
  ExecutionPublicationReconciliationService,
} from "./execution-publication-reconciliation-service.js";

type ExecutionPublicationHttpRoutesOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<OperationsAuthorizationPolicy, "decide">;
  reconciliation: Pick<ExecutionPublicationReconciliationService, "reconcile">;
  publications: Pick<ExecutionPublicationRepository, "page" | "export">;
}>;

const RouteKind = {
  Page: "page",
  Export: "export",
} as const;

type MatchedRoute =
  | Readonly<{
      kind: typeof RouteKind.Page;
      request: ExecutionPublicationRouteRequest;
    }>
  | Readonly<{
      kind: typeof RouteKind.Export;
      processInstanceId: string;
    }>;

/** Authorized bodyless GET boundary over only the complete local publication projection. */
export class ExecutionPublicationHttpRoutes {
  constructor(private readonly options: ExecutionPublicationHttpRoutesOptions) {}

  async handle(request: Request): Promise<Response | null> {
    let route: MatchedRoute | null;
    try {
      route = matchRoute(request.url);
    } catch {
      return invalidRequest();
    }
    if (route === null) return null;
    if (request.method !== "GET") return methodNotAllowed();

    try {
      const actor = this.options.actors.resolveActor();
      if (
        authorizationSurfaces(route).some((surface) =>
          this.options.authorization.decide(actor, surface) !==
            OperationsAuthorizationDecision.Permitted
        )
      ) {
        return forbidden();
      }
    } catch {
      return internalFailure();
    }

    try {
      await requireEmptyGet(request);
    } catch {
      return invalidRequest();
    }

    try {
      const processInstanceId = route.kind === RouteKind.Page
        ? route.request.processInstanceId
        : route.processInstanceId;
      const reconciled = await this.options.reconciliation.reconcile(processInstanceId);
      switch (reconciled.kind) {
        case ExecutionPublicationReconciliationKind.NotFound:
          return notFound();
        case ExecutionPublicationReconciliationKind.NotReady:
        case ExecutionPublicationReconciliationKind.Unavailable:
        case ExecutionPublicationReconciliationKind.Gap:
          return publicationUnavailable();
        case ExecutionPublicationReconciliationKind.Available:
          return route.kind === RouteKind.Page
            ? this.#page(route.request)
            : this.#export(route.processInstanceId);
      }
    } catch (error: unknown) {
      return error instanceof RangeError && route.kind === RouteKind.Page
        ? invalidRequest()
        : internalFailure();
    }
  }

  #page(request: ExecutionPublicationRouteRequest): Response {
    const page = this.options.publications.page(request.processInstanceId, {
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
    return page === null ? publicationUnavailable() : jsonResponse(200, page);
  }

  #export(processInstanceId: string): Response {
    const publication = this.options.publications.export(processInstanceId);
    if (publication === null) return publicationUnavailable();
    const bytes = serializeExecutionPublicationExport(publication, {
      definition: publication.definition,
      processId: publication.processId,
      processInstanceId: publication.processInstanceId,
    });
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          `attachment; filename="${executionExportFilename(processInstanceId)}"`,
      },
    });
  }
}

function matchRoute(requestUrl: string): MatchedRoute | null {
  const url = new URL(requestUrl);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const page = matchExecutionPublicationPath(target);
  if (page !== null) return { kind: RouteKind.Page, request: page };
  const exported = matchExecutionPublicationExportPath(target);
  return exported === null
    ? null
    : { kind: RouteKind.Export, processInstanceId: exported };
}

function authorizationSurfaces(
  route: MatchedRoute,
): readonly OperationsAuthorizationSurface[] {
  switch (route.kind) {
    case RouteKind.Page:
      return [
        OperationsAuthorizationSurface.ExecutionHistory,
        OperationsAuthorizationSurface.ExecutionDiagram,
      ];
    case RouteKind.Export:
      return [OperationsAuthorizationSurface.ExecutionExport];
  }
}

async function requireEmptyGet(request: Request): Promise<void> {
  if (request.headers.get("content-type") !== null) {
    throw new TypeError("execution publication GET must not declare content-type");
  }
  const claimed = request.headers.get("content-length");
  if (claimed !== null && !/^(?:0)$/u.test(claimed)) {
    throw new TypeError("execution publication GET content-length must be zero");
  }
  const bytes = request.body === null
    ? new Uint8Array()
    : new Uint8Array(await request.arrayBuffer());
  requireExecutionPublicationRequestBodyLength(request.method, bytes.byteLength);
}

function executionExportFilename(processInstanceId: string): string {
  const sanitized = processInstanceId
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .slice(0, 80);
  return `execution-${sanitized.length === 0 ? "process-instance" : sanitized}.json`;
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
    "The execution publication request is invalid.",
  );
}

function methodNotAllowed(): Response {
  const response = errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this execution publication route.",
  );
  response.headers.set("allow", "GET");
  return response;
}

function forbidden(): Response {
  return errorResponse(
    403,
    PublicApiErrorCode.Forbidden,
    "The requested execution publication is forbidden.",
  );
}

function notFound(): Response {
  return errorResponse(
    404,
    PublicApiErrorCode.NotFound,
    "The Process instance was not found.",
  );
}

function publicationUnavailable(): Response {
  return errorResponse(
    503,
    PublicApiErrorCode.ExecutionPublicationUnavailable,
    ExecutionPublicationUnavailableMessage,
  );
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The execution publication request could not be completed.",
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
