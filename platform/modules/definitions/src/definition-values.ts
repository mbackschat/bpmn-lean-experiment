import type {
  DefinitionMetadata,
  DefinitionSourceIdentity,
} from "./contracts.js";

export function cloneDefinitionMetadata(
  definition: DefinitionMetadata,
): DefinitionMetadata {
  return {
    processId: definition.processId,
    version: definition.version,
    source: cloneDefinitionSource(definition.source),
    semanticProfile: definition.semanticProfile,
  };
}

export function cloneDefinitionSource(
  source: DefinitionSourceIdentity,
): DefinitionSourceIdentity {
  return {
    kind: source.kind,
    id: source.id,
    sha256: source.sha256,
    byteLength: source.byteLength,
    declaredEncoding: source.declaredEncoding,
    decodedAs: source.decodedAs,
  };
}
