const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeAuditText(value: unknown, label: string): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return Buffer.from(value, "utf8");
}

export function decodeAuditText(value: unknown, label: string): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError(`${label} must be nonempty bytea`);
  }
  const decoded = utf8Decoder.decode(value);
  if (!decoded.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed UTF-8`);
  }
  return decoded;
}

export function decodeAuditInteger(
  value: unknown,
  label: string,
  minimum = 0,
): number {
  const decoded = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : value;
  if (
    typeof decoded !== "number" ||
    !Number.isSafeInteger(decoded) ||
    decoded < minimum
  ) {
    throw new TypeError(`${label} must be a safe integer at least ${minimum}`);
  }
  return decoded;
}

export function requireAuditOrdinal(value: unknown, label: string): number {
  return decodeAuditInteger(value, label, 1);
}

export function requireAuditLimits(limits: Readonly<{
  maxEvents: number;
  maxStoredBytes: number;
}>): void {
  requireAuditOrdinal(limits.maxEvents, "maxEvents");
  requireAuditOrdinal(limits.maxStoredBytes, "maxStoredBytes");
}

export function equalAuditBytes(left: unknown, right: Buffer): boolean {
  return left instanceof Uint8Array && Buffer.from(left).equals(right);
}
