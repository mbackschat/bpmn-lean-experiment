import {
  PublicApiErrorCode,
  StructuredWorkCompletionRequestBodyByteLimit,
  WorkMutationBodyByteLimit,
  decodePublicTaskDetail,
  decodeWorkApiErrorResponse,
  decodeWorkClaimRequest,
  decodeWorkClaimResult,
  decodeWorkCompletionRequest,
  decodeWorkCompletionResult,
  decodeWorkReleaseResult,
  decodeWorkTaskSnapshot,
  matchWorkAuditPath,
  matchWorkTaskClaimPath,
  matchWorkTaskCompletionPath,
  matchWorkTaskPath,
  matchWorkTaskReleasePath,
  matchWorkTasksPath,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicApiErrorResponse,
  FormValidationIssue,
  PublicTaskDetail,
  PublicWorkTaskId,
  WorkAuditPage,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkReleaseRequest,
  WorkReleaseResult,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";

import {
  WorkSnapshotUnavailableError,
} from "./work-service.js";
import { WorkAuditForbiddenError } from "./work-audit-service.js";

export { WorkSnapshotUnavailableError } from "./work-service.js";

type ClaimServiceResult =
  | Readonly<{ kind: "claimed" | "idempotent"; result: WorkClaimResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

type ReleaseServiceResult =
  | Readonly<{ kind: "released" | "idempotent"; result: WorkReleaseResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

type CompletionServiceResult =
  | WorkCompletionResult
  | Readonly<{ kind: "result"; result: WorkCompletionResult }>
  | Readonly<{ kind: "conflict" | "notFound" | "formValueIncompatible" }>
  | Readonly<{
      kind: "formValidationFailed";
      issues: readonly [FormValidationIssue, ...FormValidationIssue[]];
    }>;

type WorkTaskOperations = Readonly<{
  listTasks(): Promise<WorkTaskSnapshot>;
  getTaskDetail(taskId: PublicWorkTaskId): Promise<PublicTaskDetail | null>;
  claimTask(taskId: PublicWorkTaskId, request: WorkClaimRequest): Promise<ClaimServiceResult>;
  releaseTask(taskId: PublicWorkTaskId, request: WorkReleaseRequest): Promise<ReleaseServiceResult>;
  completeTask(actionId: string, request: WorkCompletionRequest): Promise<CompletionServiceResult>;
}>;

type WorkAuditOperations = Readonly<{
  search(request: ReturnType<typeof matchWorkAuditPath> & object): Promise<WorkAuditPage>;
}>;

type WorkHttpRoutesOptions = Readonly<{
  tasks: WorkTaskOperations;
  audit: WorkAuditOperations;
  outbox: Readonly<{ reconcileAll(): Promise<void> }>;
}>;

const RouteKind = {
  Audit: "audit",
  Claim: "claim",
  Completion: "completion",
  Detail: "detail",
  Release: "release",
  Tasks: "tasks",
} as const;

type MatchedRoute =
  | Readonly<{ kind: typeof RouteKind.Tasks }>
  | Readonly<{ kind: typeof RouteKind.Detail; taskId: PublicWorkTaskId }>
  | Readonly<{ kind: typeof RouteKind.Claim; taskId: PublicWorkTaskId }>
  | Readonly<{
      kind: typeof RouteKind.Release;
      taskId: PublicWorkTaskId;
      request: WorkReleaseRequest;
    }>
  | Readonly<{ kind: typeof RouteKind.Completion; actionId: string }>
  | Readonly<{
      kind: typeof RouteKind.Audit;
      request: NonNullable<ReturnType<typeof matchWorkAuditPath>>;
    }>;

/** Strict Fetch-compatible boundary for current Work, mutations, and self-audit. */
export class WorkHttpRoutes {
  constructor(private readonly options: WorkHttpRoutesOptions) {}

  async handle(request: Request): Promise<Response | null> {
    let route: MatchedRoute | null;
    try {
      route = matchRoute(request.url);
    } catch (error: unknown) {
      return error instanceof TypeError ? invalidRequest() : internalFailure();
    }
    if (route === null) return null;
    try {
      await this.options.outbox.reconcileAll();
      return await this.#dispatch(route, request);
    } catch (error: unknown) {
      if (error instanceof WorkHttpRequestError) {
        return errorResponse(error.status, error.code, error.message);
      }
      if (error instanceof TypeError) {
        return invalidRequest();
      }
      if (error instanceof WorkSnapshotUnavailableError) return snapshotUnavailable();
      if (error instanceof WorkAuditForbiddenError) return forbidden();
      return internalFailure();
    }
  }

  async #dispatch(route: MatchedRoute, request: Request): Promise<Response> {
    switch (route.kind) {
      case RouteKind.Tasks:
        if (request.method !== "GET") return methodNotAllowed("GET");
        await requireEmptyBody(request);
        return jsonResponse(200, decodeWorkTaskSnapshot(await this.options.tasks.listTasks()));
      case RouteKind.Detail:
        if (request.method !== "GET") return methodNotAllowed("GET");
        await requireEmptyBody(request);
        return this.#detail(route.taskId);
      case RouteKind.Claim:
        if (request.method !== "PUT") return methodNotAllowed("PUT");
        return this.#claim(route.taskId, await readJson(request, decodeWorkClaimRequest));
      case RouteKind.Release:
        if (request.method !== "DELETE") return methodNotAllowed("DELETE");
        await requireEmptyBody(request);
        return this.#release(route.taskId, route.request);
      case RouteKind.Completion:
        if (request.method !== "PUT") return methodNotAllowed("PUT");
        return this.#complete(
          route.actionId,
          await readCompletionJson(request),
        );
      case RouteKind.Audit:
        if (request.method !== "GET") return methodNotAllowed("GET");
        await requireEmptyBody(request);
        return jsonResponse(200, await this.options.audit.search(route.request));
    }
  }

  async #detail(taskId: PublicWorkTaskId): Promise<Response> {
    const detail = await this.options.tasks.getTaskDetail(taskId);
    return detail === null
      ? notFound()
      : jsonResponse(200, decodePublicTaskDetail(detail));
  }

  async #claim(taskId: PublicWorkTaskId, request: WorkClaimRequest): Promise<Response> {
    const result = await this.options.tasks.claimTask(taskId, request);
    switch (result.kind) {
      case "claimed":
        return jsonResponse(201, decodeWorkClaimResult(result.result));
      case "idempotent":
        return jsonResponse(200, decodeWorkClaimResult(result.result));
      case "conflict":
        return conflict();
      case "notFound":
        return notFound();
    }
  }

  async #release(taskId: PublicWorkTaskId, request: WorkReleaseRequest): Promise<Response> {
    const result = await this.options.tasks.releaseTask(taskId, request);
    switch (result.kind) {
      case "released":
      case "idempotent":
        return jsonResponse(200, decodeWorkReleaseResult(result.result));
      case "conflict":
        return conflict();
      case "notFound":
        return notFound();
    }
  }

  async #complete(actionId: string, request: WorkCompletionRequest): Promise<Response> {
    const serviceResult = await this.options.tasks.completeTask(actionId, request);
    if ("state" in serviceResult) return completionResponse(serviceResult);
    switch (serviceResult.kind) {
      case "result":
        return completionResponse(serviceResult.result);
      case "conflict":
        return conflict();
      case "notFound":
        return notFound();
      case "formValueIncompatible":
        return formValueIncompatible();
      case "formValidationFailed":
        return formValidationFailed(serviceResult.issues);
    }
  }
}

