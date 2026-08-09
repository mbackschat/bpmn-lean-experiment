import type { DeepReadonly } from "./deep-readonly.js";
import { isWellFormedWireString } from "./wire.js";

/** Exact identity of an optional, data-only source overlay selected at compilation. */
export type SourceOverlayIdentity = DeepReadonly<{
  id: string;
  sha256: string;
}>;

/** Admits only null or the exact canonical source-overlay identity wire shape. */
export function isSourceOverlayIdentityOrNull(
  value: unknown,
): value is SourceOverlayIdentity | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 &&
    Object.hasOwn(record, "id") &&
    Object.hasOwn(record, "sha256") &&
    isWellFormedWireString(record.id) &&
    record.id.length > 0 &&
    typeof record.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.sha256);
}

/** Exact equality for the optional source-overlay component of definition identity. */
export function sameSourceOverlayIdentity(
  left: SourceOverlayIdentity | null,
  right: SourceOverlayIdentity | null,
): boolean {
  return left === null
    ? right === null
    : right !== null && left.id === right.id && left.sha256 === right.sha256;
}
