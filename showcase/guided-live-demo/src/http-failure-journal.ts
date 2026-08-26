import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";

export type HttpFailureRecord = Readonly<{
  kind: "http";
  method: string;
  path: string;
  status: number;
  publicErrorCode?: string;
}> | Readonly<{
  kind: "network";
  method: string;
  path: string;
  errorCode: string;
}>;

type ResponseFailureInput = Readonly<{
  method: string;
  url: string;
  status: number;
  body?: string;
}>;

type RequestFailureInput = Readonly<{
  method: string;
  url: string;
  errorText?: string;
}>;

const publicErrorCodes = new Set<string>(Object.values(PublicApiErrorCode));

/** Records a bounded, credential-safe endpoint journal for browser acceptance failures. */
export class HttpFailureJournal {
  readonly #maximumRecords: number;
  readonly #records: HttpFailureRecord[] = [];

  constructor(maximumRecords = 50) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1 || maximumRecords > 1_000) {
      throw new RangeError("HTTP failure journal maximumRecords must be between 1 and 1000");
    }
    this.#maximumRecords = maximumRecords;
  }

  recordResponse(input: ResponseFailureInput): void {
    if (this.#records.length >= this.#maximumRecords || input.status < 500) return;
    const publicErrorCode = decodePublicErrorCode(input.body);
    this.#records.push({
      kind: "http",
      method: safeMethod(input.method),
      path: safePath(input.url),
      status: safeStatus(input.status),
      ...(publicErrorCode === undefined ? {} : { publicErrorCode }),
    });
  }

  recordRequestFailure(input: RequestFailureInput): void {
    if (this.#records.length >= this.#maximumRecords) return;
    this.#records.push({
      kind: "network",
      method: safeMethod(input.method),
      path: safePath(input.url),
      errorCode: safeNetworkError(input.errorText),
    });
  }

  snapshot(): readonly HttpFailureRecord[] {
    return this.#records.map((record) => Object.freeze({ ...record }));
  }
}

function decodePublicErrorCode(body: string | undefined): string | undefined {
  if (body === undefined || body.length > 16_384) return undefined;
  try {
    const value = JSON.parse(body) as unknown;
    if (typeof value !== "object" || value === null) return undefined;
    const error = (value as { error?: unknown }).error;
    if (typeof error !== "object" || error === null) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && publicErrorCodes.has(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function safeMethod(value: string): string {
  return /^[A-Z]{1,16}$/u.test(value) ? value : "UNKNOWN";
}

function safePath(value: string): string {
  try {
    const path = new URL(value).pathname;
    return path.length <= 512 ? path : "/[path-too-long]";
  } catch {
    return "/[invalid-url]";
  }
}

function safeStatus(value: number): number {
  return Number.isSafeInteger(value) && value >= 500 && value <= 599 ? value : 500;
}

function safeNetworkError(value: string | undefined): string {
  return value !== undefined && /^net::ERR_[A-Z0-9_]{1,48}$/u.test(value)
    ? value
    : "requestFailed";
}
