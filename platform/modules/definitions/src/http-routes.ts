import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  AdmissionDiagnostic,
  DefinitionDeployResult,
  DefinitionListResponse,
  DefinitionVersionListResponse,
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
  ProcessInstanceStartResult,
  PublicApiErrorCode as PublicApiErrorCodeValue,
  PublicApiErrorResponse,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionDeploymentStatus,
  DefinitionVersionStartStatus,
} from "./contracts.js";
import type {
  DefinitionDeploymentResult,
  DefinitionDiagnostic,
  DefinitionMetadata,
  DefinitionSourceIdentity,
  DefinitionVersionStartResult,
} from "./contracts.js";
import type { DefinitionDeploymentService } from "./definition-deployment-service.js";
import type { DefinitionStartService } from "./definition-start-service.js";
import {
  decodeProcessId,
  HttpRequestFailure,
  parseDeploymentQuery,
  parsePositiveVersion,
  readBoundedBody,
  requireEmptyStartBody,
  requireDeploymentMediaType,
} from "./http-request.js";

const definitionsPath = "/api/v1/definitions";
const versionsRoute = /^\/api\/v1\/definitions\/([^/]*)\/versions$/u;
const sourceRoute = /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/source$/u;
const startRoute = /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/start$/u;

const DefinitionRouteKind = {
  Collection: "collection",
  Versions: "versions",
  Source: "source",
  Start: "start",
} as const;

type DefinitionRoute =
  | Readonly<{ kind: typeof DefinitionRouteKind.Collection }>
  | Readonly<{
      kind: typeof DefinitionRouteKind.Versions;
      rawProcessId: string;
    }>
  | Readonly<{
      kind: typeof DefinitionRouteKind.Source;
      rawProcessId: string;
      rawVersion: string;
    }>
  | Readonly<{
      kind: typeof DefinitionRouteKind.Start;
      rawProcessId: string;
      rawVersion: string;
    }>;

export type DefinitionHttpRoutesOptions = Readonly<{
  maxSourceBytes: number;
}>;

/** Definition module contribution to the platform's Fetch-compatible HTTP boundary. */
export class DefinitionHttpRoutes {
  readonly #deploymentService: DefinitionDeploymentService;
  readonly #startService: DefinitionStartService;
  readonly #maxSourceBytes: number;

  constructor(
    deploymentService: DefinitionDeploymentService,
    startService: DefinitionStartService,
    options: DefinitionHttpRoutesOptions,
  ) {
    if (
      !Number.isSafeInteger(options.maxSourceBytes) ||
      options.maxSourceBytes <= 0
    ) {
      throw new RangeError("maxSourceBytes must be a positive safe integer");
    }
    this.#deploymentService = deploymentService;
    this.#startService = startService;
    this.#maxSourceBytes = options.maxSourceBytes;
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const route = matchRoute(url.pathname);
    if (route === null) {
      return null;
    }
    try {
      return await this.#handleRoute(route, request, url);
    } catch (error: unknown) {
      if (error instanceof HttpRequestFailure) {
        return errorResponse(error.status, error.code, error.message);
      }
      return errorResponse(
        500,
        PublicApiErrorCode.InternalFailure,
        "The definition request could not be completed.",
      );
    }
  }

  async #handleRoute(
    route: DefinitionRoute,
    request: Request,
    url: URL,
  ): Promise<Response> {
    switch (route.kind) {
      case DefinitionRouteKind.Collection:
        return request.method === "POST"
          ? await this.#deploy(request, url)
          : request.method === "GET"
            ? this.#list(request, url)
            : methodNotAllowed("GET, POST");
      case DefinitionRouteKind.Versions:
        if (request.method !== "GET") {
          return methodNotAllowed("GET");
        }
        return this.#listVersions(route.rawProcessId, request, url);
      case DefinitionRouteKind.Source:
        if (request.method !== "GET") {
          return methodNotAllowed("GET");
        }
        return await this.#getSource(
          route.rawProcessId,
          route.rawVersion,
          request,
          url,
        );
      case DefinitionRouteKind.Start:
        if (request.method !== "POST") {
          return methodNotAllowed("POST");
        }
        return await this.#start(
          route.rawProcessId,
          route.rawVersion,
          request,
          url,
        );
      default:
        return assertNever(route);
    }
  }

  async #deploy(request: Request, url: URL): Promise<Response> {
    const query = parseDeploymentQuery(url);
    requireDeploymentMediaType(request.headers);
    const bytes = await readBoundedBody(request, this.#maxSourceBytes);
    const result = await this.#deploymentService.deploy({
      bytes,
      sourceId: query.sourceId,
      semanticProfile: query.semanticProfile,
      expectedSha256: undefined,
    });
    const publicResult = toPublicDeployment(result, query.semanticProfile);
    switch (publicResult.status) {
      case DefinitionDeployStatus.Deployed:
        return jsonResponse(201, publicResult);
      case DefinitionDeployStatus.Rejected:
        return jsonResponse(422, publicResult);
      default:
        return assertNever(publicResult);
    }
  }

  #list(request: Request, url: URL): Response {
    requireNoQuery(request, url);
    const result = {
      definitions: this.#deploymentService
        .listLatestDefinitions()
        .map(toPublicDefinition),
    } as const satisfies DefinitionListResponse;
    return jsonResponse(200, result);
  }

  #listVersions(rawProcessId: string, request: Request, url: URL): Response {
    requireNoQuery(request, url);
    const processId = decodeProcessId(rawProcessId);
    const result = {
      processId,
      versions: this.#deploymentService
        .listDefinitionVersions(processId)
        .map(toPublicDefinition),
    } as const satisfies DefinitionVersionListResponse;
    return jsonResponse(200, result);
  }

  async #getSource(
    rawProcessId: string,
    rawVersion: string,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    const reference = {
      processId: decodeProcessId(rawProcessId),
      version: parsePositiveVersion(rawVersion),
    };
    const metadata = this.#deploymentService.getDefinitionMetadata(reference);
    if (metadata === null) {
      return errorResponse(
        404,
        PublicApiErrorCode.NotFound,
        "The definition version was not found.",
      );
    }
    const bytes = await this.#deploymentService.getDefinitionSource(reference);
    if (bytes === null) {
      return errorResponse(
        404,
        PublicApiErrorCode.NotFound,
        "The definition version was not found.",
      );
    }
    if (bytes.byteLength !== metadata.source.byteLength) {
      throw new Error("definition source length does not match metadata");
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/xml",
        "content-length": String(bytes.byteLength),
        etag: `"sha256-${metadata.source.sha256}"`,
      },
    });
  }

  async #start(
    rawProcessId: string,
    rawVersion: string,
    request: Request,
    url: URL,
  ): Promise<Response> {
    requireNoQuery(request, url);
    await requireEmptyStartBody(request);
    const result = await this.#startService.start({
      processId: decodeProcessId(rawProcessId),
      version: parsePositiveVersion(rawVersion),
    });
    switch (result.status) {
      case DefinitionVersionStartStatus.Started:
        return jsonResponse(201, toPublicStartResult(result));
      case DefinitionVersionStartStatus.Rejected:
        return jsonResponse(422, toPublicStartResult(result));
      case DefinitionVersionStartStatus.NotFound:
        return errorResponse(
          404,
          PublicApiErrorCode.NotFound,
          "The definition version was not found.",
        );
      default:
        return assertNever(result);
    }
  }
}

