import type {
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
} from "@bpmn-lean/platform-contracts";

import type {
  DefinitionMetadata,
  DefinitionSourceIdentity,
} from "./contracts.js";

/** Projects stored definition metadata into the closed Product 2 wire value. */
export function toPublicDefinition(
  definition: DefinitionMetadata,
): DeployedDefinitionVersion {
  return {
    processId: definition.processId,
    version: definition.version,
    source: toPublicSource(definition.source),
    semanticProfile: definition.semanticProfile,
    startCapabilities: {
      messageStarts: definition.startCapabilities.messageStarts.map(
        ({ startEventId, channel }) => ({
          startEventId,
          channel: { ...channel },
        }),
      ),
      timerStarts: definition.startCapabilities.timerStarts.map(
        ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
      ),
    },
  };
}

export function toPublicSource(
  source: DefinitionSourceIdentity,
): ExactPublicSourceIdentity {
  return {
    kind: source.kind,
    id: source.id,
    sha256: source.sha256,
    byteLength: source.byteLength,
    declaredEncoding: source.declaredEncoding,
    decodedAs: source.decodedAs,
  };
}