function matchRoute(requestUrl: string): MatchedRoute | null {
  const url = new URL(requestUrl);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const completion = matchWorkTaskCompletionPath(target);
  if (completion !== null) return { kind: RouteKind.Completion, actionId: completion };
  const audit = matchWorkAuditPath(target);
  if (audit !== null) return { kind: RouteKind.Audit, request: audit };
  if (url.search.length > 0) {
    const release = matchWorkTaskReleasePath(target);
    if (release !== null) return { kind: RouteKind.Release, ...release };
  } else {
    const claim = matchWorkTaskClaimPath(target);
    if (claim !== null) return { kind: RouteKind.Claim, taskId: claim };
  }
  const detail = matchWorkTaskPath(target);
  if (detail !== null) return { kind: RouteKind.Detail, taskId: detail };
  return matchWorkTasksPath(target) ? { kind: RouteKind.Tasks } : null;
}

async function readJson<Result>(
  request: Request,
  decoder: (value: unknown) => Result,
): Promise<Result> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw unsupportedMediaType();
  const bytes = await readBody(request, WorkMutationBodyByteLimit);
  if (bytes.byteLength === 0) throw invalidTransport();
  try {
    return decoder(parseStrictJson(bytes));
  } catch {
    throw invalidTransport();
  }
}

