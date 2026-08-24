import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type { PublicApiErrorCode as PublicApiErrorCodeValue } from "@bpmn-lean/platform-contracts";

const deploymentMediaType = /^(?:application\/xml|text\/xml|application\/bpmn\+xml)(?:[ \t]*;[ \t]*[!#$%&'*+.^_`|~0-9A-Za-z-]+[ \t]*=[ \t]*(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+|"(?:[^"\\\r\n]|\\[\t -~])*"))*[ \t]*$/iu;
const contentLength = /^[0-9]+$/u;

export type DeploymentQuery = Readonly<{
  sourceId: string;
  semanticProfile: string;
}>;

export class HttpRequestFailure extends Error {
  readonly code: PublicApiErrorCodeValue;
  readonly status: number;

  constructor(
    status: number,
    code: PublicApiErrorCodeValue,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestFailure";
    this.code = code;
    this.status = status;
  }
}

export function requireDeploymentMediaType(headers: Headers): void {
  const value = headers.get("content-type");
  if (value === null || !deploymentMediaType.test(value)) {
    throw new HttpRequestFailure(
      415,
      PublicApiErrorCode.UnsupportedMediaType,
      "BPMN source must use an XML media type.",
    );
  }
}

export function parseDeploymentQuery(url: URL): DeploymentQuery {
  const rawQuery = rawQueryText(url);
  if (rawQuery.length === 0) {
    throw invalidRequest("sourceId and semanticProfile are required.");
  }
  const fields = new Map<string, string>();
  for (const rawField of rawQuery.split("&")) {
    const separator = rawField.indexOf("=");
    if (separator < 0) {
      throw invalidRequest("The deployment query is malformed.");
    }
    const key = decodeQueryComponent(rawField.slice(0, separator));
    const value = decodeQueryComponent(rawField.slice(separator + 1));
    if (
      (key !== "sourceId" && key !== "semanticProfile") ||
      fields.has(key)
    ) {
      throw invalidRequest("The deployment query has unknown or duplicate fields.");
    }
    requireWellFormedNonempty(value, key);
    fields.set(key, value);
  }
  const sourceId = fields.get("sourceId");
  const semanticProfile = fields.get("semanticProfile");
  if (sourceId === undefined || semanticProfile === undefined) {
    throw invalidRequest("sourceId and semanticProfile are required.");
  }
  return { sourceId, semanticProfile };
}

export function decodeProcessId(rawSegment: string): string {
  let processId: string;
  try {
    processId = decodeURIComponent(rawSegment);
  } catch {
    throw invalidRequest("The process identifier is malformed.");
  }
  requireWellFormedNonempty(processId, "processId");
  return processId;
}

export function parsePositiveVersion(rawVersion: string): number {
  if (!contentLength.test(rawVersion)) {
    throw invalidRequest("The definition version must be a positive safe integer.");
  }
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw invalidRequest("The definition version must be a positive safe integer.");
  }
  return version;
}

export async function readBoundedBody(
  request: Request,
  maxSourceBytes: number,
  messages: Readonly<{
    empty: string;
    tooLarge: string;
  }> = {
    empty: "The BPMN source body must not be empty.",
    tooLarge: "The BPMN source exceeds the configured byte limit.",
  },
): Promise<Uint8Array> {
  const claimedLength = parseClaimedLength(request.headers);
  if (claimedLength !== null && claimedLength > maxSourceBytes) {
    throw payloadTooLarge(messages.tooLarge);
  }
  if (request.body === null) {
    throw invalidRequest(messages.empty);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    const chunk = result.value;
    if (chunk.byteLength > maxSourceBytes - byteLength) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge(messages.tooLarge);
    }
    byteLength += chunk.byteLength;
    chunks.push(Uint8Array.from(chunk));
  }
  if (byteLength === 0) {
    throw invalidRequest(messages.empty);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function requireEmptyRequestBody(
  request: Request,
  subject: string,
): Promise<void> {
  if (request.headers.get("content-type") !== null) {
    throw invalidRequest(`${subject} does not accept a media type.`);
  }
  const claimedLength = parseClaimedLength(request.headers);
  if (claimedLength !== null && claimedLength !== 0) {
    throw invalidRequest(`${subject} does not accept a request body.`);
  }
  if (request.body === null) {
    return;
  }
  const reader = request.body.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) {
      return;
    }
    if (result.value.byteLength > 0) {
      await reader.cancel().catch(() => undefined);
      throw invalidRequest(`${subject} does not accept a request body.`);
    }
  }
}

function parseClaimedLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (value === null) {
    return null;
  }
  if (!contentLength.test(value)) {
    throw invalidRequest("Content-Length must be a nonnegative safe integer.");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw invalidRequest("Content-Length must be a nonnegative safe integer.");
  }
  return length;
}

function rawQueryText(url: URL): string {
  return url.search.startsWith("?") ? url.search.slice(1) : "";
}

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    throw invalidRequest("The deployment query is malformed.");
  }
}

function requireWellFormedNonempty(value: string, label: string): void {
  if (value.length === 0 || !value.isWellFormed()) {
    throw invalidRequest(`${label} must be nonempty well-formed Unicode.`);
  }
}

function invalidRequest(message: string): HttpRequestFailure {
  return new HttpRequestFailure(
    400,
    PublicApiErrorCode.InvalidRequest,
    message,
  );
}

function payloadTooLarge(message: string): HttpRequestFailure {
  return new HttpRequestFailure(
    413,
    PublicApiErrorCode.PayloadTooLarge,
    message,
  );
}
