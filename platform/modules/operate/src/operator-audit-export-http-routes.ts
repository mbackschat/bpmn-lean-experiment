import {
  decodePublicProcessInstanceIdentity,
  matchOperatorAuditExportPath,
  OperatorAuditUnavailableMessage,
  operatorAuditExportFilename,
  PublicApiErrorCode,
  requireOperatorAuditExportRequestBodyLength,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicApiErrorCatalogCode,
  PublicApiErrorResponse,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";
import type {
  ActorResolver,
  OperationsAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

type ConfirmedInstanceLookup = Readonly<{
  getConfirmed(processInstanceId: string): unknown | null;
}>;

type OperatorAuditExporter = Readonly<{
  create(instance: PublicProcessInstanceIdentity): Uint8Array;
}>;

export type OperatorAuditExportHttpRoutesOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<OperationsAuthorizationPolicy, "decide">;
  registrations: ConfirmedInstanceLookup;
  exports: OperatorAuditExporter;
}>;

/** Serves one Operations-authorized canonical audit attachment for a confirmed Process instance. */
export class OperatorAuditExportHttpRoutes {
  constructor(private readonly options: OperatorAuditExportHttpRoutesOptions) {}

  async handle(request: Request): Promise<Response | null> {
    let processInstanceId: string | null;
    try {
      processInstanceId = matchRoute(request.url);
    } catch {
      return invalidRequest();
    }
    if (processInstanceId === null) return null;
    if (request.method !== "GET") return methodNotAllowed();

    try {
      const actor = this.options.actors.resolveActor();
      if (
        this.options.authorization.decide(
          actor,
          OperationsAuthorizationSurface.OperatorAudit,
        ) !== OperationsAuthorizationDecision.Permitted
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

    let instance: PublicProcessInstanceIdentity;
    try {
      const registered = this.options.registrations.getConfirmed(processInstanceId);
      if (registered === null) return notFound();
      instance = decodePublicProcessInstanceIdentity(
        registered,
        "confirmed operator audit instance",
      );
      if (instance.processInstanceId !== processInstanceId) {
        throw new TypeError("confirmed operator audit identity does not match its key");
      }
    } catch {
      return internalFailure();
    }

    try {
      const bytes = this.options.exports.create(instance);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition":
            `attachment; filename="${operatorAuditExportFilename(processInstanceId)}"`,
        },
      });
    } catch {
      return operatorAuditUnavailable();
    }
  }
}

function matchRoute(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  return matchOperatorAuditExportPath(`${url.pathname}${url.search}${url.hash}`);
}

async function requireEmptyGet(request: Request): Promise<void> {
  if (request.headers.get("content-type") !== null) {
    throw new TypeError("operator audit GET must not declare content-type");
  }
  const claimed = request.headers.get("content-length");
  if (claimed !== null && claimed !== "0") {
    throw new TypeError("operator audit GET content-length must be zero");
  }
  const bytes = request.body === null
    ? new Uint8Array()
    : new Uint8Array(await request.arrayBuffer());
  requireOperatorAuditExportRequestBodyLength(request.method, bytes.byteLength);
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

function invalidRequest(): Response {
  return errorResponse(
    400,
    PublicApiErrorCode.InvalidRequest,
    "The operator audit request is invalid.",
  );
}

function methodNotAllowed(): Response {
  const response = errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this operator audit route.",
  );
  response.headers.set("allow", "GET");
  return response;
}

function forbidden(): Response {
  return errorResponse(
    403,
    PublicApiErrorCode.Forbidden,
    "The requested operator audit is forbidden.",
  );
}

function notFound(): Response {
  return errorResponse(
    404,
    PublicApiErrorCode.NotFound,
    "The Process instance was not found.",
  );
}

function operatorAuditUnavailable(): Response {
  return errorResponse(
    503,
    PublicApiErrorCode.OperatorAuditUnavailable,
    OperatorAuditUnavailableMessage,
  );
}

function internalFailure(): Response {
  return errorResponse(
    500,
    PublicApiErrorCode.InternalFailure,
    "The operator audit request could not be completed.",
  );
}
