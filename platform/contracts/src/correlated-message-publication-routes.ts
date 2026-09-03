import { definitionVersionsPath } from "./definition-routes.js";

const correlatedMessagesRoute =
  /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/correlated-messages$/u;
const correlatedMessagePublicationRoute =
  /^\/api\/v1\/definitions\/([^/]*)\/versions\/([^/]*)\/correlated-messages\/([^/]*)\/publications\/([^/]*)$/u;
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

export type DefinitionCorrelatedMessagesPathMatch = Readonly<{
  processId: string;
  version: number;
}>;

export type DefinitionCorrelatedMessagePublicationPathMatch = Readonly<{
  processId: string;
  version: number;
  catchEventId: string;
  commandId: string;
}>;

/** Public capability endpoint for one exact definition version. */
export function definitionCorrelatedMessagesPath(
  processId: string,
  version: number,
): string {
  return `${definitionVersionPath(processId, version)}/correlated-messages`;
}

/** Public command endpoint for one definition-scoped correlated Message capability. */
export function definitionCorrelatedMessagePublicationPath(
  processId: string,
  version: number,
  catchEventId: string,
  commandId: string,
): string {
  requireWellFormedNonempty(catchEventId, "catchEventId");
  requireWellFormedNonempty(commandId, "commandId");
  return `${definitionCorrelatedMessagesPath(processId, version)}/${
    encodeURIComponent(catchEventId)
  }/publications/${encodeURIComponent(commandId)}`;
}

/** Matches only the exact definition-scoped capability route. */
export function matchDefinitionCorrelatedMessagesPath(
  pathname: string,
): DefinitionCorrelatedMessagesPathMatch | null {
  const match = correlatedMessagesRoute.exec(pathname);
  return match === null
    ? null
    : {
        processId: decodeSegment(match[1] ?? "", "processId"),
        version: decodeVersionSegment(match[2] ?? ""),
      };
}

/** Matches only the exact route-selected correlated Message publication command. */
export function matchDefinitionCorrelatedMessagePublicationPath(
  pathname: string,
): DefinitionCorrelatedMessagePublicationPathMatch | null {
  const match = correlatedMessagePublicationRoute.exec(pathname);
  return match === null
    ? null
    : {
        processId: decodeSegment(match[1] ?? "", "processId"),
        version: decodeVersionSegment(match[2] ?? ""),
        catchEventId: decodeSegment(match[3] ?? "", "catchEventId"),
        commandId: decodeSegment(match[4] ?? "", "commandId"),
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
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
}
