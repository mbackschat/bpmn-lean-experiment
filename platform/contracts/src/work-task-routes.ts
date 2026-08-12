import {
  decodeOpaqueWorkAuditCursor,
  decodePublicWorkTaskId,
} from "./work-task-decoders.js";
import type {
  PublicWorkTaskId,
  WorkAuditRequest,
  WorkReleaseRequest,
} from "./work-tasks.js";

const workTasksBasePath = "/api/v1/work-tasks";
const workTaskCompletionsBasePath = "/api/v1/work-task-completions";
const workAuditBasePath = "/api/v1/work-audit";
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;
const auditRequestFields = new Set([
  "actionKind",
  "actorId",
  "cursor",
  "hostingProcessInstanceId",
  "limit",
  "taskProcessInstanceId",
]);

export const WorkMutationBodyByteLimit = 4_096;
export const WorkAuditDefaultLimit = 50;

export type NormalizedWorkAuditRequest = WorkAuditRequest &
  Readonly<{ limit: number }>;

export type MatchedWorkReleaseRoute = Readonly<{
  taskId: PublicWorkTaskId;
  request: WorkReleaseRequest;
}>;

/** Public current-actor inbox route. */
export function workTasksPath(): string {
  return workTasksBasePath;
}

/** Public detail route for one complete engine-published occurrence. */
export function workTaskPath(taskId: PublicWorkTaskId): string {
  return workTaskBasePath(taskId);
}

/** Public idempotent claim route for one complete task occurrence. */
export function workTaskClaimPath(taskId: PublicWorkTaskId): string {
  return `${workTaskBasePath(taskId)}/claim`;
}

/** Public claimant-only release route with an exact action and claim generation. */
export function workTaskReleasePath(
  taskId: PublicWorkTaskId,
  request: WorkReleaseRequest,
): string {
  const decoded = decodeWorkReleaseRequest(request);
  return `${workTaskClaimPath(taskId)}?actionId=${encodeURIComponent(decoded.actionId)}&generation=${decoded.generation}`;
}

/** Public retry-safe completion route keyed by its content-bound command identity. */
export function workTaskCompletionPath(actionId: string): string {
  return `${workTaskCompletionsBasePath}/${encodeIdentifier(actionId, "actionId")}`;
}

/** Public exact-filter audit route in deterministic query-field order. */
export function workAuditPath(request: WorkAuditRequest = {}): string {
  const decoded = decodeWorkAuditRequest(request);
  let path = workAuditBasePath;
  path = appendOptionalString(path, "actorId", decoded.actorId);
  path = appendOptionalString(path, "taskProcessInstanceId", decoded.taskProcessInstanceId);
  path = appendOptionalString(path, "hostingProcessInstanceId", decoded.hostingProcessInstanceId);
  path = appendOptionalString(path, "actionKind", decoded.actionKind);
  path = appendOptionalString(path, "cursor", decoded.cursor);
  return appendOptionalNumber(path, "limit", decoded.limit);
}

/** Matches the exact inbox collection and rejects query or fragment drift. */
export function matchWorkTasksPath(pathAndQuery: string): boolean {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work task collection");
  if (pathname !== workTasksBasePath) {
    return false;
  }
  requireNoQuery(query, "Work task collection");
  return true;
}

/** Matches one exact task detail route. */
export function matchWorkTaskPath(pathAndQuery: string): PublicWorkTaskId | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work task detail");
  const taskId = matchTaskBasePath(pathname);
  if (taskId === null) {
    return null;
  }
  requireNoQuery(query, "Work task detail");
  return taskId;
}

/** Matches one exact task claim route. */
export function matchWorkTaskClaimPath(pathAndQuery: string): PublicWorkTaskId | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work task claim");
  const taskId = matchTaskClaimPath(pathname);
  if (taskId === null) {
    return null;
  }
  requireNoQuery(query, "Work task claim");
  return taskId;
}

