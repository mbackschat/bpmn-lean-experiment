import {
  decodePublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

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
