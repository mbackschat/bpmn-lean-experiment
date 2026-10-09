import { createHash } from "node:crypto";
import { ArtifactConflictError } from "@bpmn-lean/platform-artifact-store";
import type { DefinitionSourceOverlaySelection } from "@bpmn-lean/platform-engine-gateway";
import { DefinitionArtifactIntegrityError } from "./contracts.js";
import type { DefinitionMetadata, ExactArtifactStore } from "./contracts.js";

export type RetainedDefinitionArtifacts = Readonly<{
  bytes: Uint8Array;
  sourceOverlay: DefinitionSourceOverlaySelection | null;
}>;

async function readArtifact(
  artifacts: ExactArtifactStore,
  definition: DefinitionMetadata,
  sha256: string,
): Promise<Uint8Array | null> {
  try {
    return await artifacts.get(sha256);
  } catch (error) {
    if (error instanceof ArtifactConflictError) {
      throw new DefinitionArtifactIntegrityError(definition, sha256);
    }
    throw error;
  }
}

/** Reconstructs only the immutable artifacts named by an exact version or reservation. */
export async function readRetainedDefinitionArtifacts(
  artifacts: ExactArtifactStore,
  definition: DefinitionMetadata,
): Promise<RetainedDefinitionArtifacts> {
  const source = await readArtifact(artifacts, definition, definition.source.sha256);
  if (source === null) throw new DefinitionArtifactIntegrityError(definition, definition.source.sha256);
  const bytes = Uint8Array.from(source);
  if (bytes.byteLength !== definition.source.byteLength) {
    throw new DefinitionArtifactIntegrityError(definition, definition.source.sha256, {
      expected: definition.source.byteLength, actual: bytes.byteLength,
    });
  }
  if (definition.sourceOverlay === null) return { bytes, sourceOverlay: null };
  const identity = { ...definition.sourceOverlay };
  const artifact = await readArtifact(artifacts, definition, identity.sha256);
  if (artifact === null) throw new DefinitionArtifactIntegrityError(definition, identity.sha256);
  const overlayBytes = Uint8Array.from(artifact);
  if (createHash("sha256").update(overlayBytes).digest("hex") !== identity.sha256) {
    throw new DefinitionArtifactIntegrityError(definition, identity.sha256);
  }
  return { bytes, sourceOverlay: { ...identity, bytes: overlayBytes } };
}
