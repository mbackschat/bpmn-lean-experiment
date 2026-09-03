/** Public definition-scoped correlated Message command and closed result projection. */
import {
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  DeepReadonly,
  MessageSubscriptionId,
} from "@bpmn-lean/semantic-core";
import {
  BpmnCorrelatedMessageIdentityConflict,
  BpmnCorrelatedMessageIngressInvalid,
  TemporalCorrelatedMessagePublishResolutionKind,
  publishTemporalCorrelatedMessage,
} from "@bpmn-lean/temporal-client/correlation-publication";
import type {
  TemporalCorrelatedMessageClient,
} from "@bpmn-lean/temporal-client/correlation-publication";

export enum EngineCorrelatedMessagePublishResolutionKind {
  Semantic = "semantic",
  Capacity = "capacity",
  InfrastructureIndeterminate = "infrastructureIndeterminate",
}

export enum EngineCorrelatedMessageSemanticOutcomeKind {
  Committed = "committed",
  RejectedNoMatch = "rejectedNoMatch",
  RejectedAmbiguous = "rejectedAmbiguous",
}

export type EngineCorrelatedMessageTarget = DeepReadonly<{
  processInstanceId: string;
  subscriptionId: MessageSubscriptionId;
}>;

export type EngineCorrelatedMessageSemanticOutcome = DeepReadonly<
  | { kind: EngineCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch }
  | { kind: EngineCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous }
  | {
      kind: EngineCorrelatedMessageSemanticOutcomeKind.Committed;
      target: EngineCorrelatedMessageTarget;
    }
>;

export type EngineCorrelatedMessagePublishRequest = Readonly<{
  temporalClient: TemporalCorrelatedMessageClient;
  commandId: string;
  address: CorrelatedMessageAddress;
  payload: Readonly<{ kind: VariableValueKind.String; value: string }>;
  taskQueue: string;
}>;

export type EngineCorrelatedMessagePublishResolution =
  | DeepReadonly<{
      kind: EngineCorrelatedMessagePublishResolutionKind.Semantic;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number;
      outcome: EngineCorrelatedMessageSemanticOutcome;
    }>
  | DeepReadonly<{
      kind: EngineCorrelatedMessagePublishResolutionKind.Capacity;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: null;
      failure: {
        kind: "publicationQueue" | "publicationLedger";
        measure: "count" | "canonicalBytes";
        configuredBound: number;
        observedValue: number;
      };
    }>
  | DeepReadonly<{
      kind: EngineCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number | null;
      phase:
        | "ingressResolution"
        | "candidateFanout"
        | "targetDelivery"
        | "resultRecovery";
      target: null;
      failure:
        | { kind: "unconfirmed" }
        | {
            kind: "capacity";
            boundary:
              | "activityRequest"
              | "activityResult"
              | "queryResponse"
              | "continuation";
            configuredBound: number;
            observedValue: number;
          }
        | {
            kind: "runCapacity";
            configuredBound: number;
            observedValue: number;
          };
    }>
  | DeepReadonly<{
      kind: EngineCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number | null;
      phase: "targetDelivery";
      target: EngineCorrelatedMessageTarget;
      failure: { kind: "targetInconsistent" };
    }>;

export class EngineCorrelatedMessageIngressInvalid extends Error {
  override readonly name = "EngineCorrelatedMessageIngressInvalid";
}

export class EngineCorrelatedMessageIdentityConflict extends Error {
  override readonly name = "EngineCorrelatedMessageIdentityConflict";
}

/** Publishes one content-bound command without accepting a Process locator or target. */
export async function publishBpmnDefinitionCorrelatedMessage(
  request: EngineCorrelatedMessagePublishRequest,
): Promise<EngineCorrelatedMessagePublishResolution> {
  let result;
  try {
    result = await publishTemporalCorrelatedMessage(
      request.temporalClient,
      {
        command: {
          commandId: request.commandId,
          address: request.address,
          payload: request.payload,
        },
        taskQueue: request.taskQueue,
      },
    );
  } catch (error: unknown) {
    if (error instanceof BpmnCorrelatedMessageIdentityConflict) {
      throw new EngineCorrelatedMessageIdentityConflict(
        "Correlated Message command identity conflicts with retained content",
        { cause: error },
      );
    }
    if (error instanceof BpmnCorrelatedMessageIngressInvalid) {
      throw new EngineCorrelatedMessageIngressInvalid(
        "Correlated Message command is invalid",
        { cause: error },
      );
    }
    throw error;
  }
  switch (result.kind) {
    case TemporalCorrelatedMessagePublishResolutionKind.Semantic:
      return {
        kind: EngineCorrelatedMessagePublishResolutionKind.Semantic,
        commandId: result.commandId,
        address: result.address,
        ingressOrdinal: result.ingressOrdinal,
        outcome: projectSemanticOutcome(result.outcome),
      };
    case TemporalCorrelatedMessagePublishResolutionKind.Capacity:
      return {
        kind: EngineCorrelatedMessagePublishResolutionKind.Capacity,
        commandId: result.commandId,
        address: result.address,
        ingressOrdinal: null,
        failure: result.failure,
      };
    case TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate:
      switch (result.failure.kind) {
        case "targetInconsistent":
          if (result.target === null) {
            throw new TypeError(
              "Target-inconsistent correlated Message result lost its target",
            );
          }
          return {
            kind: EngineCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
            commandId: result.commandId,
            address: result.address,
            ingressOrdinal: result.ingressOrdinal,
            phase: "targetDelivery",
            target: result.target,
            failure: result.failure,
          };
        case "unconfirmed":
        case "capacity":
        case "runCapacity":
          return {
            kind: EngineCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
            commandId: result.commandId,
            address: result.address,
            ingressOrdinal: result.ingressOrdinal,
            phase: result.phase,
            target: null,
            failure: result.failure,
          };
      }
  }
}

function projectSemanticOutcome(
  outcome: Readonly<{
    kind: "committed" | "rejectedNoMatch" | "rejectedAmbiguous";
    target?: EngineCorrelatedMessageTarget;
  }>,
): EngineCorrelatedMessageSemanticOutcome {
  switch (outcome.kind) {
    case "rejectedNoMatch":
      return { kind: EngineCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch };
    case "rejectedAmbiguous":
      return { kind: EngineCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous };
    case "committed":
      if (outcome.target === undefined) {
        throw new TypeError("Committed correlated Message result lost its target");
      }
      return {
        kind: EngineCorrelatedMessageSemanticOutcomeKind.Committed,
        target: outcome.target,
      };
  }
}
