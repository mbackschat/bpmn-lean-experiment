import {
  sameCanonicalJsonBytes,
  serializeCanonicalJsonValue,
} from "./canonical-json.js";
import { decodeOperatorAuditExport } from "./operator-audit-export-decoders.js";
import {
  OperatorAuditMaximumCanonicalResponseBytes,
} from "./operator-audit-export.js";
import type { OperatorAuditExport } from "./operator-audit-export.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";
import { parseStrictJson } from "./strict-json.js";

/** Validates and emits the exact bounded UTF-8 operator-audit representation. */
export function serializeOperatorAuditExport(
  value: unknown,
  confirmedInstance: PublicProcessInstanceIdentity,
): Uint8Array {
  const decoded = decodeOperatorAuditExport(value, confirmedInstance);
  const bytes = serializeCanonicalJsonValue(decoded);
  if (bytes.byteLength > OperatorAuditMaximumCanonicalResponseBytes) {
    throw new TypeError("canonical operator audit export exceeds the response byte ceiling");
  }
  return bytes;
}

/** Accepts only strict JSON bytes that already equal the complete canonical export. */
export function decodeCanonicalOperatorAuditExport(
  bytes: Uint8Array,
  confirmedInstance: PublicProcessInstanceIdentity,
): OperatorAuditExport {
  try {
    if (bytes.byteLength > OperatorAuditMaximumCanonicalResponseBytes) {
      throw new TypeError("response byte ceiling exceeded");
    }
    const parsed = parseStrictJson(bytes);
    const decoded = decodeOperatorAuditExport(parsed, confirmedInstance);
    const canonical = serializeOperatorAuditExport(decoded, confirmedInstance);
    if (!sameCanonicalJsonBytes(bytes, canonical)) throw new TypeError("noncanonical bytes");
    return decoded;
  } catch (error) {
    throw new TypeError("malformed canonical operator audit export", { cause: error });
  }
}
