import { serializeCanonicalJsonValue } from "./canonical-json.js";

/** Exact shared canonical-byte measure for Product 2 completion candidates. */
export function workCompletionCanonicalJsonByteLength(value: unknown): number {
  return serializeCanonicalJsonValue(value).length;
}
