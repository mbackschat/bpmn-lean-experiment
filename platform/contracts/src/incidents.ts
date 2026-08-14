import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { IncidentAuditPage } from "./incident-audit.js";
import type {
  IncidentActionApiErrorResponse,
  IncidentAuditApiErrorResponse,
  IncidentDetailApiErrorResponse,
  IncidentListApiErrorResponse,
} from "./incident-errors.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Exact semantic identity of one engine-published effect occurrence. */
export type PublicEffectOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

/** Exact identity of the only currently admitted incident generation. */
export type PublicEffectIncidentId = DeepReadonly<{
  effectId: PublicEffectOccurrenceId;
  generation: 1;
}>;

/** Exact payload-free failed effect published by the engine. */
export type PublicEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: PublicEffectIncidentId;
  effect: {
    id: PublicEffectOccurrenceId;
    descriptor: { protocol: string; operation: string };
    arguments: [];
  };
}>;

export type PublicRetryIncidentInteraction = DeepReadonly<{
  kind: "retryIncident";
  incidentId: PublicEffectIncidentId;
}>;

export type PublicCancelIncidentProcessInteraction = DeepReadonly<{
  kind: "cancelIncidentProcess";
  processInstanceId: string;
  incidentId: PublicEffectIncidentId;
}>;

export type IncidentActionRequest =
  | PublicRetryIncidentInteraction
  | PublicCancelIncidentProcessInteraction;

/** One exact current incident and only its engine-published interactions. */
export type PublicIncident = DeepReadonly<{
  hostingInstance: PublicProcessInstanceIdentity;
  incident: PublicEffectIncident;
  availableInteractions:
    | [PublicRetryIncidentInteraction]
    | [PublicRetryIncidentInteraction, PublicCancelIncidentProcessInteraction];
}>;

export type PublicIncidentSnapshot = DeepReadonly<{
  incidents: PublicIncident[];
}>;

export type IncidentActionResult =
  | DeepReadonly<{
      state: "committed";
      actionId: string;
      interaction: IncidentActionRequest;
    }>
  | DeepReadonly<{
      state: "rejected";
      actionId: string;
      interaction: IncidentActionRequest;
      engineResult:
        | {
            kind: "semantic";
            outcome: "rolledBack" | "rejected" | "semanticFailure" | "unsupported";
          }
        | {
            kind: "processClosed";
            status: "completed" | "cancelled";
          };
    }>
  | DeepReadonly<{
      state: "indeterminate";
      actionId: string;
      interaction: IncidentActionRequest;
    }>;

export type IncidentListApiResponse =
  | PublicIncidentSnapshot
  | IncidentListApiErrorResponse;
export type IncidentDetailApiResponse =
  | PublicIncident
  | IncidentDetailApiErrorResponse;
export type IncidentActionApiResponse =
  | IncidentActionResult
  | IncidentActionApiErrorResponse;
export type IncidentAuditApiResponse =
  | IncidentAuditPage
  | IncidentAuditApiErrorResponse;

/** Canonical aggregate order over exact Unicode scalar identities. */
export function comparePublicIncidents(
  left: PublicIncident,
  right: PublicIncident,
): number {
  return compareUnicodeScalars(
    left.hostingInstance.processInstanceId,
    right.hostingInstance.processInstanceId,
  ) || compareUnicodeScalars(
    left.incident.id.effectId.processInstanceId,
    right.incident.id.effectId.processInstanceId,
  ) || compareUnicodeScalars(
    left.incident.id.effectId.elementId,
    right.incident.id.effectId.elementId,
  ) || left.incident.id.effectId.activation - right.incident.id.effectId.activation ||
    left.incident.id.generation - right.incident.id.generation;
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftScalars[index]?.codePointAt(0);
    const rightCodePoint = rightScalars[index]?.codePointAt(0);
    if (leftCodePoint !== rightCodePoint) {
      return Number(leftCodePoint) - Number(rightCodePoint);
    }
  }
  return leftScalars.length - rightScalars.length;
}
