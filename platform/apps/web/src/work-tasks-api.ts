import {
  WorkApiErrorCodes,
  decodePublicApiErrorResponse,
  decodePublicTaskDetail,
  decodeWorkAuditPage,
  decodeWorkClaimResult,
  decodeWorkCompletionRequest,
  decodeWorkCompletionResult,
  decodeWorkReleaseResult,
  decodeWorkTaskSnapshot,
  workAuditPath,
  workTaskClaimPath,
  workTaskCompletionPath,
  workTaskPath,
  workTaskReleasePath,
  workTasksPath,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicTaskDetail,
  PublicWorkTaskId,
  WorkApiErrorCode,
  WorkAuditPage,
  WorkAuditRequest,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkReleaseRequest,
  WorkReleaseResult,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";

export class WorkApiError extends Error {
  readonly status: number;
  readonly code: WorkApiErrorCode;

  constructor(
    status: number,
    code: WorkApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkApiError";
    this.status = status;
    this.code = code;
  }
}

export class WorkProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkProtocolError";
  }
}

/** Same-origin HTTP-only client for the complete public human-work contract. */
export class WorkApiClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Work API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  listTasks(): Promise<WorkTaskSnapshot> {
    return this.#get(workTasksPath(), decodeWorkTaskSnapshot, "Work task snapshot");
  }

  getTask(taskId: PublicWorkTaskId): Promise<PublicTaskDetail> {
    const expected = structuredClone(taskId);
    return this.#get(workTaskPath(expected), decodePublicTaskDetail, "Work task detail")
      .then((detail) => {
        requireTaskIdentity(detail.workTask.task.id, expected);
        return detail;
      });
  }

  async claim(taskId: PublicWorkTaskId, request: WorkClaimRequest): Promise<WorkClaimResult> {
    const expected = structuredClone(taskId);
    const response = await this.#json(workTaskClaimPath(expected), "PUT", request);
    if (response.status !== 200 && response.status !== 201) return this.#throwApiError(response);
    const result = await decodeJson(response, decodeWorkClaimResult, "Work claim result");
    requireTaskIdentity(result.taskId, expected);
    return result;
  }

  async release(taskId: PublicWorkTaskId, request: WorkReleaseRequest): Promise<WorkReleaseResult> {
    const expected = structuredClone(taskId);
    const response = await this.#fetch(this.#url(workTaskReleasePath(expected, request)), {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) return this.#throwApiError(response);
    const result = await decodeJson(response, decodeWorkReleaseResult, "Work release result");
    requireTaskIdentity(result.taskId, expected);
    return result;
  }

  async complete(actionId: string, request: WorkCompletionRequest): Promise<WorkCompletionResult> {
    const exact = decodeWorkCompletionRequest(structuredClone(request));
    const response = await this.#json(workTaskCompletionPath(actionId), "PUT", exact);
    if (response.status !== 200 && response.status !== 202) return this.#throwApiError(response);
    const result = await decodeJson(response, decodeWorkCompletionResult, "Work completion result");
    if (result.actionId !== actionId) {
      throw new WorkProtocolError("Work completion response action identity drifted");
    }
    requireTaskIdentity(result.taskId, exact.taskId);
    if ((response.status === 202) !== (result.state === "indeterminate")) {
      throw new WorkProtocolError("Work completion HTTP status disagrees with its result state");
    }
    return result;
  }

  readAudit(request: WorkAuditRequest = {}): Promise<WorkAuditPage> {
    return this.#get(workAuditPath(request), decodeWorkAuditPage, "Work audit page");
  }

  async #get<Result>(
    path: string,
    decoder: (value: unknown) => Result,
    label: string,
  ): Promise<Result> {
    const response = await this.#fetch(this.#url(path), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) return this.#throwApiError(response);
    return decodeJson(response, decoder, label);
  }

  #json(path: string, method: "PUT", body: unknown): Promise<Response> {
    return this.#fetch(this.#url(path), {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(structuredClone(body)),
    });
  }

  #url(path: string): URL {
    return new URL(path, this.#origin);
  }

  async #throwApiError(response: Response): Promise<never> {
    const decoded = await decodeJson(
      response,
      (value) => decodePublicApiErrorResponse(value, WorkApiErrorCodes),
      "Work API error",
    );
    throw new WorkApiError(response.status, decoded.error.code, decoded.error.message);
  }
}

async function decodeJson<Result>(
  response: Response,
  decoder: (value: unknown) => Result,
  label: string,
): Promise<Result> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new WorkProtocolError(`${label} has an unexpected media type`);
  }
  try {
    return decoder(await response.json() as unknown);
  } catch (cause: unknown) {
    if (cause instanceof WorkProtocolError) throw cause;
    throw new WorkProtocolError(`${label} violates the public contract`, { cause });
  }
}

function requireTaskIdentity(actual: PublicWorkTaskId, expected: PublicWorkTaskId): void {
  if (
    actual.processInstanceId !== expected.processInstanceId ||
    actual.elementId !== expected.elementId ||
    actual.activation !== expected.activation
  ) {
    throw new WorkProtocolError("Work response task identity drifted");
  }
}
