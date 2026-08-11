import type {
  DefinitionMetadata,
  DefinitionSourceIdentity,
  DefinitionStartCapabilities,
} from "./contracts.js";
import {
  cloneDefinitionStartCapabilities,
  equalDefinitionStartCapabilities,
} from "./definition-capabilities.js";

export function cloneDefinitionMetadata(
  definition: DefinitionMetadata,
): DefinitionMetadata {
  return {
    processId: definition.processId,
    version: definition.version,
    source: cloneDefinitionSource(definition.source),
    semanticProfile: definition.semanticProfile,
    startCapabilities: cloneDefinitionStartCapabilities(
      definition.startCapabilities,
    ),
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

export function equalDefinitionMetadata(
  left: DefinitionMetadata,
  right: DefinitionMetadata,
): boolean {
  return left.processId === right.processId &&
    left.version === right.version &&
    left.semanticProfile === right.semanticProfile &&
    equalDefinitionSource(left.source, right.source) &&
    equalDefinitionStartCapabilities(
      left.startCapabilities,
      right.startCapabilities,
    );
}

export function equalDefinitionSource(
  left: DefinitionSourceIdentity,
  right: DefinitionSourceIdentity,
): boolean {
  return left.kind === right.kind &&
    left.id === right.id &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.declaredEncoding === right.declaredEncoding &&
    left.decodedAs === right.decodedAs;
}
