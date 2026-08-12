import type {
  MessageStartPublication,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import type {
  DefinitionMessageStartCapability,
  DefinitionMetadata,
  DefinitionRepository,
  DefinitionStartCapabilities,
  ExactArtifactStore,
} from "./contracts.js";
import type {
  ProcessWorkLocatorFactory,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublicationService,
} from "./confirmed-process-instance-publication-service.js";

export const MessageStartPublicationState = {
  Reserved: "reserved",
  Starting: "starting",
  Accepted: "accepted",
  Indeterminate: "indeterminate",
  IntegrityFailure: "integrityFailure",
} as const;

export type MessageStartPublicationState =
  typeof MessageStartPublicationState[keyof typeof MessageStartPublicationState];

export type MessageStartPublicationPrivateIdentity = Readonly<{
  processInstanceId: string;
  commandId: string;
  workflowId: string;
}>;

export type MessageStartPublicationIntent = Readonly<{
  protocol: string;
  intentSha256: string;
}>;

export type NewMessageStartPublicationRecord = Readonly<{
  publicationId: string;
  definition: DefinitionMetadata;
  messageStart: DefinitionMessageStartCapability;
  identity: MessageStartPublicationPrivateIdentity;
  intent: MessageStartPublicationIntent;
}>;

export type MessageStartPublicationRecord =
  NewMessageStartPublicationRecord & Readonly<{
    state: MessageStartPublicationState;
  }>;

export type MessageStartPublicationReservation = Readonly<{
  inserted: boolean;
  record: MessageStartPublicationRecord;
}>;

/** Atomic publication persistence operations; no call may span a host await. */
export interface MessageStartPublicationRepository {
  reserve(
    record: NewMessageStartPublicationRecord,
  ): MessageStartPublicationReservation;
  get(publicationId: string): MessageStartPublicationRecord | null;
  listForReconciliation(): ReadonlyArray<MessageStartPublicationRecord>;
  compareAndSet(
    publicationId: string,
    expected: MessageStartPublicationState,
    next: MessageStartPublicationState,
  ): MessageStartPublicationRecord | null;
}

export type MessageStartPublicationIdentityPolicy = Readonly<{
  processInstanceId: (publicationId: string) => string;
  commandId: (publicationId: string) => string;
  workflowId: (processInstanceId: string) => string;
}>;

export type MessageStartPublicationHostRequest = Readonly<{
  bytes: Uint8Array;
  definition: Readonly<{
    processId: string;
    source: Readonly<{
      id: string;
      sha256: string;
      byteLength: number;
    }>;
    semanticProfile: string;
    startCapabilities: DefinitionStartCapabilities;
  }>;
  messageStart: DefinitionMessageStartCapability;
  processInstanceId: string;
  commandId: string;
  workflowId: string;
}>;

export type MessageStartPublicationPreparationResult =
  | Readonly<{
      status: "admitted";
      intent: MessageStartPublicationIntent;
    }>
  | Readonly<{
      status: "rejected" | "integrityFailure";
      evidence: string;
    }>;

export type MessageStartPublicationHostStartResult =
  | Readonly<{ status: "started" }>
  | Readonly<{
      status: "rejected" | "integrityFailure";
      evidence: string;
    }>;

export type MessageStartPublicationDescriptionResult = Readonly<{
  status: "matching" | "missing" | "divergent" | "unavailable";
}>;

/** Closed, handle-free Product 1 host capability consumed by the publication lifecycle. */
export interface MessageStartPublicationHost {
  prepare(
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationPreparationResult>;
  start(
    request: MessageStartPublicationHostRequest & Readonly<{
      expectedIntent: MessageStartPublicationIntent;
    }>,
  ): Promise<MessageStartPublicationHostStartResult>;
  describe(request: Readonly<{
    workflowId: string;
    expectedIntent: MessageStartPublicationIntent;
  }>): Promise<MessageStartPublicationDescriptionResult>;
}

export type MessageStartPublicationServiceDependencies = Readonly<{
  artifacts: ExactArtifactStore;
  definitions: DefinitionRepository;
  publications: MessageStartPublicationRepository;
  host: MessageStartPublicationHost;
  identities: MessageStartPublicationIdentityPolicy;
  confirmedInstances: ConfirmedProcessInstancePublicationService;
  locators: ProcessWorkLocatorFactory;
}>;

export type PutMessageStartPublicationResult = Readonly<{
  created: boolean;
  publication: MessageStartPublication;
}>;

export class MessageStartPublicationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageStartPublicationConflictError";
  }
}

export class MessageStartPublicationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageStartPublicationIntegrityError";
  }
}

export class MessageStartPublicationNotFoundError extends Error {
  readonly definition: PutMessageStartPublicationRequest["definition"];

  constructor(definition: PutMessageStartPublicationRequest["definition"]) {
    super(`definition ${definition.processId}/${definition.version} was not found`);
    this.name = "MessageStartPublicationNotFoundError";
    this.definition = { ...definition };
  }
}

export class MessageStartPublicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageStartPublicationValidationError";
  }
}

export class MessageStartPublicationDeliveryUnavailableError extends Error {
  constructor() {
    super("Message Start publication delivery evidence is unavailable");
    this.name = "MessageStartPublicationDeliveryUnavailableError";
  }
}
