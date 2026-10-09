import type { DefinitionSourceOverlaySelection } from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionMessageStartCapability,
  DefinitionMetadata,
} from "./contracts.js";
import { cloneDefinitionMetadata } from "./definition-values.js";
import type {
  MessageStartPublicationHostRequest,
  MessageStartPublicationPrivateIdentity,
} from "./message-start-publication-contracts.js";
import { cloneMessageStart } from "./message-start-publication-values.js";

/** Reconstructs the exact retained host request without repeating preparation. */
export function messageStartPublicationHostRequest(
  bytes: Uint8Array,
  definition: DefinitionMetadata,
  messageStart: DefinitionMessageStartCapability,
  identity: MessageStartPublicationPrivateIdentity,
  sourceOverlay: DefinitionSourceOverlaySelection | null,
): MessageStartPublicationHostRequest {
  return {
    bytes: Uint8Array.from(bytes),
    sourceOverlay: sourceOverlay === null ? null : { ...sourceOverlay, bytes: Uint8Array.from(sourceOverlay.bytes) },
    definition: {
      processId: definition.processId,
      source: {
        id: definition.source.id,
        sha256: definition.source.sha256,
        byteLength: definition.source.byteLength,
      },
      semanticProfile: definition.semanticProfile,
      startCapabilities: cloneDefinitionMetadata(definition).startCapabilities,
    },
    messageStart: cloneMessageStart(messageStart),
    processInstanceId: identity.processInstanceId,
    commandId: identity.commandId,
    workflowId: identity.workflowId,
  };
}
