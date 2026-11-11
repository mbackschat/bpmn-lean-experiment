import { definitionVersionsPath } from "./definition-routes.js";

const schedulesRoute =
  /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/schedules$/u;
const scheduleRoute =
  /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/schedules\/([^/]*)$/u;
const occurrencesRoute =
  /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/schedule-occurrences$/u;
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export type DefinitionSchedulesPathMatch = Readonly<{
  processId: string;
  version: number;
}>;

export type DefinitionSchedulePathMatch = Readonly<{
  processId: string;
  version: number;
  scheduleId: string;
}>;

/** Public collection endpoint for one exact definition version's schedules. */
export function definitionSchedulesPath(
  processId: string,
  version: number,
): string {
  return `${definitionVersionPath(processId, version)}/schedules`;
}

/** Public endpoint for one exact definition schedule identity. */
export function definitionSchedulePath(
  processId: string,
  version: number,
  scheduleId: string,
): string {
  requireWellFormedNonempty(scheduleId, "scheduleId");
  return `${definitionSchedulesPath(processId, version)}/${encodeURIComponent(scheduleId)}`;
}

/**
 * Public endpoint listing one exact definition version's Timer-start occurrences; the query names the first instant
 * (`from`, default now) and the count (`limit`).
 */
export function definitionScheduleOccurrencesPath(
  processId: string,
  version: number,
): string {
  return `${definitionVersionPath(processId, version)}/schedule-occurrences`;
}

/** Matches only the exact occurrence-listing route and decodes its identity. */
export function matchDefinitionScheduleOccurrencesPath(
  pathname: string,
): DefinitionSchedulesPathMatch | null {
  const match = occurrencesRoute.exec(pathname);
  if (match === null) {
    return null;
  }
  return {
    processId: decodeSegment(match[1] ?? "", "processId"),
    version: decodeVersionSegment(match[2] ?? ""),
  };
}

/** Matches only the exact schedule-collection route and decodes its identity. */
export function matchDefinitionSchedulesPath(
  pathname: string,
): DefinitionSchedulesPathMatch | null {
  const match = schedulesRoute.exec(pathname);
  if (match === null) {
    return null;
  }
  return {
    processId: decodeSegment(match[1] ?? "", "processId"),
    version: decodeVersionSegment(match[2] ?? ""),
  };
}

/** Matches only the exact schedule-item route and decodes its public identity. */
export function matchDefinitionSchedulePath(
  pathname: string,
): DefinitionSchedulePathMatch | null {
  const match = scheduleRoute.exec(pathname);
  if (match === null) {
    return null;
  }
  return {
    processId: decodeSegment(match[1] ?? "", "processId"),
    version: decodeVersionSegment(match[2] ?? ""),
    scheduleId: decodeSegment(match[3] ?? "", "scheduleId"),
  };
}

function definitionVersionPath(processId: string, version: number): string {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new RangeError("version must be a positive safe integer");
  }
  return `${definitionVersionsPath(processId)}/${version}`;
}

function decodeSegment(raw: string, label: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new TypeError(`${label} segment must be valid URI encoding`);
  }
  requireWellFormedNonempty(decoded, label);
  return decoded;
}

function decodeVersionSegment(raw: string): number {
  if (!canonicalPositiveInteger.test(raw)) {
    throw new TypeError("version segment must be a canonical positive safe integer");
  }
  const version = Number(raw);
  if (!Number.isSafeInteger(version)) {
    throw new TypeError("version segment must be a canonical positive safe integer");
  }
  return version;
}

function requireWellFormedNonempty(value: string, label: string): void {
  if (value.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
}
