import {
  decodePublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Produces the closed defensive public value used at every Operate boundary. */
export function snapshotProcessInstanceIdentity(
  value: unknown,
): PublicProcessInstanceIdentity {
  return decodePublicProcessInstanceIdentity(value);
}

/** Canonicalizes the closed public value into deterministic JSON key order. */
export function encodeProcessInstanceIdentity(
  value: unknown,
): string {
  return JSON.stringify(snapshotProcessInstanceIdentity(value));
}

/** Decodes only canonical JSON for the closed public Process-instance value. */
export function decodeStoredProcessInstanceIdentity(
  encoded: string,
): PublicProcessInstanceIdentity {
  const parsed: unknown = JSON.parse(encoded);
  const decoded = snapshotProcessInstanceIdentity(parsed);
  if (JSON.stringify(decoded) !== encoded) {
    throw new TypeError("stored Process-instance identity is not canonical JSON");
  }
  return decoded;
}

/** Encodes well-formed Unicode as bytea so PostgreSQL preserves U+0000 exactly. */
export function encodePostgresqlByteText(value: string): Buffer {
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError("PostgreSQL exact text must be well-formed Unicode");
  }
  return Buffer.from(value, "utf8");
}

/** Decodes an exact UTF-8 bytea field and optionally refuses the empty value. */
export function requirePostgresqlByteText(
  row: PostgresqlRow,
  field: string,
  nonempty = true,
): string {
  const value = row[field];
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  let decoded: string;
  try {
    decoded = utf8Decoder.decode(value);
  } catch (error: unknown) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`, {
      cause: error,
    });
  }
  if (!decoded.isWellFormed() || (nonempty && decoded.length === 0)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return decoded;
}

/** Rejects PostgreSQL bigint values that cannot cross the TypeScript boundary exactly. */
export function requirePostgresqlSafeInteger(
  row: PostgresqlRow,
  field: string,
  minimum = 0,
): number {
  const value = row[field];
  const decoded = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : typeof value === "bigint" ? Number(value) : value;
  if (
    typeof decoded !== "number" ||
    !Number.isSafeInteger(decoded) ||
    decoded < minimum
  ) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return decoded;
}

/** Requires a PostgreSQL text column without interpreting it as an identity. */
export function requirePostgresqlString(
  row: PostgresqlRow,
  field: string,
  nonempty = true,
): string {
  const value = row[field];
  if (
    typeof value !== "string" ||
    !value.isWellFormed() ||
    (nonempty && value.length === 0)
  ) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}
