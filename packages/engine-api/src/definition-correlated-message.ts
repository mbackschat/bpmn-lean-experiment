/**
 * Correlated Message ingress: a Message published to a definition version, without a process target, is delivered to
 * the one open wait of that version's instances the kernel matches at delivery time, as CIB Seven correlates; no match
 * is `message.notCorrelated` and several are `message.correlationAmbiguous` (root decision, WP2, 2026-11-09). It is the
 * population publication `executionsOnly` to the version's registered deployment (`Kernel.Population.publish`), so the
 * receiver scan, its criteria refusal and the target's recheck are the kernel's.
 *
 * The publication's payload is the correlation value: the publication carries `[{processVariable correlationKey,
 * payload}]` as its criteria and no payload, since a correlated catch writes none (`message.correlation.output`).
 */
import type { CommandAnswer } from "@bpmn-lean/temporal-host/host";

import {
  member,
  requireWireString,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineValue,
  type JsonValue,
} from "./common.js";
import type { EngineMessageChannel } from "./definition-capabilities.js";
import { engineDefinitionNotDeployedCode, engineDeployment } from "./definition-deployment.js";
import { engineHostRefusalCodes } from "./definition.js";
import type { EngineHost } from "./host.js";
import { engineProcessLocatorForWorkflowId, type EngineProcessLocator } from "./process-locator.js";

export const engineNotCorrelatedCode = "message.notCorrelated";
export const engineCorrelationAmbiguousCode = "message.correlationAmbiguous";

/** The population's answer to a repeated command identifier with other content. */
const contentMismatchCode = "command-content-mismatch";

export enum EngineCorrelatedMessageStatus {
  Delivered = "delivered",
  /** No single wait took the publication, or the sole matching instance refused it; no instance changed. */
  Rejected = "rejected",
  /** The command identifier already settled a publication with other content. */
  IdentityConflict = "identityConflict",
  /** The deployment does not serve Messages, or the definition version is not deployed. */
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

/**
 * `ingressOrdinal` is the population's command ordinal: the deployment's population commands in arrival order from 1, a
 * repeated command taking the next one.
 */
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
  const deployment = await engineDeployment(request.host, request.definition);
  if (deployment === null) {
    return {
      status: EngineCorrelatedMessageStatus.Refused,
      failure: { code: engineDefinitionNotDeployedCode, evidence: "No population registration holds the definition version." },
    };
  }
  const answer = await request.host.population.command("publish", {
    commandId,
    address: { channel: { ...request.channel }, definition: { deploymentId: deployment.deploymentId } },
    criteria: [{ target: { kind: "processVariable", name: correlationKey }, expected: request.payload as JsonValue }],
    variables: [],
    mode: "executionsOnly",
  });
  return engineResult(answer);
}

function target(resolution: JsonValue, answer: CommandAnswer): EngineCorrelationTarget {
  const processInstanceId = member(member(resolution, "target"), "processInstanceId");
  if (typeof processInstanceId !== "string" || answer.chain === null) {
    throw new TypeError("a delivered publication names its target and its chain");
  }
  return { processInstanceId, locator: engineProcessLocatorForWorkflowId(answer.chain) };
}

function code(resolution: JsonValue): string {
  const value = member(resolution, "code");
  if (typeof value !== "string") throw new TypeError("a refused publication names its code");
  return value;
}

function engineResult(answer: CommandAnswer): EngineCorrelatedMessageResult {
  const resolution = answer.resolution;
  const ingressOrdinal = answer.ordinal;
  const unmatched = (failure: EngineFailure): EngineCorrelatedMessageResult =>
    ({ status: EngineCorrelatedMessageStatus.Rejected, ingressOrdinal, target: null, failure });
  const kind = member(resolution, "kind");
  switch (kind) {
    case "committed":
      return { status: EngineCorrelatedMessageStatus.Delivered, ingressOrdinal, target: target(resolution, answer) };
    case "failed":
      return {
        status: EngineCorrelatedMessageStatus.Rejected,
        ingressOrdinal,
        target: target(resolution, answer),
        failure: { code: code(resolution), evidence: `The matching instance refused the delivery (${String(member(resolution, "outcome"))}).` },
      };
    case "noMatch":
      return unmatched({ code: engineNotCorrelatedCode, evidence: "No open wait of the definition matches the publication." });
    case "ambiguous":
      return unmatched({ code: engineCorrelationAmbiguousCode, evidence: "Several open waits of the definition match the publication." });
    case "rejected":
      if (code(resolution) === contentMismatchCode) return { status: EngineCorrelatedMessageStatus.IdentityConflict };
      return unmatched({ code: code(resolution), evidence: "The population rejected the publication." });
    case "unsupported":
      return unmatched({ code: code(resolution), evidence: "The profile does not support the publication's criteria." });
  }
  throw new TypeError(`an executions-only publication does not answer ${String(kind)}`);
}