function matchRoute(pathname: string): DefinitionRoute | null {
  if (pathname === definitionsPath) {
    return { kind: DefinitionRouteKind.Collection };
  }
  const startMatch = startRoute.exec(pathname);
  if (startMatch !== null) {
    return {
      kind: DefinitionRouteKind.Start,
      rawProcessId: startMatch[1] ?? "",
      rawVersion: startMatch[2] ?? "",
    };
  }
  const sourceMatch = sourceRoute.exec(pathname);
  if (sourceMatch !== null) {
    return {
      kind: DefinitionRouteKind.Source,
      rawProcessId: sourceMatch[1] ?? "",
      rawVersion: sourceMatch[2] ?? "",
    };
  }
  const versionsMatch = versionsRoute.exec(pathname);
  if (versionsMatch !== null) {
    return {
      kind: DefinitionRouteKind.Versions,
      rawProcessId: versionsMatch[1] ?? "",
    };
  }
  return null;
}

function toPublicStartResult(
  result: Exclude<
    DefinitionVersionStartResult,
    { status: typeof DefinitionVersionStartStatus.NotFound }
  >,
): ProcessInstanceStartResult {
  switch (result.status) {
    case DefinitionVersionStartStatus.Started:
      return {
        status: ProcessInstanceStartStatus.Started,
        instance: {
          processInstanceId: result.instance.processInstanceId,
          definition: toPublicDefinition(result.instance.definition),
        },
      };
    case DefinitionVersionStartStatus.Rejected:
      return {
        status: ProcessInstanceStartStatus.Rejected,
        definition: toPublicDefinition(result.definition),
        failure: { ...result.failure },
      };
    default:
      return assertNever(result);
  }
}

function toPublicDeployment(
  result: DefinitionDeploymentResult,
  semanticProfile: string,
): DefinitionDeployResult {
  switch (result.status) {
    case DefinitionDeploymentStatus.Deployed:
      return {
        status: DefinitionDeployStatus.Deployed,
        definition: toPublicDefinition(result.definition),
      };
    case DefinitionDeploymentStatus.Rejected: {
      const [first, ...remainder] = result.diagnostics.map(toPublicDiagnostic);
      if (first === undefined) {
        throw new Error("rejected definition has no diagnostic");
      }
      return {
        status: DefinitionDeployStatus.Rejected,
        source: toPublicSource(result.source),
        semanticProfile,
        diagnostics: [first, ...remainder],
      };
    }
    default:
      return assertNever(result);
  }
}

function toPublicDefinition(
  definition: DefinitionMetadata,
): DeployedDefinitionVersion {
  return {
    processId: definition.processId,
    version: definition.version,
    source: toPublicSource(definition.source),
    semanticProfile: definition.semanticProfile,
  };
}

function toPublicSource(
  source: DefinitionSourceIdentity,
): ExactPublicSourceIdentity {
  return {
    kind: source.kind,
    id: source.id,
    sha256: source.sha256,
    byteLength: source.byteLength,
    declaredEncoding: source.declaredEncoding,
    decodedAs: source.decodedAs,
  };
}

function toPublicDiagnostic(
  diagnostic: DefinitionDiagnostic,
): AdmissionDiagnostic {
  return {
    code: diagnostic.code,
    element: diagnostic.element === null
      ? null
      : {
          id: diagnostic.element.id,
          type: diagnostic.element.type,
          containmentPath: diagnostic.element.containmentPath,
          subject: diagnostic.element.subject,
          requiredCapability: diagnostic.element.requiredCapability,
        },
    evidence: diagnostic.evidence,
  };
}

function requireNoQuery(request: Request, url: URL): void {
  if (url.search.length > 0 || request.url.includes("?")) {
    throw new HttpRequestFailure(
      400,
      PublicApiErrorCode.InvalidRequest,
      "This definition route does not accept query parameters.",
    );
  }
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

function methodNotAllowed(allow: string): Response {
  return errorResponse(
    405,
    PublicApiErrorCode.MethodNotAllowed,
    "The HTTP method is not allowed for this definition route.",
    { allow },
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition route value: ${String(value)}`);
}
