import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";

import {
  requireExecutionPublicationExport,
} from "./semantic-publication.js";
import type {
  ExecutionPublicationExport,
  ExecutionPublicationValidationContext,
} from "./semantic-publication.js";

/** Emits the one exact UTF-8 JSON representation selected for a full semantic export. */
export function serializeExecutionPublicationExport(
  value: unknown,
  context: ExecutionPublicationValidationContext,
): Uint8Array {
  const publication = requireExecutionPublicationExport(value, context);
  return new TextEncoder().encode(canonicalJson(publication));
}

/** Rejects bytes unless they are both a strict full export and its exact canonical encoding. */
export function requireCanonicalExecutionPublicationExport(
  bytes: Uint8Array,
  context: ExecutionPublicationValidationContext,
): ExecutionPublicationExport {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    const publication = requireExecutionPublicationExport(parsed, context);
    const canonical = new TextEncoder().encode(canonicalJson(publication));
    if (!sameBytes(bytes, canonical)) {
      throw new TypeError("noncanonical bytes");
    }
    return publication;
  } catch (error) {
    throw new TypeError(
      "malformed canonical execution publication export",
      { cause: error },
    );
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("canonical JSON requires a safe integer");
    }
    return String(value);
  }
  if (typeof value === "string") {
    return canonicalString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareCanonicalStrings);
    const fields = keys.map((key) =>
      `${canonicalString(key)}:${canonicalJson(value[key])}`
    );
    return `{${fields.join(",")}}`;
  }
  throw new TypeError("canonical JSON rejects unsupported values");
}

function canonicalString(value: string): string {
  if (!isWellFormedWireString(value)) {
    throw new TypeError(
      "canonical JSON strings require Unicode scalar values",
    );
  }
  let result = '"';
  for (const scalar of value) {
    const point = scalar.codePointAt(0);
    if (point === undefined) {
      throw new TypeError("canonical JSON requires a Unicode scalar");
    }
    switch (point) {
      case 0x08:
        result += "\\b";
        break;
      case 0x09:
        result += "\\t";
        break;
      case 0x0a:
        result += "\\n";
        break;
      case 0x0c:
        result += "\\f";
        break;
      case 0x0d:
        result += "\\r";
        break;
      case 0x22:
        result += '\\"';
        break;
      case 0x5c:
        result += "\\\\";
        break;
      default:
        result += point <= 0x1f
          ? `\\u00${point.toString(16).padStart(2, "0")}`
          : scalar;
    }
  }
  return `${result}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