async function readCompletionJson(request: Request): Promise<WorkCompletionRequest> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw unsupportedMediaType();
  const bytes = await readBody(request, StructuredWorkCompletionRequestBodyByteLimit);
  if (bytes.byteLength === 0) throw invalidTransport();
  let decoded: WorkCompletionRequest;
  try {
    decoded = decodeWorkCompletionRequest(parseStrictJson(bytes));
  } catch {
    throw invalidTransport();
  }
  if (!("schemaVersion" in decoded) && bytes.byteLength > WorkMutationBodyByteLimit) {
    throw payloadTooLarge(WorkMutationBodyByteLimit);
  }
  return decoded;
}

async function requireEmptyBody(request: Request): Promise<void> {
  if (request.headers.get("content-type") !== null) throw invalidTransport();
  if ((await readBody(request, WorkMutationBodyByteLimit)).byteLength !== 0) throw invalidTransport();
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const claimed = request.headers.get("content-length");
  if (claimed !== null) {
    if (!/^[0-9]+$/u.test(claimed)) throw invalidTransport();
    const length = Number(claimed);
    if (!Number.isSafeInteger(length)) throw invalidTransport();
    if (length > limit) throw payloadTooLarge(limit);
  }
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.byteLength > limit - length) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge(limit);
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

function completionResponse(result: WorkCompletionResult): Response {
  const exact = decodeWorkCompletionResult(result);
  return jsonResponse(exact.state === "indeterminate" ? 202 : 200, exact);
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function invalidRequest(): Response {
  return errorResponse(400, PublicApiErrorCode.InvalidRequest, "The Work request is invalid.");
}

function notFound(): Response {
  return errorResponse(404, PublicApiErrorCode.NotFound, "The Work task was not found.");
}

function conflict(): Response {
  return errorResponse(409, PublicApiErrorCode.Conflict, "The Work action conflicts with current state.");
}

function formValueIncompatible(): Response {
  return errorResponse(422, PublicApiErrorCode.FormValueIncompatible, "The current form value is incompatible with its declared type.");
}

function formValidationFailed(
  issues: readonly [FormValidationIssue, ...FormValidationIssue[]],
): Response {
  return jsonResponse(422, decodeWorkApiErrorResponse({
    error: {
      code: PublicApiErrorCode.FormValidationFailed,
      message: "The structured Work form submission is invalid.",
      issues,
    },
  }));
}

function forbidden(): Response {
  return errorResponse(403, PublicApiErrorCode.Forbidden, "The requested Work audit actor is forbidden.");
}

function snapshotUnavailable(): Response {
  return errorResponse(503, PublicApiErrorCode.WorkSnapshotUnavailable, "The current Work snapshot is unavailable.");
}

function internalFailure(): Response {
  return errorResponse(500, PublicApiErrorCode.InternalFailure, "The Work request could not be completed.");
}

function methodNotAllowed(allow: string): Response {
  const response = errorResponse(405, PublicApiErrorCode.MethodNotAllowed, "The HTTP method is not allowed for this Work route.");
  response.headers.set("allow", allow);
  return response;
}

function errorResponse(status: number, code: string, message: string): Response {
  const body = { error: { code, message } } as PublicApiErrorResponse<string>;
  return jsonResponse(status, body);
}

class WorkHttpRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkHttpRequestError";
    this.status = status;
    this.code = code;
  }
}

function invalidTransport(): WorkHttpRequestError {
  return new WorkHttpRequestError(400, PublicApiErrorCode.InvalidRequest, "The Work request is invalid.");
}

function unsupportedMediaType(): WorkHttpRequestError {
  return new WorkHttpRequestError(415, PublicApiErrorCode.UnsupportedMediaType, "Work mutations require application/json.");
}

function payloadTooLarge(limit: number): WorkHttpRequestError {
  return new WorkHttpRequestError(
    413,
    PublicApiErrorCode.PayloadTooLarge,
    `The Work mutation body exceeds ${limit} bytes.`,
  );
}
