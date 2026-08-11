import type {
  DeployedDefinitionVersion,
  PublicMessageStartCapability,
} from "./definitions.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Public lifecycle states of one immutable Message Start publication. */
export const MessageStartPublicationStatus = {
  Pending: "pending",
  Accepted: "accepted",
  Indeterminate: "indeterminate",
} as const;

export type MessageStartPublicationStatus =
  typeof MessageStartPublicationStatus[keyof typeof MessageStartPublicationStatus];

/** Closed exact-target request for one Message Start publication. */
export type PutMessageStartPublicationRequest = Readonly<{
  definition: Readonly<{
    processId: string;
    version: number;
  }>;
  messageStart: PublicMessageStartCapability;
}>;

/** Facts shared by every public Message Start publication state. */
export type MessageStartPublicationBase = Readonly<{
  publicationId: string;
  definition: DeployedDefinitionVersion;
  messageStart: PublicMessageStartCapability;
}>;

export type MessageStartPublication =
  | (MessageStartPublicationBase & Readonly<{
      status: typeof MessageStartPublicationStatus.Pending;
      instance: null;
    }>)
  | (MessageStartPublicationBase & Readonly<{
      status: typeof MessageStartPublicationStatus.Accepted;
      instance: PublicProcessInstanceIdentity;
    }>)
  | (MessageStartPublicationBase & Readonly<{
      status: typeof MessageStartPublicationStatus.Indeterminate;
      instance: null;
    }>);
