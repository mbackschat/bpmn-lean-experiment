import type {
  ExecutionPublicationRequest,
} from "./execution-publications.js";
import { PublicApiErrorCode } from "./definitions.js";
import type { PublicApiErrorResponse } from "./definitions.js";

const canonicalNonnegativeInteger = /^(?:0|[1-9][0-9]*)$/u;
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export const ExecutionPublicationUnavailableMessage =
  "The committed execution publication is unavailable." as const;

export const ExecutionPublicationApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.ExecutionPublicationUnavailable,
  PublicApiErrorCode.InternalFailure,
] as const;

export type ExecutionPublicationApiErrorCode =
  typeof ExecutionPublicationApiErrorCodes[number];
export type ExecutionPublicationApiErrorResponse =
  PublicApiErrorResponse<ExecutionPublicationApiErrorCode>;

export type ExecutionPublicationRouteRequest = Readonly<
  { processInstanceId: string } & ExecutionPublicationRequest
>;

/** Builds the exact cursor-paged execution publication route in canonical key order. */
export function executionPublicationPath(
  request: ExecutionPublicationRouteRequest,
): string {
  const processInstanceId = requireIdentifier(
    request.processInstanceId,
    "execution publication processInstanceId",
  );
  const afterRevision = requireNonnegative(
    request.afterRevision,
    "execution publication afterRevision",
  );
  const limit = request.limit === undefined
    ? undefined
    : requireLimit(request.limit);
  const path = `/api/v1/process-instances/${encodeURIComponent(processInstanceId)}/execution?afterRevision=${afterRevision}`;
  return limit === undefined ? path : `${path}&limit=${limit}`;
}

/** Builds the exact full canonical execution publication export route. */
export function executionPublicationExportPath(processInstanceId: string): string {
  return `/api/v1/process-instances/${encodeURIComponent(requireIdentifier(
    processInstanceId,
    "execution publication export processInstanceId",
  ))}/execution/export`;
}

export function matchExecutionPublicationPath(
  pathAndQuery: string,
): ExecutionPublicationRouteRequest | null {
  const { pathname, query } = split(pathAndQuery, "execution publication");
  const segments = pathname.split("/");
  if (!matchesBaseSegments(segments) || segments.length !== 6 || segments[5] !== "execution") {
    return null;
  }
  if (query === null || query.length === 0) {
    throw new TypeError("execution publication route requires afterRevision");
  }
  const fields = query.split("&");
  if (fields.length < 1 || fields.length > 2 ||
    !fields[0]?.startsWith("afterRevision=") ||
    (fields.length === 2 && !fields[1]?.startsWith("limit="))) {
    throw new TypeError("execution publication query must use exact canonical fields and order");
  }
  const afterRaw = exactQueryValue(fields[0]!, "afterRevision");
  const afterRevision = decodeCanonicalNonnegative(afterRaw, "afterRevision");
  const limit = fields.length === 2
    ? decodeCanonicalLimit(exactQueryValue(fields[1]!, "limit"))
    : undefined;
  return {
    processInstanceId: decodeIdentifier(segments[4], "execution publication processInstanceId"),
    afterRevision,
    ...(limit === undefined ? {} : { limit }),
  };
}

export function matchExecutionPublicationExportPath(
  pathAndQuery: string,
): string | null {
  const { pathname, query } = split(pathAndQuery, "execution publication export");
  const segments = pathname.split("/");
  if (!matchesBaseSegments(segments) || segments.length !== 7 ||
    segments[5] !== "execution" || segments[6] !== "export") {
    return null;
  }
  if (query !== null) {
    throw new TypeError("execution publication export route must not contain a query");
  }
  return decodeIdentifier(segments[4], "execution publication export processInstanceId");
}

/** Enforces that both public execution resources are bodyless GET requests. */
export function requireExecutionPublicationRequestBodyLength(
  method: string,
  decodedJsonByteLength: number,
): void {
  if (method !== "GET") {
    throw new TypeError("execution publication request method must be GET");
  }
  if (!Number.isSafeInteger(decodedJsonByteLength) || decodedJsonByteLength < 0) {
    throw new TypeError("execution publication request body length must be a nonnegative safe integer");
  }
  if (decodedJsonByteLength !== 0) {
    throw new TypeError("GET execution publication requests must not contain a body");
  }
}

function matchesBaseSegments(segments: string[]): boolean {
  return segments[0] === "" && segments[1] === "api" && segments[2] === "v1" &&
    segments[3] === "process-instances";
}

function split(pathAndQuery: string, label: string): Readonly<{
  pathname: string;
  query: string | null;
}> {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.isWellFormed()) {
    throw new TypeError(`${label} route must be a well-formed string`);
  }
  if (pathAndQuery.includes("#")) throw new TypeError(`${label} route must not contain a fragment`);
  const separator = pathAndQuery.indexOf("?");
  return separator === -1
    ? { pathname: pathAndQuery, query: null }
    : { pathname: pathAndQuery.slice(0, separator), query: pathAndQuery.slice(separator + 1) };
}

function exactQueryValue(field: string, expectedKey: string): string {
  const equals = field.indexOf("=");
  if (equals <= 0 || field.slice(0, equals) !== expectedKey || field.indexOf("=", equals + 1) !== -1) {
    throw new TypeError(`execution publication query ${expectedKey} is malformed or repeated`);
  }
  return field.slice(equals + 1);
}

function decodeCanonicalNonnegative(value: string, label: string): number {
  if (!canonicalNonnegativeInteger.test(value)) {
    throw new TypeError(`${label} must be a canonical nonnegative safe integer`);
  }
  return requireNonnegative(Number(value), label);
}

function decodeCanonicalLimit(value: string): number {
  if (!canonicalPositiveInteger.test(value)) {
    throw new TypeError("limit must be a canonical positive safe integer");
  }
  return requireLimit(Number(value));
}

function requireNonnegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function requireLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new TypeError("execution publication limit must be an integer from 1 through 100");
  }
  return value;
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function decodeIdentifier(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) throw new TypeError(`${label} must not be empty`);
  try {
    const decoded = requireIdentifier(decodeURIComponent(value), label);
    if (encodeURIComponent(decoded) !== value) {
      throw new TypeError(`${label} must use canonical URI encoding`);
    }
    return decoded;
  } catch (error) {
    throw new TypeError(`${label} has malformed URI encoding`, { cause: error });
  }
}
