import {
  decodeOpaqueProcessInstanceSearchCursor,
  decodeProcessInstanceSearchRequest,
} from "./process-instance-search-decoders.js";
import type { ProcessInstanceSearchRequest } from "./process-instance-search.js";

const processInstancesBasePath = "/api/v1/process-instances";
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;
const defaultLimit = 50;

type NormalizedProcessInstanceSearchRequest =
  ProcessInstanceSearchRequest & Readonly<{ limit: number }>;

/** Builds the only global Process-instance search collection route. */
export function processInstancesPath(
  request: ProcessInstanceSearchRequest = {},
): string {
  const decoded = decodeProcessInstanceSearchRequest(request);
  let path = processInstancesBasePath;
  path = appendOptionalString(path, "processInstanceId", decoded.processInstanceId);
  path = appendOptionalString(path, "processId", decoded.processId);
  path = appendOptionalNumber(path, "version", decoded.version);
  path = appendOptionalString(path, "sourceSha256", decoded.sourceSha256);
  path = appendOptionalString(path, "cursor", decoded.cursor);
  return appendOptionalNumber(path, "limit", decoded.limit);
}

/** Matches the exact global route and normalizes its omitted limit to 50. */
export function matchProcessInstancesPath(
  pathAndQuery: string,
): NormalizedProcessInstanceSearchRequest | null {
  const separator = pathAndQuery.indexOf("?");
  const pathname = separator === -1
    ? pathAndQuery
    : pathAndQuery.slice(0, separator);
  if (pathname !== processInstancesBasePath) {
    return null;
  }
  if (pathAndQuery.includes("#")) {
    throw new TypeError("process instance search route must not contain a fragment");
  }
  if (separator === -1) {
    return { limit: defaultLimit };
  }

  const query = pathAndQuery.slice(separator + 1);
  if (query.length === 0) {
    throw new TypeError("process instance search query must not be empty");
  }
  const parsed: Record<string, string | number> = {};
  const seen = new Set<string>();
  for (const pair of query.split("&")) {
    const equals = pair.indexOf("=");
    if (equals <= 0) {
      throw new TypeError("process instance search query fields require values");
    }
    const key = decodeQueryComponent(pair.slice(0, equals), "query key");
    if (seen.has(key)) {
      throw new TypeError(`process instance search query repeats ${key}`);
    }
    seen.add(key);
    const value = decodeQueryComponent(pair.slice(equals + 1), key);
    switch (key) {
      case "processInstanceId":
      case "processId":
      case "sourceSha256":
        parsed[key] = value;
        break;
      case "cursor":
        parsed.cursor = decodeOpaqueProcessInstanceSearchCursor(value);
        break;
      case "version":
      case "limit":
        parsed[key] = decodeCanonicalPositiveInteger(value, key);
        break;
      default:
        throw new TypeError(`process instance search query contains unknown field ${key}`);
    }
  }

  const decoded = decodeProcessInstanceSearchRequest(parsed);
  return {
    ...decoded,
    limit: decoded.limit ?? defaultLimit,
  };
}

function appendOptionalString(
  path: string,
  key: string,
  value: string | undefined,
): string {
  return value === undefined
    ? path
    : appendQueryField(path, key, encodeURIComponent(value));
}

function appendOptionalNumber(
  path: string,
  key: string,
  value: number | undefined,
): string {
  return value === undefined ? path : appendQueryField(path, key, String(value));
}

function appendQueryField(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${value}`;
}

function decodeQueryComponent(raw: string, label: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new TypeError(`process instance search ${label} has malformed URI encoding`);
  }
  if (!decoded.isWellFormed()) {
    throw new TypeError(`process instance search ${label} must be well-formed Unicode`);
  }
  return decoded;
}

function decodeCanonicalPositiveInteger(value: string, label: string): number {
  if (!canonicalPositiveInteger.test(value)) {
    throw new TypeError(
      `process instance search query ${label} must be a canonical positive safe integer`,
    );
  }
  const decoded = Number(value);
  if (!Number.isSafeInteger(decoded)) {
    throw new TypeError(
      `process instance search query ${label} must be a canonical positive safe integer`,
    );
  }
  return decoded;
}
