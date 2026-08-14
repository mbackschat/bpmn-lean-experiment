import { decodeExecutionPublicationExport } from "./execution-publication-decoders.js";
import type {
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
} from "./execution-publications.js";
import { parseStrictJson } from "./strict-json.js";

type TextEncoderConstructor = new () => Readonly<{
  encode(input?: string): Uint8Array;
}>;

const RuntimeTextEncoder = (
  globalThis as typeof globalThis & Readonly<{ TextEncoder: TextEncoderConstructor }>
).TextEncoder;

/** Canonicalizes one already decoded publication value for stable overlap comparison. */
export function serializeCanonicalExecutionPublicationValue(
  value: unknown,
): Uint8Array {
  return new RuntimeTextEncoder().encode(canonicalJson(value));
}

/** Validates and emits the selected exact UTF-8 execution export representation. */
export function serializeExecutionPublicationExport(
  value: unknown,
  identity: ExecutionPublicationIdentity,
): Uint8Array {
  const publication = decodeExecutionPublicationExport(value, identity);
  return serializeCanonicalExecutionPublicationValue(publication);
}

/** Accepts only strict JSON bytes that already equal the canonical export bytes. */
export function decodeCanonicalExecutionPublicationExport(
  bytes: Uint8Array,
  identity: ExecutionPublicationIdentity,
): ExecutionPublicationExport {
  try {
    const parsed = parseStrictJson(bytes);
    const publication = decodeExecutionPublicationExport(parsed, identity);
    const canonical = serializeCanonicalExecutionPublicationValue(publication);
    if (!sameBytes(bytes, canonical)) throw new TypeError("noncanonical bytes");
    return publication;
  } catch (error) {
    throw new TypeError("malformed canonical execution publication export", { cause: error });
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON requires a safe integer");
      return String(value);
    case "string":
      return canonicalString(value);
    case "object":
      if (Array.isArray(value)) return `[${commaSeparated(value, canonicalJson)}]`;
      if (value !== undefined && (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null)) {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort(compareScalarStrings);
        return `{${commaSeparated(keys, (key) =>
          `${canonicalString(key)}:${canonicalJson(record[key])}`)}}`;
      }
      throw new TypeError("canonical JSON requires a plain object");
    default:
      throw new TypeError("canonical JSON rejects unsupported values");
  }
}

function commaSeparated<T>(
  values: readonly T[],
  render: (value: T) => string,
): string {
  let result = "";
  values.forEach((value, index) => {
    if (index > 0) result += ",";
    result += render(value);
  });
  return result;
}

function canonicalString(value: string): string {
  if (!value.isWellFormed()) throw new TypeError("canonical JSON strings require Unicode scalar values");
  let result = '"';
  for (const scalar of value) {
    const point = scalar.codePointAt(0)!;
    switch (point) {
      case 0x08: result += "\\b"; break;
      case 0x09: result += "\\t"; break;
      case 0x0a: result += "\\n"; break;
      case 0x0c: result += "\\f"; break;
      case 0x0d: result += "\\r"; break;
      case 0x22: result += '\\"'; break;
      case 0x5c: result += "\\\\"; break;
      default:
        result += point <= 0x1f ? `\\u00${point.toString(16).padStart(2, "0")}` : scalar;
    }
  }
  return `${result}"`;
}

function compareScalarStrings(left: string, right: string): number {
  const a = Array.from(left, (scalar) => scalar.codePointAt(0)!);
  const b = Array.from(right, (scalar) => scalar.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
