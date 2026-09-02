/** Stable transport names and deterministic identities for the incident report/retry host seam. */
import {
  ProcessStatus,
  StimulusKind,
  compareCanonicalStrings,
  isWellFormedWireString,
  openEffectIncidentAssociationIsValid,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessInteraction,
  CommandOutcome,
  CancelIncidentProcessStimulus,
  DeepReadonly,
  EffectOccurrenceId,
  OpenEffectIncident,
  ReportEffectFailureStimulus,
  RetryIncidentInteraction,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnRetryEffectIncidentUpdateName =
  "bpmn-retry-effect-incident";
export const bpmnCancelIncidentProcessUpdateName =
  "bpmn-cancel-incident-process";
export const bpmnIncidentOperationsQueryName =
  "bpmn-incident-operations";

/** One exact open incident paired with its complete ordered command surface. */
export type TemporalIncidentOperationsIncident = DeepReadonly<{
  incident: OpenEffectIncident;
  interactions:
    | [RetryIncidentInteraction]
    | [RetryIncidentInteraction, CancelIncidentProcessInteraction];
}>;

/** The closed private current-state result returned by every hosted profile. */
export type TemporalIncidentOperationsSnapshot =
  | null
  | DeepReadonly<{
      instanceId: string;
      status: ProcessStatus.Running;
      incidents: TemporalIncidentOperationsIncident[];
    }>
  | DeepReadonly<{
      instanceId: string;
      status:
        | ProcessStatus.Completed
        | ProcessStatus.Cancelled
        | ProcessStatus.Failed;
      incidents: [];
    }>;

/** Accepts only exact, canonically ordered snapshots without private or unsupported fields. */
export function isTemporalIncidentOperationsSnapshot(
  value: unknown,
): value is TemporalIncidentOperationsSnapshot {
  if (value === null) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["instanceId", "status", "incidents"]) ||
    !isNonEmptyWireString(value.instanceId) ||
    !Array.isArray(value.incidents)
  ) {
    return false;
  }
  switch (value.status) {
    case ProcessStatus.Completed:
    case ProcessStatus.Cancelled:
    case ProcessStatus.Failed:
      return value.incidents.length === 0;
    case ProcessStatus.Running:
      return isCanonicalIncidentOperations(
        value.instanceId,
        value.incidents,
      );
    default:
      return false;
  }
}

/** Returns the strict snapshot or fails before a Product 1 client can interpret malformed data. */
export function requireTemporalIncidentOperationsSnapshot(
  value: unknown,
): TemporalIncidentOperationsSnapshot {
  if (!isTemporalIncidentOperationsSnapshot(value)) {
    throw new TypeError(
      "Temporal Workflow returned a malformed incident-operations snapshot",
    );
  }
  return value;
}

export type BpmnRetryEffectIncidentUpdateArguments = [
  stimulus: RetryIncidentStimulus,
];

export type BpmnRetryEffectIncidentUpdateResult = CommandOutcome;

export type BpmnCancelIncidentProcessUpdateArguments = [
  stimulus: CancelIncidentProcessStimulus,
];

export type BpmnCancelIncidentProcessUpdateResult = CommandOutcome;

export function reportEffectFailureCommandId(
  effectId: EffectOccurrenceId,
): string {
  const encoded = canonicalTypedTupleEncoding([
    StimulusKind.ReportEffectFailure,
    [
      effectId.processInstanceId,
      effectId.elementId,
      effectId.activation,
    ],
    1,
  ]);
  return `report-effect-failure-sha256:${deterministicSha256Hex(encoded)}`;
}

export function reportEffectFailureStimulus(
  effectId: EffectOccurrenceId,
): ReportEffectFailureStimulus {
  return {
    kind: StimulusKind.ReportEffectFailure,
    commandId: reportEffectFailureCommandId(effectId),
    effectId,
    generation: 1,
  };
}