/** Matches claimant-only release and rejects unknown, missing, or duplicate query fields. */
export function matchWorkTaskReleasePath(
  pathAndQuery: string,
): MatchedWorkReleaseRoute | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work task release");
  const taskId = matchTaskClaimPath(pathname);
  if (taskId === null) {
    return null;
  }
  if (query === null || query.length === 0) {
    throw new TypeError("Work task release query must contain actionId and generation");
  }
  const fields = parseUniqueQuery(query, "Work task release");
  if (fields.size !== 2 || !fields.has("actionId") || !fields.has("generation")) {
    throw new TypeError("Work task release query must contain exactly actionId and generation");
  }
  return {
    taskId,
    request: decodeWorkReleaseRequest({
      actionId: fields.get("actionId"),
      generation: decodeCanonicalPositiveInteger(
        fields.get("generation"),
        "Work task release generation",
      ),
    }),
  };
}

/** Matches one exact completion action and decodes its percent-encoded identity. */
export function matchWorkTaskCompletionPath(pathAndQuery: string): string | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work task completion");
  const segments = pathname.split("/");
  if (
    segments.length !== 5 ||
    segments[0] !== "" ||
    segments[1] !== "api" ||
    segments[2] !== "v1" ||
    segments[3] !== "work-task-completions"
  ) {
    return null;
  }
  requireNoQuery(query, "Work task completion");
  return decodePathIdentifier(segments[4], "completion actionId");
}

/** Matches audit search and normalizes its omitted limit to 50. */
export function matchWorkAuditPath(
  pathAndQuery: string,
): NormalizedWorkAuditRequest | null {
  const { pathname, query } = splitPathAndQuery(pathAndQuery, "Work audit");
  if (pathname !== workAuditBasePath) {
    return null;
  }
  if (query === null) {
    return { limit: WorkAuditDefaultLimit };
  }
  if (query.length === 0) {
    throw new TypeError("Work audit query must not be empty");
  }
  const fields = parseUniqueQuery(query, "Work audit");
  const candidate: Record<string, string | number> = {};
  for (const [key, value] of fields) {
    switch (key) {
      case "actorId":
      case "taskProcessInstanceId":
      case "hostingProcessInstanceId":
      case "actionKind":
        candidate[key] = value;
        break;
      case "cursor":
        candidate.cursor = decodeOpaqueWorkAuditCursor(value);
        break;
      case "limit":
        candidate.limit = decodeCanonicalPositiveInteger(value, "Work audit limit");
        break;
      default:
        throw new TypeError(`Work audit query contains unknown field ${key}`);
    }
  }
  const decoded = decodeWorkAuditRequest(candidate);
  return { ...decoded, limit: decoded.limit ?? WorkAuditDefaultLimit };
}

