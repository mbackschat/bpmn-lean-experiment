const messageStartPublicationRoute =
  /^\/api\/v1\/message-start-publications\/([^/]*)$/u;

export type MessageStartPublicationPathMatch = Readonly<{
  publicationId: string;
}>;

/** Public endpoint for one global Message Start publication identity. */
export function messageStartPublicationPath(publicationId: string): string {
  requireWellFormedNonempty(publicationId, "publicationId");
  return `/api/v1/message-start-publications/${encodeURIComponent(publicationId)}`;
}

/** Matches only the exact global Message Start publication item route. */
export function matchMessageStartPublicationPath(
  pathname: string,
): MessageStartPublicationPathMatch | null {
  const match = messageStartPublicationRoute.exec(pathname);
  if (match === null) {
    return null;
  }
  return {
    publicationId: decodeSegment(match[1] ?? "", "publicationId"),
  };
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

function requireWellFormedNonempty(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
}
