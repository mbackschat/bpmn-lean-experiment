import {
  decodeIncidentAuditActionKind,
  decodeIncidentAuditRequest,
  decodeOpaqueIncidentAuditCursor,
} from "./incident-audit-decoders.js";
import type { IncidentAuditRequest } from "./incident-audit.js";

const incidentAuditBasePath = "/api/v1/incident-audit";
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export const IncidentAuditDefaultLimit = 50;

export type NormalizedIncidentAuditRequest = IncidentAuditRequest &
  Readonly<{ limit: number }>;

/** Builds the exact-filter incident audit route in canonical query-key order. */
export function incidentAuditPath(request: IncidentAuditRequest = {}): string {
  const decoded = decodeIncidentAuditRequest(request);
  let path = incidentAuditBasePath;
  path = appendOptionalString(path, "actorId", decoded.actorId);
  path = appendOptionalString(
    path,
    "hostingProcessInstanceId",
    decoded.hostingProcessInstanceId,
  );
  path = appendOptionalString(
    path,
    "incidentProcessInstanceId",
    decoded.incidentProcessInstanceId,
  );
  path = appendOptionalString(path, "incidentElementId", decoded.incidentElementId);
  path = appendOptionalNumber(path, "incidentActivation", decoded.incidentActivation);
  path = appendOptionalNumber(path, "incidentGeneration", decoded.incidentGeneration);
  path = appendOptionalString(path, "actionKind", decoded.actionKind);
  path = appendOptionalString(path, "cursor", decoded.cursor);
  return appendOptionalNumber(path, "limit", decoded.limit);
}

/** Matches audit search and normalizes an omitted limit to 50. */
export function matchIncidentAuditPath(
  pathAndQuery: string,
): NormalizedIncidentAuditRequest | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery);
  if (pathname !== incidentAuditBasePath) return null;
  if (query === null) return { limit: IncidentAuditDefaultLimit };
  if (query.length === 0) {
    throw new TypeError("incident audit query must not be empty");
  }
  const fields = parseUniqueQuery(query);
  const candidate: Record<string, string | number> = {};
  for (const [key, value] of fields) {
    switch (key) {
      case "actorId":
      case "hostingProcessInstanceId":
      case "incidentProcessInstanceId":
      case "incidentElementId":
        candidate[key] = value;
        break;
      case "incidentActivation":
        candidate.incidentActivation = decodeCanonicalPositiveInteger(
          value,
          "incident audit activation",
        );
        break;
      case "incidentGeneration":
        candidate.incidentGeneration = decodeCanonicalPositiveInteger(
          value,
          "incident audit generation",
        );
        break;
      case "actionKind":
        candidate.actionKind = decodeIncidentAuditActionKind(value);
        break;
      case "cursor":
        candidate.cursor = decodeOpaqueIncidentAuditCursor(value);
        break;
      case "limit":
        candidate.limit = decodeCanonicalPositiveInteger(
          value,
          "incident audit limit",
        );
        break;
      default:
        throw new TypeError(`incident audit query contains unknown field ${key}`);
    }
  }
  const decoded = decodeIncidentAuditRequest(candidate);
  return { ...decoded, limit: decoded.limit ?? IncidentAuditDefaultLimit };
}

function splitPathAndQuery(
  pathAndQuery: string,
): Readonly<{ pathname: string; query: string | null }> {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.isWellFormed()) {
    throw new TypeError("incident audit route must be a well-formed string");
  }
  if (pathAndQuery.includes("#")) {
    throw new TypeError("incident audit route must not contain a fragment");
  }
  const separator = pathAndQuery.indexOf("?");
  return separator === -1
    ? { pathname: pathAndQuery, query: null }
    : {
        pathname: pathAndQuery.slice(0, separator),
        query: pathAndQuery.slice(separator + 1),
      };
}

function parseUniqueQuery(query: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const pair of query.split("&")) {
    const equals = pair.indexOf("=");
    if (equals <= 0) {
      throw new TypeError("incident audit query fields require values");
    }
    const key = decodeQueryComponent(pair.slice(0, equals), "query key");
    if (fields.has(key)) {
      throw new TypeError(`incident audit query repeats ${key}`);
    }
    fields.set(
      key,
      decodeQueryComponent(pair.slice(equals + 1), `query ${key}`),
    );
  }
  return fields;
}

function decodeQueryComponent(raw: string, label: string): string {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    throw new TypeError(`incident audit ${label} has malformed URI encoding`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`incident audit ${label} must be well-formed Unicode`);
  }
  return value;
}

function decodeCanonicalPositiveInteger(value: string, label: string): number {
  if (!canonicalPositiveInteger.test(value)) {
    throw new TypeError(`${label} must be a canonical positive safe integer`);
  }
  const decoded = Number(value);
  if (!Number.isSafeInteger(decoded)) {
    throw new TypeError(`${label} must be a canonical positive safe integer`);
  }
  return decoded;
}

function appendOptionalString(
  path: string,
  key: string,
  value: string | undefined,
): string {
  return value === undefined ? path : appendQuery(path, key, encodeURIComponent(value));
}

function appendOptionalNumber(
  path: string,
  key: string,
  value: number | undefined,
): string {
  return value === undefined ? path : appendQuery(path, key, String(value));
}

function appendQuery(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;
}
