import type {
  DeployedDefinitionVersion,
  PublicOperationMessageChannel,
} from "./definitions.js";

/** Definition-scoped Message capability published without a Process target. */
export type PublicCorrelatedMessageCapability = Readonly<{
  catchEventId: string;
  channel: PublicOperationMessageChannel;
  correlationKeyId: string;
}>;

/** Correlated Message capabilities reconstructed from one exact definition version. */
export type DefinitionCorrelatedMessageCapabilities = Readonly<{
  definition: DeployedDefinitionVersion;
  messages: readonly PublicCorrelatedMessageCapability[];
}>;

/** Bounded scalar Message payload whose value is also the correlation value. */
export type PublicCorrelatedMessagePayload = Readonly<{
  kind: "string";
  value: string;
}>;

/** Target-free publication request for one route-selected Message capability. */
export type PutDefinitionCorrelatedMessagePublicationRequest = Readonly<{
  payload: PublicCorrelatedMessagePayload;
}>;

export const DefinitionCorrelatedMessageResolutionKind = {
  Semantic: "semantic",
  Capacity: "capacity",
  InfrastructureIndeterminate: "infrastructureIndeterminate",
} as const;

export type DefinitionCorrelatedMessageResolutionKind =
  typeof DefinitionCorrelatedMessageResolutionKind[
    keyof typeof DefinitionCorrelatedMessageResolutionKind
  ];

export const DefinitionCorrelatedMessageSemanticOutcomeKind = {
  Committed: "committed",
  RejectedNoMatch: "rejectedNoMatch",
  RejectedAmbiguous: "rejectedAmbiguous",
} as const;

export type DefinitionCorrelatedMessageSemanticOutcomeKind =
  typeof DefinitionCorrelatedMessageSemanticOutcomeKind[
    keyof typeof DefinitionCorrelatedMessageSemanticOutcomeKind
  ];

/** Public resolution of one target-free correlated Message command. */
export type DefinitionCorrelatedMessageResolution =
  | Readonly<{
      kind: typeof DefinitionCorrelatedMessageResolutionKind.Semantic;
      commandId: string;
      ingressOrdinal: number;
      outcome:
        | Readonly<{
            kind: typeof DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch;
          }>
        | Readonly<{
            kind: typeof DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous;
          }>
        | Readonly<{
            kind: typeof DefinitionCorrelatedMessageSemanticOutcomeKind.Committed;
            target: Readonly<{ processInstanceId: string }>;
          }>;
    }>
  | Readonly<{
      kind: typeof DefinitionCorrelatedMessageResolutionKind.Capacity;
      commandId: string;
      ingressOrdinal: null;
      failure: Readonly<{
        kind: "publicationQueue" | "publicationLedger";
        measure: "count" | "canonicalBytes";
        configuredBound: number;
        observedValue: number;
      }>;
    }>
  | Readonly<{
      kind: typeof DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      ingressOrdinal: number | null;
      phase:
        | "ingressResolution"
        | "candidateFanout"
        | "targetDelivery"
        | "resultRecovery";
      target: null;
      failure:
        | Readonly<{ kind: "unconfirmed" }>
        | Readonly<{
            kind: "capacity";
            boundary:
              | "activityRequest"
              | "activityResult"
              | "queryResponse"
              | "continuation";
            configuredBound: number;
            observedValue: number;
          }>
        | Readonly<{
            kind: "runCapacity";
            configuredBound: number;
            observedValue: number;
          }>;
    }>
  | Readonly<{
      kind: typeof DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      ingressOrdinal: number | null;
      phase: "targetDelivery";
      target: Readonly<{ processInstanceId: string }>;
      failure: Readonly<{ kind: "targetInconsistent" }>;
    }>;

/** Exact definition and capability context returned with one command resolution. */
export type DefinitionCorrelatedMessagePublication = Readonly<{
  definition: DeployedDefinitionVersion;
  correlatedMessage: PublicCorrelatedMessageCapability;
  resolution: DefinitionCorrelatedMessageResolution;
}>;