function isCanonicalIncidentOperations(
  instanceId: string,
  value: ReadonlyArray<unknown>,
): boolean {
  let previous: OpenEffectIncident | undefined;
  for (const candidate of value) {
    if (!isIncidentOperationsIncident(candidate, instanceId)) {
      return false;
    }
    if (
      previous !== undefined &&
      compareIncidentIds(previous, candidate.incident) >= 0
    ) {
      return false;
    }
    previous = candidate.incident;
  }
  return true;
}

function isIncidentOperationsIncident(
  value: unknown,
  instanceId: string,
): value is TemporalIncidentOperationsIncident {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["incident", "interactions"]) ||
    !isOpenEffectIncident(value.incident, instanceId) ||
    !Array.isArray(value.interactions) ||
    (value.interactions.length !== 1 && value.interactions.length !== 2)
  ) {
    return false;
  }
  const retry = value.interactions[0];
  if (
    !isRecord(retry) ||
    !hasOnlyKeys(retry, ["kind", "incidentId"]) ||
    retry.kind !== StimulusKind.RetryIncident ||
    !isSameIncidentId(retry.incidentId, value.incident.id)
  ) {
    return false;
  }
  const cancellation = value.interactions[1];
  return cancellation === undefined ||
    (
      isRecord(cancellation) &&
      hasOnlyKeys(cancellation, ["kind", "processInstanceId", "incidentId"]) &&
      cancellation.kind === StimulusKind.CancelIncidentProcess &&
      cancellation.processInstanceId === instanceId &&
      isSameIncidentId(cancellation.incidentId, value.incident.id)
    );
}

function isOpenEffectIncident(
  value: unknown,
  instanceId: string,
): value is OpenEffectIncident {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "id", "effect"]) ||
    value.kind !== "effectExecutionFailed" ||
    !isEffectIncidentId(value.id) ||
    !isRecord(value.effect) ||
    !hasOnlyKeys(value.effect, ["id", "descriptor", "arguments"]) ||
    !isOccurrenceId(value.effect.id) ||
    !isEffectDescriptor(value.effect.descriptor) ||
    !Array.isArray(value.effect.arguments) ||
    value.effect.arguments.length !== 0 ||
    value.effect.id.processInstanceId !== instanceId
  ) {
    return false;
  }
  return openEffectIncidentAssociationIsValid(value as OpenEffectIncident);
}

function isSameIncidentId(
  value: unknown,
  expected: OpenEffectIncident["id"],
): boolean {
  return isEffectIncidentId(value) &&
    value.generation === expected.generation &&
    value.effectId.processInstanceId === expected.effectId.processInstanceId &&
    value.effectId.elementId === expected.effectId.elementId &&
    value.effectId.activation === expected.effectId.activation;
}

function isEffectIncidentId(
  value: unknown,
): value is OpenEffectIncident["id"] {
  return isRecord(value) &&
    hasOnlyKeys(value, ["effectId", "generation"]) &&
    isOccurrenceId(value.effectId) &&
    value.generation === 1;
}

function isOccurrenceId(
  value: unknown,
): value is OpenEffectIncident["id"]["effectId"] {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "elementId", "activation"]) &&
    isNonEmptyWireString(value.processInstanceId) &&
    isNonEmptyWireString(value.elementId) &&
    Number.isSafeInteger(value.activation) &&
    Number(value.activation) >= 1;
}

function isEffectDescriptor(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["protocol", "operation"]) &&
    isNonEmptyWireString(value.protocol) &&
    isNonEmptyWireString(value.operation);
}

function compareIncidentIds(
  left: OpenEffectIncident,
  right: OpenEffectIncident,
): number {
  const process = compareCanonicalStrings(
    left.id.effectId.processInstanceId,
    right.id.effectId.processInstanceId,
  );
  if (process !== 0) {
    return process;
  }
  const element = compareCanonicalStrings(
    left.id.effectId.elementId,
    right.id.effectId.elementId,
  );
  return element !== 0
    ? element
    : left.id.effectId.activation - right.id.effectId.activation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key));
}

function isNonEmptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}
