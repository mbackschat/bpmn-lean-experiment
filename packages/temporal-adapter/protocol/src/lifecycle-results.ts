import {
  CanonicalObservationKind,
  ProcessStatus,
  SemanticProcessCompilerId,
  StimulusKind,
  isSourceOverlayIdentityOrNull,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";

import {
  MessageDeliveryResolutionKind,
  ProcessCommandResultKind,
} from "./contracts.js";
import type {
  CompletedProcessReceipt,
  MessageDeliveryRecord,
  ProcessCommandResult,
} from "./contracts.js";

export function semanticCommandResult(
  commandId: string,
  outcome: CommandOutcome,
): ProcessCommandResult {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome,
  };
}

export function isMessageDeliveryRecord(
  value: unknown,
): value is MessageDeliveryRecord {
  if (
    !isRecord(value) ||
    !isWellFormedStimulus(value.stimulus) ||
    value.stimulus.kind !== StimulusKind.DeliverMessage
  ) {
    return false;
  }
  switch (value.kind) {
    case MessageDeliveryResolutionKind.Semantic:
      return hasOnlyKeys(value, ["kind", "stimulus", "outcome"]) &&
        isCommandOutcome(value.outcome);
    case MessageDeliveryResolutionKind.RequestFailure:
      return hasOnlyKeys(value, ["kind", "stimulus", "failure"]) &&
        value.failure === "commandIdentityConflict";
    default:
      return false;
  }
}

export function isCompletedProcessReceipt(
  value: unknown,
): value is CompletedProcessReceipt {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "definition",
    "processId",
    "processInstanceId",
    "finalState",
    "messageDeliveryRecords",
  ])) {
    return false;
  }
  const definition = value.definition;
  const finalState = value.finalState;
  return (
    isRecord(definition) &&
    hasOnlyKeys(definition, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
      "sourceOverlay",
    ]) &&
    definition.compiler ===
      SemanticProcessCompilerId.BpmnSourceSemanticProcess &&
    isNonEmptyString(definition.semanticProfile) &&
    isNonEmptyString(definition.sourceId) &&
    typeof definition.sourceSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(definition.sourceSha256) &&
    isSourceOverlayIdentityOrNull(definition.sourceOverlay) &&
    isNonEmptyString(value.processId) &&
    isNonEmptyString(value.processInstanceId) &&
    isRecord(finalState) &&
    hasOnlyKeys(finalState, [
      "kind",
      "instanceId",
      "status",
      "activeWaits",
      "openUserTasks",
      "openMessageSubscriptions",
      "openTimers",
      "openEffects",
      "variables",
      "enabledInteractions",
      "logicalTimeMs",
    ]) &&
    finalState.kind === CanonicalObservationKind.State &&
    finalState.instanceId === value.processInstanceId &&
    finalState.status === ProcessStatus.Completed &&
    Array.isArray(finalState.activeWaits) &&
    finalState.activeWaits.length === 0 &&
    Array.isArray(finalState.openUserTasks) &&
    finalState.openUserTasks.length === 0 &&
    Array.isArray(finalState.openMessageSubscriptions) &&
    finalState.openMessageSubscriptions.length === 0 &&
    Array.isArray(finalState.openTimers) &&
    finalState.openTimers.length === 0 &&
    Array.isArray(finalState.openEffects) &&
    finalState.openEffects.length === 0 &&
    Array.isArray(finalState.variables) &&
    Array.isArray(finalState.enabledInteractions) &&
    finalState.enabledInteractions.length === 0 &&
    Array.isArray(value.messageDeliveryRecords) &&
    value.messageDeliveryRecords.every(isMessageDeliveryRecord) &&
    Number.isSafeInteger(finalState.logicalTimeMs) &&
    Number(finalState.logicalTimeMs) >= 0
  );
}

export function requireCompletedProcessReceipt(
  value: unknown,
): CompletedProcessReceipt {
  if (!isCompletedProcessReceipt(value)) {
    throw new TypeError(
      "Temporal Workflow returned a malformed completed Process receipt",
    );
  }
  return value;
}

function isCommandOutcome(value: unknown): value is CommandOutcome {
  return typeof value === "string" &&
    (
      value === "committed" ||
      value === "rolledBack" ||
      value === "rejected" ||
      value === "semanticFailure" ||
      value === "unsupported"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