/** Decodes the closed optional audit filter request without adding defaults. */
export function decodeWorkAuditRequest(value: unknown): WorkAuditRequest {
  requirePlainObject(value, "Work audit request");
  requireKnownKeys(value, auditRequestFields, "Work audit request");
  return {
    ...(Object.hasOwn(value, "actorId")
      ? { actorId: requireNonemptyString(value.actorId, "Work audit request.actorId") }
      : {}),
    ...(Object.hasOwn(value, "taskProcessInstanceId")
      ? {
          taskProcessInstanceId: requireNonemptyString(
            value.taskProcessInstanceId,
            "Work audit request.taskProcessInstanceId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "hostingProcessInstanceId")
      ? {
          hostingProcessInstanceId: requireNonemptyString(
            value.hostingProcessInstanceId,
            "Work audit request.hostingProcessInstanceId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "actionKind")
      ? { actionKind: decodeAuditActionKind(value.actionKind) }
      : {}),
    ...(Object.hasOwn(value, "cursor")
      ? { cursor: decodeOpaqueWorkAuditCursor(value.cursor) }
      : {}),
    ...(Object.hasOwn(value, "limit")
      ? { limit: decodeAuditLimit(value.limit) }
      : {}),
  };
}

/** Decodes the release query contract independently of any actor context. */
export function decodeWorkReleaseRequest(value: unknown): WorkReleaseRequest {
  requirePlainObject(value, "Work release request");
  requireExactObjectKeys(value, ["actionId", "generation"], "Work release request");
  return {
    actionId: requireNonemptyString(value.actionId, "Work release request.actionId"),
    generation: requirePositiveSafeInteger(value.generation, "Work release request.generation"),
  };
}

/** Enforces bodyless reads/deletes and the exact decoded JSON mutation ceiling. */
export function requireWorkRequestBodyLength(
  method: string,
  decodedJsonByteLength: number,
): void {
  if (!Number.isSafeInteger(decodedJsonByteLength) || decodedJsonByteLength < 0) {
    throw new TypeError("Work request body length must be a nonnegative safe integer");
  }
  switch (method) {
    case "GET":
    case "DELETE":
      if (decodedJsonByteLength !== 0) {
        throw new TypeError(`${method} Work requests must not contain a body`);
      }
      return;
    case "PUT":
      if (decodedJsonByteLength === 0) {
        throw new TypeError("PUT Work requests must contain one JSON body");
      }
      if (decodedJsonByteLength > WorkMutationBodyByteLimit) {
        throw new RangeError("Work mutation body exceeds 4096 decoded JSON bytes");
      }
      return;
    default:
      throw new TypeError("Work request method must be GET, DELETE, or PUT");
  }
}

function workTaskBasePath(taskId: PublicWorkTaskId): string {
  const decoded = decodePublicWorkTaskId(taskId, "Work task route identity");
  return `${workTasksBasePath}/${encodeURIComponent(decoded.processInstanceId)}/${encodeURIComponent(decoded.elementId)}/${decoded.activation}`;
}

function matchTaskBasePath(pathname: string): PublicWorkTaskId | null {
  const segments = pathname.split("/");
  if (!hasTaskRoutePrefix(segments) || segments.length !== 7) {
    return null;
  }
  return decodePublicWorkTaskId({
    processInstanceId: decodePathIdentifier(segments[4], "task processInstanceId"),
    elementId: decodePathIdentifier(segments[5], "task elementId"),
    activation: decodeCanonicalPositiveInteger(segments[6], "task activation"),
  }, "Work task route identity");
}

function matchTaskClaimPath(pathname: string): PublicWorkTaskId | null {
  const segments = pathname.split("/");
  if (!hasTaskRoutePrefix(segments) || segments.length !== 8 || segments[7] !== "claim") {
    return null;
  }
  return decodePublicWorkTaskId({
    processInstanceId: decodePathIdentifier(segments[4], "task processInstanceId"),
    elementId: decodePathIdentifier(segments[5], "task elementId"),
    activation: decodeCanonicalPositiveInteger(segments[6], "task activation"),
  }, "Work task route identity");
}

function hasTaskRoutePrefix(segments: readonly string[]): boolean {
  return segments[0] === "" &&
    segments[1] === "api" &&
    segments[2] === "v1" &&
    segments[3] === "work-tasks";
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

function parseUniqueQuery(query: string, label: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const pair of query.split("&")) {
    const equals = pair.indexOf("=");
    if (equals <= 0) {
      throw new TypeError(`${label} query fields require values`);
    }
    const key = decodeQueryComponent(pair.slice(0, equals), `${label} query key`);
    if (fields.has(key)) {
      throw new TypeError(`${label} query repeats ${key}`);
    }
    fields.set(key, decodeQueryComponent(pair.slice(equals + 1), `${label} query ${key}`));
  }
  return fields;
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
  return requireNonemptyString(value, label);
}

function decodeQueryComponent(raw: string, label: string): string {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    throw new TypeError(`${label} has malformed URI encoding`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
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
  return encodeURIComponent(requireNonemptyString(value, label));
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

function requireNoQuery(query: string | null, label: string): void {
  if (query !== null) {
    throw new TypeError(`${label} route must not contain a query`);
  }
}

function decodeAuditActionKind(
  value: unknown,
): "claim" | "release" | "completion" {
  switch (value) {
    case "claim":
    case "release":
    case "completion":
      return value;
    default:
      throw new TypeError("Work audit request.actionKind is not public");
  }
}

function decodeAuditLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new TypeError("Work audit request.limit must be an integer from 1 through 100");
  }
  return value;
}

function requirePlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireKnownKeys(
  value: object,
  keys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.has(key)) {
      throw new TypeError(`${label} contains an unknown field`);
    }
  }
}

function requireExactObjectKeys(
  value: object,
  keys: readonly string[],
  label: string,
): void {
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(`${label} must contain exactly its public fields`);
  }
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}
