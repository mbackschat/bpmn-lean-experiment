import { DefinitionRegistrationStatus } from "@bpmn-lean/platform-engine-gateway";
import type { DefinitionVersionRegistrar } from "@bpmn-lean/platform-engine-gateway";

import type { RetainedDefinitionArtifacts } from "./definition-artifacts.js";
import type { DefinitionEngineRegistration, DefinitionMetadata } from "./contracts.js";

/**
 * Registers one stored version with the engine from its retained exact artifacts and answers the registration to
 * record. The engine answers a repeated registration as the first, so every caller may register a version again
 * until an answer is recorded.
 */
export async function registerRetainedDefinitionVersion(
  registrar: DefinitionVersionRegistrar,
  definition: DefinitionMetadata,
  retained: RetainedDefinitionArtifacts,
): Promise<DefinitionEngineRegistration> {
  const result = await registrar.registerDefinitionVersion({
    bytes: retained.bytes,
    sourceId: definition.source.id,
    expectedSha256: definition.source.sha256,
    semanticProfile: definition.semanticProfile,
    expectedProcessId: definition.processId,
    version: definition.version,
    sourceOverlay: retained.sourceOverlay,
  });
  return result.status === DefinitionRegistrationStatus.Registered
    ? { state: "registered" }
    : { state: "refused", code: result.failure.code };
}
