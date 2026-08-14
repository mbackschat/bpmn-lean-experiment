const cursorPattern = /^v1\.[A-Za-z0-9_-]+$/u;
const canonicalPositiveInteger = /^[1-9][0-9]*$/u;

/** Encodes one private insertion ordinal as the canonical opaque public cursor. */
export function encodeIncidentAuditCursor(ordinal: number): string {
  requirePositiveSafeInteger(ordinal, "incident audit cursor ordinal");
  return `v1.${Buffer.from(String(ordinal), "utf8").toString("base64url")}`;
}

/** Decodes only the canonical v1 cursor representation. */
export function decodeIncidentAuditCursor(cursor: string): number {
  if (!cursorPattern.test(cursor)) {
    throw new TypeError(
      "incident audit cursor must be a nonempty unpadded v1 base64url cursor",
    );
  }
  const encoded = cursor.slice(3);
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  if (
    Buffer.from(decoded, "utf8").toString("base64url") !== encoded ||
    !canonicalPositiveInteger.test(decoded)
  ) {
    throw new TypeError("incident audit cursor payload is invalid");
  }
  const ordinal = Number(decoded);
  requirePositiveSafeInteger(ordinal, "incident audit cursor ordinal");
  return ordinal;
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}
