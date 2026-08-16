import {
  sameCanonicalJsonBytes,
  serializeCanonicalJsonValue,
} from "./canonical-json.js";
import { decodeHumanTaskCatalogV1 } from "./human-task-catalog-decoders.js";
import type { HumanTaskCatalogV1 } from "./human-task-catalog.js";
import { parseStrictJson } from "./strict-json.js";

/** Validates and emits the sole canonical UTF-8 representation of one catalog. */
export function serializeHumanTaskCatalogV1(value: unknown): Uint8Array {
  return serializeCanonicalJsonValue(decodeHumanTaskCatalogV1(value));
}

/** Accepts only strict JSON bytes already identical to the canonical catalog bytes. */
export function decodeCanonicalHumanTaskCatalogV1(
  bytes: Uint8Array,
): HumanTaskCatalogV1 {
  try {
    const catalog = decodeHumanTaskCatalogV1(parseStrictJson(bytes));
    const canonical = serializeCanonicalJsonValue(catalog);
    if (!sameCanonicalJsonBytes(bytes, canonical)) {
      throw new TypeError("noncanonical bytes");
    }
    return catalog;
  } catch (error: unknown) {
    throw new TypeError("malformed canonical Human Task catalog", { cause: error });
  }
}
