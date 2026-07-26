import type {
  EffectOccurrenceId,
  OpenEffect,
} from "./contract.js";
import type {
  EffectDescriptor,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";

/**
 * Definition fields that remain stable across compiler-only changes.
 *
 * This is deliberately not SemanticProcessIdentity: compiler is excluded and processId is included.
 */
export type EffectDefinitionKey = Readonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  processId: string;
}>;

export type EffectTransportMaterial = Readonly<{
  definition: EffectDefinitionKey;
  occurrence: EffectOccurrenceId;
  descriptor: EffectDescriptor;
}>;

/**
 * Projects the complete transport material from admitted definition data and one committed effect.
 *
 * Hashing and host identity are adapter concerns and cannot enter this semantic-core projection.
 */
export function projectEffectTransportMaterial(
  program: SemanticProcessProgram,
  effect: OpenEffect,
): EffectTransportMaterial {
  return {
    definition: {
      semanticProfile: program.identity.semanticProfile,
      sourceId: program.identity.sourceId,
      sourceSha256: program.identity.sourceSha256,
      processId: program.processId,
    },
    occurrence: effect.id,
    descriptor: effect.descriptor,
  };
}
