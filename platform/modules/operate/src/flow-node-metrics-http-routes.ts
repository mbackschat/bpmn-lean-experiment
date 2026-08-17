import {
  FlowNodeMetricsResultKind,
  FlowNodeMetricsUnavailableMessage,
  matchFlowNodeMetricsPath,
  projectionFreshnessResponseHeaders,
  PublicApiErrorCode,
  requireFlowNodeMetricsRequestBodyLength,
} from "@bpmn-lean/platform-contracts";
import type {
  FlowNodeMetricsResult,
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

import type {
  FlowNodeMetricsAggregationService,
} from "./flow-node-metrics-aggregation-service.js";

type FlowNodeMetricsHttpRoutesOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<OperationsAuthorizationPolicy, "decide">;
  aggregation: Readonly<{
    get(
      reference: Parameters<FlowNodeMetricsAggregationService["get"]>[0],
    ): Promise<FlowNodeMetricsResult | ProjectionRead<FlowNodeMetricsResult> | null>;
  }>;
}>;

/** Authorization-first bodyless GET owner for exact-version flow-node metrics. */
export class FlowNodeMetricsHttpRoutes {
  constructor(private readonly options: FlowNodeMetricsHttpRoutesOptions) {}

  async handle(request: Request): Promise<Response | null> {
    let reference;
    try {
      const url = new URL(request.url);
      reference = matchFlowNodeMetricsPath(`${url.pathname}${url.search}${url.hash}`);
    } catch {
      return invalidRequest();
    }
    if (reference === null) return null;
    if (request.method !== "GET") return methodNotAllowed();

    try {
      const actor = this.options.actors.resolveActor();
      if (
        this.options.authorization.decide(
          actor,
          OperationsAuthorizationSurface.FlowNodeMetrics,
        ) !== OperationsAuthorizationDecision.Permitted
      ) {
        return forbidden();
      }
    } catch {
      return internalFailure();
    }

    try {
      await requireBodylessGet(
        request,
        requireFlowNodeMetricsRequestBodyLength,
      );
    } catch {
      return invalidRequest();
    }

    try {
      const resultValue = await this.options.aggregation.get(reference);
      if (resultValue === null) return notFound();
      let read: ProjectionRead<FlowNodeMetricsResult> | null;
      let result: FlowNodeMetricsResult;
      if (isProjectionRead(resultValue)) {
        read = resultValue;
        result = resultValue.value;
      } else {
        read = null;
        result = resultValue;
      }
      switch (result.kind) {
        case FlowNodeMetricsResultKind.Available:
          return metricsResponse(result, read);
        case FlowNodeMetricsResultKind.Unavailable:
          return metricsUnavailable();
      }
      return internalFailure();
    } catch {
      return internalFailure();
    }
  }
}

function isProjectionRead(
  value: FlowNodeMetricsResult | ProjectionRead<FlowNodeMetricsResult>,
): value is ProjectionRead<FlowNodeMetricsResult> {
  return "value" in value && "freshness" in value;
}

function metricsResponse(
  result: FlowNodeMetricsResult,
  read: ProjectionRead<FlowNodeMetricsResult> | null,
): Response {
  const response = jsonResponse(200, result);
  if (read?.freshness !== null && read !== null) {
    for (const [name, value] of Object.entries(
      projectionFreshnessResponseHeaders(read.freshness),
    )) {
      response.headers.set(name, value);
    }
  }
  return response;
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
    "The flow-node metrics request is invalid.",
  );
}

function methodNotAllowed(): Response {
  const response = errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this flow-node metrics route.",
  );
  response.headers.set("allow", "GET");
  return response;
}

function forbidden(): Response {
  return errorResponse(
    403,
    PublicApiErrorCode.Forbidden,
    "The requested flow-node metrics are forbidden.",
  );
}

function notFound(): Response {
  return errorResponse(
    404,
    PublicApiErrorCode.NotFound,
    "The definition version was not found.",
  );
}

function metricsUnavailable(): Response {
  return errorResponse(
    503,
    PublicApiErrorCode.FlowNodeMetricsUnavailable,
    FlowNodeMetricsUnavailableMessage,
  );
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The flow-node metrics request could not be completed.",
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
