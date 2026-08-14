import {
  decodeIncidentActionApiResponse,
  decodeIncidentActionRequest,
  decodeIncidentAuditApiResponse,
  decodeIncidentAuditRequest,
  decodeIncidentDetailApiResponse,
  decodeIncidentListApiResponse,
  incidentActionPath,
  incidentAuditPath,
  incidentDetailPath,
  incidentsPath,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentActionApiErrorCode,
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditApiErrorCode,
  IncidentAuditPage,
  IncidentAuditRequest,
  IncidentDetailApiErrorCode,
  IncidentListApiErrorCode,
  PublicEffectIncidentId,
  PublicIncident,
  PublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";

export type IncidentOperationsApi = Readonly<{
  listIncidents(): Promise<PublicIncidentSnapshot>;
  getIncident(incidentId: PublicEffectIncidentId): Promise<PublicIncident>;
  submitAction(
    actionId: string,
    request: IncidentActionRequest,
  ): Promise<IncidentActionResult>;
  readAudit(request?: IncidentAuditRequest): Promise<IncidentAuditPage>;
}>;

export class IncidentOperationsApiError extends Error {
  readonly status: number;
  readonly code:
    | IncidentActionApiErrorCode
    | IncidentAuditApiErrorCode
    | IncidentDetailApiErrorCode
    | IncidentListApiErrorCode;

  constructor(status: number, code: IncidentOperationsApiError["code"], message: string) {
    super(message);
    this.name = "IncidentOperationsApiError";
    this.status = status;
    this.code = code;
  }
}

export class IncidentOperationsProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IncidentOperationsProtocolError";
  }
}

/** Same-origin HTTP-only client for the complete strict incident-operations contract. */
export class IncidentOperationsApiClient implements IncidentOperationsApi {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string | URL, fetcher?: typeof fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Incident Operations API base URL must use HTTP or HTTPS");
    }
    this.#origin = url.origin;
    this.#fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async listIncidents(): Promise<PublicIncidentSnapshot> {
    const response = await this.#get(incidentsPath());
    const decoded = await decodeJson(
      response,
      decodeIncidentListApiResponse,
      "Incident collection response",
    );
    if (hasError(decoded)) {
      return throwExactApiError(response.status, decoded.error, listErrorStatus);
    }
    requireStatus(response.status, 200, "Incident collection");
    return decoded;
  }

  async getIncident(incidentId: PublicEffectIncidentId): Promise<PublicIncident> {
    const exactId = structuredClone(incidentId);
    const response = await this.#get(incidentDetailPath(exactId));
    const decoded = await decodeJson(
      response,
      decodeIncidentDetailApiResponse,
      "Incident detail response",
    );
    if (hasError(decoded)) {
      return throwExactApiError(response.status, decoded.error, detailErrorStatus);
    }
    requireStatus(response.status, 200, "Incident detail");
    requireIncidentIdentity(decoded.incident.id, exactId, "Incident detail response");
    return decoded;
  }

  async submitAction(
    actionId: string,
    request: IncidentActionRequest,
  ): Promise<IncidentActionResult> {
    const exact = decodeIncidentActionRequest(structuredClone(request));
    const response = await this.#fetch(this.#url(incidentActionPath(actionId)), {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(exact),
    });
    const decoded = await decodeJson(
      response,
      decodeIncidentActionApiResponse,
      "Incident action response",
    );
    if (hasError(decoded)) {
      return throwExactApiError(response.status, decoded.error, actionErrorStatus);
    }
    const expectedStatus = decoded.state === "indeterminate" ? 202 : 200;
    requireStatus(response.status, expectedStatus, "Incident action");
    if (decoded.actionId !== actionId) {
      throw new IncidentOperationsProtocolError(
        "Incident action response action identity drifted",
      );
    }
    requireInteraction(decoded.interaction, exact);
    return decoded;
  }

  async readAudit(request: IncidentAuditRequest = {}): Promise<IncidentAuditPage> {
    const exact = decodeIncidentAuditRequest(structuredClone(request));
    const response = await this.#get(incidentAuditPath(exact));
    const decoded = await decodeJson(
      response,
      decodeIncidentAuditApiResponse,
      "Incident audit response",
    );
    if (hasError(decoded)) {
      return throwExactApiError(response.status, decoded.error, auditErrorStatus);
    }
    requireStatus(response.status, 200, "Incident audit");
    return decoded;
  }

  #get(path: string): Promise<Response> {
    return this.#fetch(this.#url(path), {
      headers: { accept: "application/json" },
    });
  }

  #url(path: string): URL {
    return new URL(path, this.#origin);
  }
}

type ApiError = Readonly<{ code: string; message: string }>;
type ErrorStatus = Readonly<Record<string, number>>;

const listErrorStatus: ErrorStatus = {
  invalidRequest: 400,
  methodNotAllowed: 405,
  forbidden: 403,
  incidentSnapshotUnavailable: 503,
  internalFailure: 500,
};
const detailErrorStatus: ErrorStatus = { ...listErrorStatus, notFound: 404 };
const actionErrorStatus: ErrorStatus = {
  invalidRequest: 400,
  methodNotAllowed: 405,
  unsupportedMediaType: 415,
  payloadTooLarge: 413,
  conflict: 409,
  forbidden: 403,
  incidentSnapshotUnavailable: 503,
  internalFailure: 500,
};
const auditErrorStatus: ErrorStatus = {
  invalidRequest: 400,
  methodNotAllowed: 405,
  forbidden: 403,
  internalFailure: 500,
};

function hasError(value: unknown): value is Readonly<{ error: ApiError }> {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "error");
}

function throwExactApiError(
  status: number,
  error: ApiError,
  expectedStatuses: ErrorStatus,
): never {
  if (expectedStatuses[error.code] !== status) {
    throw new IncidentOperationsProtocolError(
      `Incident API status ${status} disagrees with error ${error.code}`,
    );
  }
  throw new IncidentOperationsApiError(status, error.code as IncidentOperationsApiError["code"], error.message);
}

function requireStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new IncidentOperationsProtocolError(
      `${label} HTTP status ${actual} must be ${expected}`,
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
    throw new IncidentOperationsProtocolError(`${label} has an unexpected media type`);
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return decoder(parseStrictJson(bytes));
  } catch (cause: unknown) {
    if (cause instanceof IncidentOperationsProtocolError) throw cause;
    throw new IncidentOperationsProtocolError(`${label} violates the public contract`, { cause });
  }
}

function requireInteraction(
  actual: IncidentActionRequest,
  expected: IncidentActionRequest,
): void {
  if (actual.kind !== expected.kind) {
    throw new IncidentOperationsProtocolError("Incident action response interaction drifted");
  }
  requireIncidentIdentity(actual.incidentId, expected.incidentId, "Incident action response");
  if (
    actual.kind === "cancelIncidentProcess" &&
    expected.kind === "cancelIncidentProcess" &&
    actual.processInstanceId !== expected.processInstanceId
  ) {
    throw new IncidentOperationsProtocolError("Incident action response Process identity drifted");
  }
}

function requireIncidentIdentity(
  actual: PublicEffectIncidentId,
  expected: PublicEffectIncidentId,
  label: string,
): void {
  if (
    actual.generation !== expected.generation ||
    actual.effectId.processInstanceId !== expected.effectId.processInstanceId ||
    actual.effectId.elementId !== expected.effectId.elementId ||
    actual.effectId.activation !== expected.effectId.activation
  ) {
    throw new IncidentOperationsProtocolError(`${label} incident identity drifted`);
  }
}
