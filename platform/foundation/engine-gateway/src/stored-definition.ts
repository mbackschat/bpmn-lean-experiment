/**
 * Recompiles a stored definition version from its exact bytes and checks that it is still what Product 2 stored:
 * the same source, Process, profile, overlay and start capabilities. Schedules, Message starts and correlated Messages
 * act only on a definition that passes.
 */
import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
  type EngineAcceptedDefinitionCompilation,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";

import {
  mapDefinitionStartCapabilities,
  sameStartCapabilities,
  type DefinitionStartCapabilities,
} from "./definition-capabilities.js";
import { storedProfile, type GatewayContext } from "./gateway-context.js";

/** A definition version as Product 2 stored it; `version` is the deployed version every start names. */
export type StoredDefinitionVersion = Readonly<{
  processId: string;
  version: number;
  source: Readonly<{ id: string; sha256: string; byteLength: number }>;
  semanticProfile: string;
  startCapabilities: DefinitionStartCapabilities;
}>;

export type StoredDefinitionResolution =
  | Readonly<{ kind: "resolved"; compilation: EngineAcceptedDefinitionCompilation }>
  | Readonly<{ kind: "integrityFailure"; evidence: string }>;

export async function recompileStoredDefinition(
  context: GatewayContext,
  bytes: Uint8Array,
  sourceOverlay: EngineSourceOverlaySelection | null,
  stored: StoredDefinitionVersion,
): Promise<StoredDefinitionResolution> {
  const result = await compileBpmnDefinition({
    bytes,
    sourceId: stored.source.id,
    expectedSha256: stored.source.sha256,
    profile: storedProfile(context, stored.semanticProfile),
    sourceOverlay,
    limits: context.limits,
  });
  if (result.status === EngineDefinitionCompilationStatus.Rejected) {
    return { kind: "integrityFailure", evidence: result.diagnostics[0].evidence };
  }
  const mapped = mapDefinitionStartCapabilities(result.capabilities);
  if (result.source.byteLength !== stored.source.byteLength || result.definition.ref.definitionKey !== stored.processId ||
      mapped.kind !== "mapped" || !sameStartCapabilities(mapped.capabilities, stored.startCapabilities)) {
    return { kind: "integrityFailure", evidence: "The stored definition differs from what its bytes compile to now." };
  }
  return { kind: "resolved", compilation: result };
}
