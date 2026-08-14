import { PublicApiErrorCode } from "./definitions.js";
import type { PublicApiErrorResponse } from "./definitions.js";

const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export const FlowNodeMetricsUnavailableMessage =
  "Flow-node metrics are unavailable." as const;

export type FlowNodeMetricsApiErrorCode =
  | typeof PublicApiErrorCode.InvalidRequest
  | typeof PublicApiErrorCode.MethodNotAllowed
  | typeof PublicApiErrorCode.NotFound
  | typeof PublicApiErrorCode.Forbidden
  | typeof PublicApiErrorCode.FlowNodeMetricsUnavailable
  | typeof PublicApiErrorCode.InternalFailure;

export const FlowNodeMetricsApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.FlowNodeMetricsUnavailable,
  PublicApiErrorCode.InternalFailure,
] as const satisfies readonly FlowNodeMetricsApiErrorCode[];

export type FlowNodeMetricsApiErrorResponse =
  PublicApiErrorResponse<FlowNodeMetricsApiErrorCode>;

export type FlowNodeMetricsRouteIdentity = Readonly<{
  processId: string;
  version: number;
}>;

/** Builds the bodyless Operations read for one exact deployed definition version. */
export function flowNodeMetricsPath(processId: string, version: number): string {
  return `/api/v1/definitions/${encodeIdentifier(processId)}/versions/${requireVersion(version)}/flow-node-metrics`;
}

export function matchFlowNodeMetricsPath(
  pathAndQuery: string,
): FlowNodeMetricsRouteIdentity | null {
  const { pathname, query } = split(pathAndQuery);
  const segments = pathname.split("/");
  if (
    segments.length !== 8 ||
    segments[0] !== "" ||
    segments[1] !== "api" ||
    segments[2] !== "v1" ||
    segments[3] !== "definitions" ||
    segments[5] !== "versions" ||
    segments[7] !== "flow-node-metrics"
  ) {
    return null;
  }
  if (query !== null) {
    throw new TypeError("flow-node metrics route must not contain a query");
  }
  return {
    processId: decodeIdentifier(segments[4]),
    version: decodeVersion(segments[6]),
  };
}

/** Enforces the exact bodyless GET surface before authorization and aggregation. */
export function requireFlowNodeMetricsRequestBodyLength(
  method: string,
  decodedJsonByteLength: number,
): void {
  if (method !== "GET") {
    throw new TypeError("flow-node metrics request method must be GET");
  }
  if (!Number.isSafeInteger(decodedJsonByteLength) || decodedJsonByteLength < 0) {
    throw new TypeError("flow-node metrics request body length must be a nonnegative safe integer");
  }
  if (decodedJsonByteLength !== 0) {
    throw new TypeError("GET flow-node metrics requests must not contain a body");
  }
}

function split(pathAndQuery: string): Readonly<{
  pathname: string;
  query: string | null;
}> {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.isWellFormed()) {
    throw new TypeError("flow-node metrics route must be a well-formed string");
  }
  if (pathAndQuery.includes("#")) {
    throw new TypeError("flow-node metrics route must not contain a fragment");
  }
  const separator = pathAndQuery.indexOf("?");
  return separator === -1
    ? { pathname: pathAndQuery, query: null }
    : {
        pathname: pathAndQuery.slice(0, separator),
        query: pathAndQuery.slice(separator + 1),
      };
}

function encodeIdentifier(value: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError("flow-node metrics processId must be nonempty well-formed Unicode");
  }
  return encodeURIComponent(value);
}

function decodeIdentifier(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new TypeError("flow-node metrics processId must not be empty");
  }
  try {
    const decoded = decodeURIComponent(value);
    if (encodeIdentifier(decoded) !== value) {
      throw new TypeError("flow-node metrics processId must use canonical URI encoding");
    }
    return decoded;
  } catch (error) {
    throw new TypeError("flow-node metrics processId has malformed URI encoding", { cause: error });
  }
}

function requireVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("flow-node metrics version must be a positive safe integer");
  }
  return value;
}

function decodeVersion(value: string | undefined): number {
  if (value === undefined || !canonicalPositiveInteger.test(value)) {
    throw new TypeError("flow-node metrics version must be a canonical positive safe integer");
  }
  return requireVersion(Number(value));
}
