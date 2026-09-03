import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  PublicCorrelatedMessagePayload,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageHost,
} from "@bpmn-lean/platform-engine-gateway";

import type {
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
} from "./contracts.js";

export type DefinitionCorrelatedMessagePublishCommand = Readonly<{
  definition: DefinitionReference;
  catchEventId: string;
  commandId: string;
  payload: PublicCorrelatedMessagePayload;
}>;

export const DefinitionCorrelatedMessagePublishStatus = {
  Resolved: "resolved",
  DefinitionNotFound: "definitionNotFound",
  CapabilityNotFound: "capabilityNotFound",
  IdentityConflict: "identityConflict",
} as const;

export type DefinitionCorrelatedMessagePublishStatus =
  typeof DefinitionCorrelatedMessagePublishStatus[
    keyof typeof DefinitionCorrelatedMessagePublishStatus
  ];

export type DefinitionCorrelatedMessagePublishResult =
  | Readonly<{
      status: typeof DefinitionCorrelatedMessagePublishStatus.Resolved;
      publication: DefinitionCorrelatedMessagePublication;
    }>
  | Readonly<{
      status: typeof DefinitionCorrelatedMessagePublishStatus.DefinitionNotFound;
    }>
  | Readonly<{
      status: typeof DefinitionCorrelatedMessagePublishStatus.CapabilityNotFound;
    }>
  | Readonly<{
      status: typeof DefinitionCorrelatedMessagePublishStatus.IdentityConflict;
    }>;

export type DefinitionCorrelatedMessageServiceDependencies = Readonly<{
  repository: DefinitionRepository;
  artifacts: ExactArtifactStore;
  host: DefinitionCorrelatedMessageHost;
}>;

export interface DefinitionCorrelatedMessageOperations {
  describe(
    reference: DefinitionReference,
  ): Promise<DefinitionCorrelatedMessageCapabilities | null>;
  publish(
    command: DefinitionCorrelatedMessagePublishCommand,
  ): Promise<DefinitionCorrelatedMessagePublishResult>;
}

/** Raised when durable definition state and reconstructed engine state disagree. */
export class DefinitionCorrelatedMessageIntegrityError extends Error {
  constructor(evidence: string) {
    super(evidence);
    this.name = "DefinitionCorrelatedMessageIntegrityError";
  }
}
