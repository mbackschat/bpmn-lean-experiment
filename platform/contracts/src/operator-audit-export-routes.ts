import { PublicApiErrorCode } from "./definitions.js";
import type { PublicApiErrorResponse } from "./definitions.js";

export const OperatorAuditUnavailableMessage =
  "The complete operator audit is unavailable." as const;

export const OperatorAuditApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.OperatorAuditUnavailable,
  PublicApiErrorCode.InternalFailure,
] as const;

export type OperatorAuditApiErrorCode =
  typeof OperatorAuditApiErrorCodes[number];
export type OperatorAuditApiErrorResponse =
  PublicApiErrorResponse<OperatorAuditApiErrorCode>;

/** Builds the exact bodyless operator-audit attachment route. */
export function operatorAuditExportPath(processInstanceId: string): string {
  return `/api/v1/process-instances/${encodeURIComponent(requireIdentifier(
    processInstanceId,
    "operator audit processInstanceId",
  ))}/operator-audit/export`;
}

/** Matches only the canonically encoded bodyless operator-audit attachment path. */
export function matchOperatorAuditExportPath(pathAndQuery: string): string | null {
  const { pathname, query } = split(pathAndQuery);
  const segments = pathname.split("/");
  if (!matchesBaseSegments(segments) || segments.length !== 7 ||
    segments[5] !== "operator-audit" || segments[6] !== "export") {
    return null;
  }
  if (query !== null) {
    throw new TypeError("operator audit export route must not contain a query");
  }
  return decodeIdentifier(segments[4]);
}

/** Enforces the exact bodyless GET request contract. */
export function requireOperatorAuditExportRequestBodyLength(
  method: string,
  decodedJsonByteLength: number,
): void {
  if (method !== "GET") {
    throw new TypeError("operator audit export request method must be GET");
  }
  if (!Number.isSafeInteger(decodedJsonByteLength) || decodedJsonByteLength < 0) {
    throw new TypeError("operator audit export request body length must be a nonnegative safe integer");
  }
  if (decodedJsonByteLength !== 0) {
    throw new TypeError("GET operator audit export requests must not contain a body");
  }
}

/** Produces the exact ASCII attachment filename selected for the v1 route. */
export function operatorAuditExportFilename(processInstanceId: string): string {
  if (typeof processInstanceId !== "string" || !processInstanceId.isWellFormed()) {
    throw new TypeError("operator audit filename identity must be well-formed Unicode");
  }
  const sanitized = processInstanceId
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .slice(0, 80);
  return `operator-audit-${sanitized.length === 0 ? "process-instance" : sanitized}.json`;
}

function matchesBaseSegments(segments: string[]): boolean {
  return segments[0] === "" && segments[1] === "api" && segments[2] === "v1" &&
    segments[3] === "process-instances";
}

function split(pathAndQuery: string): Readonly<{
  pathname: string;
  query: string | null;
}> {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.isWellFormed()) {
    throw new TypeError("operator audit export route must be a well-formed string");
  }
  if (pathAndQuery.includes("#")) {
    throw new TypeError("operator audit export route must not contain a fragment");
  }
  const separator = pathAndQuery.indexOf("?");
  return separator === -1
    ? { pathname: pathAndQuery, query: null }
    : { pathname: pathAndQuery.slice(0, separator), query: pathAndQuery.slice(separator + 1) };
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function decodeIdentifier(segment: string | undefined): string {
  if (segment === undefined || segment.length === 0) {
    throw new TypeError("operator audit processInstanceId must not be empty");
  }
  try {
    const decoded = requireIdentifier(
      decodeURIComponent(segment),
      "operator audit processInstanceId",
    );
    if (encodeURIComponent(decoded) !== segment) {
      throw new TypeError("operator audit processInstanceId must use canonical URI encoding");
    }
    return decoded;
  } catch (error) {
    throw new TypeError("operator audit processInstanceId has malformed URI encoding", { cause: error });
  }
}
