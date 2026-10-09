import { decodePublicSourceOverlayIdentity } from "@bpmn-lean/platform-contracts";
import type { PublicSourceOverlayIdentity } from "@bpmn-lean/platform-contracts";

export function decodeStoredSourceOverlayIdentity(id: unknown, sha256: unknown): PublicSourceOverlayIdentity | null {
  return decodePublicSourceOverlayIdentity(id === null && sha256 === null ? null : { id, sha256 }, "stored source overlay");
}

export function sourceOverlaySqlValues(identity: PublicSourceOverlayIdentity | null): readonly [string | null, string | null] {
  const exact = decodePublicSourceOverlayIdentity(identity, "definition source overlay");
  return exact === null ? [null, null] : [exact.id, exact.sha256];
}
