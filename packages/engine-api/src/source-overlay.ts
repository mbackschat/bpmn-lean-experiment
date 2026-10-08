import type { SourceOverlaySelection } from "@bpmn-lean/bpmn-source";

/** Detaches the exact selection before compilation or start construction can yield. */
export function snapshotSourceOverlay(
  selection: SourceOverlaySelection | null | undefined,
): SourceOverlaySelection | null {
  if (selection === null || selection === undefined) return null;
  if (typeof selection !== "object" || !(selection.bytes instanceof Uint8Array)) {
    throw new TypeError("sourceOverlay must be null or an exact overlay selection");
  }
  return {
    id: selection.id,
    sha256: selection.sha256,
    bytes: Uint8Array.from(selection.bytes),
  };
}
