import {
  decodeWorkAuditPage,
  decodeWorkClaimResult,
  decodeWorkReleaseResult,
  decodeWorkTaskSnapshot,
  workAuditPath,
  workTaskClaimPath,
  workTaskCompletionPath,
  workTaskPath,
  workTaskReleasePath,
  workTasksPath,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicTaskDetail,
  PublicWorkTaskId,
  FormValidationIssue,
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
  readonly issues: readonly FormValidationIssue[];

  constructor(
    status: number,
    code: WorkApiErrorCode,
    message: string,
    issues: readonly FormValidationIssue[] = [],
  ) {
    super(message);
    this.name = "WorkApiError";
    this.status = status;
    this.code = code;
    this.issues = Object.freeze(structuredClone([...issues]));
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

  async getTask(taskId: PublicWorkTaskId): Promise<PublicTaskDetail> {
    const expected = structuredClone(taskId);
    const response = await this.#fetch(this.#url(workTaskPath(expected)), {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) return this.#throwApiError(response);
    const { decodePublicTaskDetail } = await import("@bpmn-lean/platform-contracts");
    const detail = await decodeJson(response, decodePublicTaskDetail, "Work task detail");
    requireTaskIdentity(detail.workTask.task.id, expected);
    return detail;
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
    const {
      decodeWorkCompletionRequest,
      decodeWorkCompletionResult,
    } = await import("@bpmn-lean/platform-contracts");
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
    const { decodeWorkApiErrorResponse } = await import("@bpmn-lean/platform-contracts");
    const decoded = await decodeJson(
      response,
      decodeWorkApiErrorResponse,
      "Work API error",
    );
    throw new WorkApiError(
      response.status,
      decoded.error.code,
      decoded.error.message,
      decoded.error.code === "formValidationFailed" ? decoded.error.issues : [],
    );
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    return decoder(parseStrictJson(bytes));
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
