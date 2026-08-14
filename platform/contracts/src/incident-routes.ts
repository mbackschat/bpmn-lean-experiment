import {
  decodePublicEffectIncidentId,
} from "./incident-decoders.js";
import type { PublicEffectIncidentId } from "./incidents.js";

const incidentsBasePath = "/api/v1/incidents";
const incidentActionsBasePath = "/api/v1/incident-actions";
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export const IncidentMutationBodyByteLimit = 4_096;

/** Public complete current-incident collection route. */
export function incidentsPath(): string {
  return incidentsBasePath;
}

/** Public detail route for one complete generation-1 incident identity. */
export function incidentDetailPath(incidentId: PublicEffectIncidentId): string {
  const decoded = decodePublicEffectIncidentId(incidentId, "incident detail identity");
  return `${incidentsBasePath}/${encodeURIComponent(decoded.effectId.processInstanceId)}/${encodeURIComponent(decoded.effectId.elementId)}/${decoded.effectId.activation}/generations/${decoded.generation}`;
}

/** Retry-safe action resource keyed by its caller-generated command identity. */
export function incidentActionPath(actionId: string): string {
  return `${incidentActionsBasePath}/${encodeIdentifier(actionId, "actionId")}`;
}

export function matchIncidentsPath(pathAndQuery: string): boolean {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "incident collection");
  if (pathname !== incidentsBasePath) return false;
  requireNoQuery(query, "incident collection");
  return true;
}

export function matchIncidentDetailPath(
  pathAndQuery: string,
): PublicEffectIncidentId | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "incident detail");
  const segments = pathname.split("/");
  if (
    segments.length !== 9 ||
    segments[0] !== "" ||
    segments[1] !== "api" ||
    segments[2] !== "v1" ||
    segments[3] !== "incidents" ||
    segments[7] !== "generations"
  ) {
    return null;
  }
  requireNoQuery(query, "incident detail");
  return decodePublicEffectIncidentId({
    effectId: {
      processInstanceId: decodePathIdentifier(
        segments[4],
        "incident processInstanceId",
      ),
      elementId: decodePathIdentifier(segments[5], "incident elementId"),
      activation: decodeCanonicalPositiveInteger(
        segments[6],
        "incident activation",
      ),
    },
    generation: decodeCanonicalPositiveInteger(
      segments[8],
      "incident generation",
    ),
  }, "incident detail identity");
}

export function matchIncidentActionPath(pathAndQuery: string): string | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "incident action");
  const segments = pathname.split("/");
  if (
    segments.length !== 5 ||
    segments[0] !== "" ||
    segments[1] !== "api" ||
    segments[2] !== "v1" ||
    segments[3] !== "incident-actions"
  ) {
    return null;
  }
  requireNoQuery(query, "incident action");
  return decodePathIdentifier(segments[4], "incident actionId");
}

/** Enforces bodyless reads and the exact decoded JSON action ceiling. */
export function requireIncidentRequestBodyLength(
  method: string,
  decodedJsonByteLength: number,
): void {
  if (!Number.isSafeInteger(decodedJsonByteLength) || decodedJsonByteLength < 0) {
    throw new TypeError("incident request body length must be a nonnegative safe integer");
  }
  switch (method) {
    case "GET":
      if (decodedJsonByteLength !== 0) {
        throw new TypeError("GET incident requests must not contain a body");
      }
      return;
    case "PUT":
      if (decodedJsonByteLength === 0) {
        throw new TypeError("PUT incident requests must contain one JSON body");
      }
      if (decodedJsonByteLength > IncidentMutationBodyByteLimit) {
        throw new RangeError("incident action body exceeds 4096 decoded JSON bytes");
      }
      return;
    default:
      throw new TypeError("incident request method must be GET or PUT");
  }
}

function splitPathAndQuery(
  pathAndQuery: string,
  label: string,
): Readonly<{ pathname: string; query: string | null }> {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.isWellFormed()) {
    throw new TypeError(`${label} route must be a well-formed string`);
  }
  if (pathAndQuery.includes("#")) {
    throw new TypeError(`${label} route must not contain a fragment`);
  }
  const separator = pathAndQuery.indexOf("?");
  return separator === -1
    ? { pathname: pathAndQuery, query: null }
    : {
        pathname: pathAndQuery.slice(0, separator),
        query: pathAndQuery.slice(separator + 1),
      };
}

function decodePathIdentifier(raw: string | undefined, label: string): string {
  if (raw === undefined || raw.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    throw new TypeError(`${label} has malformed URI encoding`);
  }
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function decodeCanonicalPositiveInteger(
  value: string | undefined,
  label: string,
): number {
  if (value === undefined || !canonicalPositiveInteger.test(value)) {
    throw new TypeError(`${label} must be a canonical positive safe integer`);
  }
  const decoded = Number(value);
  if (!Number.isSafeInteger(decoded)) {
    throw new TypeError(`${label} must be a canonical positive safe integer`);
  }
  return decoded;
}

function encodeIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return encodeURIComponent(value);
}

function requireNoQuery(query: string | null, label: string): void {
  if (query !== null) throw new TypeError(`${label} route must not contain a query`);
}
