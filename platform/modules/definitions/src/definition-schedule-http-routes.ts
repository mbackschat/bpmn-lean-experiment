import {
  matchDefinitionSchedulePath,
  matchDefinitionSchedulesPath,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule as PublicDefinitionSchedule,
  DefinitionScheduleListResponse,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionScheduleConflictError,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
  DefinitionScheduleValidationError,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionSchedule,
  DefinitionScheduleReference,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionDeploymentService,
} from "./definition-deployment-service.js";
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  requireNoQuery,
} from "./definition-http-responses.js";
import {
  toPublicDefinition,
} from "./definition-public-values.js";
import {
  readDefinitionScheduleRequest,
} from "./definition-schedule-http-request.js";
import type {
  DefinitionScheduleService,
} from "./definition-schedule-service.js";
import {
  HttpRequestFailure,
  requireEmptyRequestBody,
} from "./http-request.js";

const DefinitionScheduleRouteKind = {
  Collection: "collection",
  Item: "item",
} as const;

type DefinitionScheduleRoute =
  | Readonly<{
      kind: typeof DefinitionScheduleRouteKind.Collection;
      processId: string;
      version: number;
    }>
  | Readonly<{
      kind: typeof DefinitionScheduleRouteKind.Item;
      processId: string;
      version: number;
      scheduleId: string;
    }>;

type ScheduleOperations = Pick<
  DefinitionScheduleService,
  "put" | "get" | "list" | "delete"
>;
type DefinitionReader = Pick<
  DefinitionDeploymentService,
  "getDefinitionMetadata"
>;

/** Fetch-compatible definition scheduling boundary with no Temporal representation. */
export class DefinitionScheduleHttpRoutes {
  readonly #schedules: ScheduleOperations;
  readonly #definitions: DefinitionReader;

  constructor(schedules: ScheduleOperations, definitions: DefinitionReader) {
    this.#schedules = schedules;
    this.#definitions = definitions;
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    let route: DefinitionScheduleRoute | null;
    try {
      route = matchRoute(url.pathname);
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        return errorResponse(
          400,
          PublicApiErrorCode.InvalidRequest,
          "The definition schedule route identity is malformed.",
        );
      }
      throw error;
    }
    if (route === null) {
      return null;
    }
    try {
      return await this.#handleRoute(route, request, url);
    } catch (error: unknown) {
      return scheduleErrorResponse(error);
    }
  }

  async #handleRoute(
    route: DefinitionScheduleRoute,
    request: Request,
    url: URL,
  ): Promise<Response> {
    switch (route.kind) {
      case DefinitionScheduleRouteKind.Collection:
        return request.method === "GET"
          ? await this.#list(route, request, url)
          : methodNotAllowed("GET");
      case DefinitionScheduleRouteKind.Item:
        switch (request.method) {
          case "PUT":
            return await this.#put(route, request, url);
          case "GET":
            return await this.#get(route, request, url);
          case "DELETE":
            return await this.#delete(route, request, url);
          default:
            return methodNotAllowed("DELETE, GET, PUT");
        }
      default:
        return assertNever(route);
    }
  }

  async #put(
    route: Extract<DefinitionScheduleRoute, { kind: "item" }>,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    const input = await readDefinitionScheduleRequest(request);
    const reference = scheduleReference(route);
    if (await this.#definitions.getDefinitionMetadata(reference) === null) {
      return notFound("The definition version was not found.");
    }
    const result = await this.#schedules.put({
      ...reference,
      activationAt: input.activationAt,
    });
    return jsonResponse(
      result.created ? 201 : 200,
      toPublicSchedule(result.schedule),
    );
  }

  async #get(
    route: Extract<DefinitionScheduleRoute, { kind: "item" }>,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    await requireEmptyRequestBody(request, "Definition schedule GET");
    const reference = scheduleReference(route);
    const schedule = await this.#schedules.get(reference);
    return schedule === null
      ? notFound("The definition schedule was not found.")
      : jsonResponse(200, toPublicSchedule(schedule));
  }

  async #list(
    route: Extract<DefinitionScheduleRoute, { kind: "collection" }>,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    await requireEmptyRequestBody(request, "Definition schedule list");
    const reference = definitionReference(route);
    const definition = await this.#definitions.getDefinitionMetadata(reference);
    if (definition === null) {
      return notFound("The definition version was not found.");
    }
    const result = {
      definition: toPublicDefinition(definition),
      schedules: (await this.#schedules.list(reference)).map(toPublicSchedule),
    } as const satisfies DefinitionScheduleListResponse;
    return jsonResponse(200, result);
  }

  async #delete(
    route: Extract<DefinitionScheduleRoute, { kind: "item" }>,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    await requireEmptyRequestBody(request, "Definition schedule DELETE");
    const reference = scheduleReference(route);
    const schedule = await this.#schedules.delete(reference);
    return schedule === null
      ? notFound("The definition schedule was not found.")
      : jsonResponse(200, toPublicSchedule(schedule));
  }
}

function matchRoute(pathname: string): DefinitionScheduleRoute | null {
  const item = matchDefinitionSchedulePath(pathname);
  if (item !== null) {
    return { kind: DefinitionScheduleRouteKind.Item, ...item };
  }
  const collection = matchDefinitionSchedulesPath(pathname);
  return collection === null
    ? null
    : { kind: DefinitionScheduleRouteKind.Collection, ...collection };
}

function definitionReference(
  route: Readonly<{ processId: string; version: number }>,
): Readonly<{ processId: string; version: number }> {
  return { processId: route.processId, version: route.version };
}

function scheduleReference(
  route: Readonly<{
    processId: string;
    version: number;
    scheduleId: string;
  }>,
): DefinitionScheduleReference {
  return { ...definitionReference(route), scheduleId: route.scheduleId };
}

function toPublicSchedule(
  schedule: DefinitionSchedule,
): PublicDefinitionSchedule {
  const base = {
    scheduleId: schedule.scheduleId,
    definition: toPublicDefinition(schedule.definition),
    timerStart: { ...schedule.timerStart },
    activationAt: schedule.activationAt,
    dueAt: schedule.dueAt,
  };
  switch (schedule.status) {
    case DefinitionScheduleState.Scheduled:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return { ...base, status: schedule.status, instance: null };
    case DefinitionScheduleState.Started:
      return {
        ...base,
        status: schedule.status,
        instance: {
          processInstanceId: schedule.instance.processInstanceId,
          definition: toPublicDefinition(schedule.instance.definition),
        },
      };
    default:
      return assertNever(schedule);
  }
}

function scheduleErrorResponse(error: unknown): Response {
  if (error instanceof HttpRequestFailure) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof DefinitionScheduleConflictError) {
    return errorResponse(
      409,
      PublicApiErrorCode.Conflict,
      "The definition schedule conflicts with an existing immutable schedule.",
    );
  }
  if (error instanceof DefinitionScheduleValidationError) {
    return errorResponse(422, PublicApiErrorCode.InvalidRequest, error.message);
  }
  if (error instanceof DefinitionScheduleIntegrityError) {
    return internalFailure();
  }
  return internalFailure();
}

function notFound(message: string): Response {
  return errorResponse(404, PublicApiErrorCode.NotFound, message);
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The definition schedule request could not be completed.",
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition schedule route: ${String(value)}`);
}
