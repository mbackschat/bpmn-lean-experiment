import { decodeExecutionPublicationExport } from "./execution-publication-decoders.js";
import type {
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
} from "./execution-publications.js";
import {
  sameCanonicalJsonBytes,
  serializeCanonicalJsonValue,
} from "./canonical-json.js";
import { parseStrictJson } from "./strict-json.js";

/** Canonicalizes one already decoded publication value for stable overlap comparison. */
export function serializeCanonicalExecutionPublicationValue(
  value: unknown,
): Uint8Array {
  return serializeCanonicalJsonValue(value);
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
    if (!sameCanonicalJsonBytes(bytes, canonical)) throw new TypeError("noncanonical bytes");
    return publication;
  } catch (error) {
    throw new TypeError("malformed canonical execution publication export", { cause: error });
  }
}
