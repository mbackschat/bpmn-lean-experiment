/**
 * Correlated Message ingress: a Message published to a definition version, without a process target, is delivered to
 * the one open correlated wait of that version's instances whose correlation the kernel matches at delivery time, as
 * CIB Seven correlates; no match is `message.notCorrelated` and several are `message.correlationAmbiguous` (root
 * decision, WP2, 2026-11-09). The host routes it through the ingress of the version's correlation scope
 * (`engineCorrelationScope`), which every instance the version starts registers its correlated waits with, and the
 * target instance rechecks the delivery before it consumes the wait.
 *
 * The publication's payload is the correlation value: the delivery carries `[{processVariable correlationKey, payload}]`
 * as its correlation and no payload, since a correlated catch writes none (`message.correlation.output`).
 */
import {
  PublicationOutcome,
  correlationAmbiguousCode,
  notCorrelatedCode,
  type PublicationResult,
} from "@bpmn-lean/temporal-host/host";

import {
  requireWireString,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineValue,
  type JsonValue,
} from "./common.js";
import { engineHostRefusalCodes, type EngineMessageChannel } from "./definition.js";
import { engineCorrelationScope, type EngineHost } from "./host.js";
import { engineProcessLocatorForWorkflowId, type EngineProcessLocator } from "./process-locator.js";

export const engineNotCorrelatedCode = notCorrelatedCode;
export const engineCorrelationAmbiguousCode = correlationAmbiguousCode;

export enum EngineCorrelatedMessageStatus {
  Delivered = "delivered",
  /** No single wait took the publication, or the sole matching instance refused it; no instance changed. */
  Rejected = "rejected",
  /** The command identifier already settled a publication with other content. */
  IdentityConflict = "identityConflict",
  /** The deployment does not serve Messages. */
  Refused = "refused",
}

export type EngineCorrelatedMessageRequest = Readonly<{
  host: EngineHost;
  definition: EngineDefinitionIdentity;
  channel: EngineMessageChannel;
  /** The correlation key a correlated catch of the channel names (`EngineCorrelationCriterion.key`). */
  correlationKey: string;
  commandId: string;
  /** The Message payload, which is the correlation value. */
  payload: EngineValue;
}>;

/** The instance a publication reached: its semantic identity and the opaque locator of the chain hosting it. */
export type EngineCorrelationTarget = Readonly<{ processInstanceId: string; locator: EngineProcessLocator }>;

/** `ingressOrdinal` numbers the publications to one definition version and channel in arrival order from 1. */
export type EngineCorrelatedMessageResult =
  | Readonly<{ status: EngineCorrelatedMessageStatus.Delivered; ingressOrdinal: number; target: EngineCorrelationTarget }>
  | Readonly<{
      status: EngineCorrelatedMessageStatus.Rejected;
      ingressOrdinal: number;
      /** The sole matching instance when it refused the delivery; `null` when no single instance matched. */
      target: EngineCorrelationTarget | null;
      failure: EngineFailure;
    }>
  | Readonly<{ status: EngineCorrelatedMessageStatus.IdentityConflict }>
  | Readonly<{ status: EngineCorrelatedMessageStatus.Refused; failure: EngineFailure }>;

export async function publishEngineCorrelatedMessage(
  request: EngineCorrelatedMessageRequest,
): Promise<EngineCorrelatedMessageResult> {
  const commandId = requireWireString(request.commandId, "commandId");
  const correlationKey = requireWireString(request.correlationKey, "correlationKey");
  if (!request.host.served.messages) {
    return {
      status: EngineCorrelatedMessageStatus.Refused,
      failure: { code: engineHostRefusalCodes.messages, evidence: "The deployment does not serve Messages." },
    };
  }
  const result = await request.host.processes.publish({
    correlationScope: engineCorrelationScope(request.definition),
    channel: { ...request.channel },
    commandId,
    correlation: [{ target: { kind: "processVariable", name: correlationKey }, expected: request.payload as JsonValue }],
    payload: null,
  });
  return engineResult(result);
}

function target(result: Extract<PublicationResult, { readonly target: unknown }>): EngineCorrelationTarget {
  return {
    processInstanceId: result.target.occurrence.processInstanceId,
    locator: engineProcessLocatorForWorkflowId(result.target.workflowId),
  };
}

function engineResult(result: PublicationResult): EngineCorrelatedMessageResult {
  switch (result.kind) {
    case PublicationOutcome.Delivered:
      return { status: EngineCorrelatedMessageStatus.Delivered, ingressOrdinal: result.ordinal, target: target(result) };
    case PublicationOutcome.TargetRefused:
      return {
        status: EngineCorrelatedMessageStatus.Rejected,
        ingressOrdinal: result.ordinal,
        target: target(result),
        failure: { code: result.code, evidence: `The matching instance refused the delivery (${result.outcome}).` },
      };
    case PublicationOutcome.NotCorrelated:
      return {
        status: EngineCorrelatedMessageStatus.Rejected,
        ingressOrdinal: result.ordinal,
        target: null,
        failure: { code: result.code, evidence: "No open correlated wait of the definition matches the publication." },
      };
    case PublicationOutcome.Ambiguous:
      return {
        status: EngineCorrelatedMessageStatus.Rejected,
        ingressOrdinal: result.ordinal,
        target: null,
        failure: { code: result.code, evidence: `${String(result.matches)} open correlated waits match the publication.` },
      };
    case PublicationOutcome.IdentityConflict:
      return { status: EngineCorrelatedMessageStatus.IdentityConflict };
  }
}
