import {
  ExecutionPublicationUnavailableMessage,
  PublicApiErrorCode,
  matchExecutionPublicationExportPath,
  matchExecutionPublicationPath,
  projectionFreshnessResponseHeaders,
  requireExecutionPublicationRequestBodyLength,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationRouteRequest,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ProjectionRead,
  PublicApiErrorCatalogCode,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";

import { requireBodylessGet } from "./bodyless-get.js";
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
import {
  PostgresqlProjectionReadKind,
} from "./postgresql-projection-read.js";
import type {
  PostgresqlProjectionRead,
} from "./postgresql-projection-read.js";

type ExecutionPublicationHttpRoutesCommonOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<OperationsAuthorizationPolicy, "decide">;
}>;

type ExecutionPublicationHttpRoutesOptions = ExecutionPublicationHttpRoutesCommonOptions & (
  | Readonly<{
      reconciliation: Pick<ExecutionPublicationReconciliationService, "reconcile">;
      publications: Pick<ExecutionPublicationRepository, "page" | "export">;
      projectedReads?: never;
    }>
  | Readonly<{
      projectedReads: Readonly<{
        page(
          processInstanceId: string,
          request: Readonly<{ afterRevision: number; limit?: number }>,
        ): Promise<PostgresqlProjectionRead<ExecutionPublicationPage>>;
        export(
          processInstanceId: string,
        ): Promise<PostgresqlProjectionRead<ExecutionPublicationExport>>;
      }>;
      reconciliation?: never;
      publications?: never;
    }>
);

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
      await requireBodylessGet(
        request,
        requireExecutionPublicationRequestBodyLength,
      );
    } catch {
      return invalidRequest();
    }

    try {
      const processInstanceId = route.kind === RouteKind.Page
        ? route.request.processInstanceId
        : route.processInstanceId;
      if (this.options.projectedReads !== undefined) {
        return route.kind === RouteKind.Page
          ? projectedPageResponse(await this.options.projectedReads.page(
              processInstanceId,
              {
                afterRevision: route.request.afterRevision,
                ...(route.request.limit === undefined
                  ? {}
                  : { limit: route.request.limit }),
              },
            ))
          : projectedExportResponse(
              processInstanceId,
              await this.options.projectedReads.export(processInstanceId),
            );
      }
      const publications = this.options.publications;
      if (publications === undefined) throw new TypeError("local publications are missing");
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
            ? await this.#page(publications, route.request)
            : await this.#export(publications, route.processInstanceId);
      }
    } catch (error: unknown) {
      return error instanceof RangeError && route.kind === RouteKind.Page
        ? invalidRequest()
        : internalFailure();
    }
  }

  async #page(
    publications: Pick<ExecutionPublicationRepository, "page" | "export">,
    request: ExecutionPublicationRouteRequest,
  ): Promise<Response> {
    const page = await publications.page(request.processInstanceId, {
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
    return page === null ? publicationUnavailable() : jsonResponse(200, page);
  }

  async #export(
    publications: Pick<ExecutionPublicationRepository, "page" | "export">,
    processInstanceId: string,
  ): Promise<Response> {
    const publication = await publications.export(processInstanceId);
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

function projectedPageResponse(
  result: PostgresqlProjectionRead<ExecutionPublicationPage>,
): Response {
  switch (result.kind) {
    case PostgresqlProjectionReadKind.Available:
      return projectionJsonResponse(result.read);
    case PostgresqlProjectionReadKind.NotFound:
      return notFound();
    case PostgresqlProjectionReadKind.Unavailable:
      return publicationUnavailable();
  }
}

function projectedExportResponse(
  processInstanceId: string,
  result: PostgresqlProjectionRead<ExecutionPublicationExport>,
): Response {
  switch (result.kind) {
    case PostgresqlProjectionReadKind.Available:
      return exportResponse(processInstanceId, result.read);
    case PostgresqlProjectionReadKind.NotFound:
      return notFound();
    case PostgresqlProjectionReadKind.Unavailable:
      return publicationUnavailable();
  }
}

function projectionJsonResponse(read: ProjectionRead<ExecutionPublicationPage>): Response {
  const response = jsonResponse(200, read.value);
  addFreshness(response, read);
  return response;
}

function exportResponse(
  processInstanceId: string,
  read: ProjectionRead<ExecutionPublicationExport>,
): Response {
  const publication = read.value;
  const bytes = serializeExecutionPublicationExport(publication, {
    definition: publication.definition,
    processId: publication.processId,
    processInstanceId: publication.processInstanceId,
  });
  const response = new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition":
        `attachment; filename="${executionExportFilename(processInstanceId)}"`,
    },
  });
  addFreshness(response, read);
  return response;
}

function addFreshness(response: Response, read: ProjectionRead<unknown>): void {
  if (read.freshness === null) return;
  for (const [name, value] of Object.entries(
    projectionFreshnessResponseHeaders(read.freshness),
  )) {
    response.headers.set(name, value);
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
