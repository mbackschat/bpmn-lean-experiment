import {
  CanonicalObservationKind,
  ProcessStatus,
  SemanticProcessCompilerId,
  StimulusKind,
  isSourceOverlayIdentityOrNull,
  isCorrelatedMessageAddress,
  isVariablePatch,
  isWellFormedWireString,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";

import {
  MessageDeliveryResolutionKind,
  CorrelationRegistrationFailureKind,
  ProcessCommandResultKind,
  processTerminalReceiptFormatV1,
} from "./contracts.js";
import type {
  CancelledProcessReceipt,
  CompletedProcessReceipt,
  MessageDeliveryRecord,
  ProcessCommandResult,
  TerminalProcessReceipt,
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
    !isPlainDataTree(value) ||
    !isRecord(value) ||
    !isWellFormedStimulus(value.stimulus) ||
    (
      value.stimulus.kind !== StimulusKind.DeliverMessage &&
      value.stimulus.kind !== StimulusKind.DeliverPayloadMessage
    )
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
    case MessageDeliveryResolutionKind.CorrelationRegistrationFailed:
      return value.stimulus.kind === StimulusKind.DeliverPayloadMessage &&
        hasOnlyKeys(value, ["kind", "stimulus", "failure"]) &&
        isRecord(value.failure) &&
        hasOnlyKeys(value.failure, ["kind", "address", "transactionId"]) &&
        (
          value.failure.kind ===
            CorrelationRegistrationFailureKind.CandidateCapacity ||
          value.failure.kind ===
            CorrelationRegistrationFailureKind.AddressQuarantined
        ) &&
        isCorrelatedMessageAddress(value.failure.address) &&
        value.failure.transactionId === value.stimulus.commandId;
    default:
      return false;
  }
}

export function isCompletedProcessReceipt(
  value: unknown,
): value is CompletedProcessReceipt {
  return isProcessReceiptWithStatus(value, ProcessStatus.Completed);
}

export function isCancelledProcessReceipt(
  value: unknown,
): value is CancelledProcessReceipt {
  return isProcessReceiptWithStatus(value, ProcessStatus.Cancelled);
}

export function isTerminalProcessReceipt(
  value: unknown,
): value is TerminalProcessReceipt {
  return isCompletedProcessReceipt(value) || isCancelledProcessReceipt(value);
}

function isProcessReceiptWithStatus(
  value: unknown,
  status: ProcessStatus.Completed | ProcessStatus.Cancelled,
): boolean {
  if (!isPlainDataTree(value) || !isRecord(value) || !hasOnlyKeys(value, [
    "format",
    "definition",
    "processId",
    "processInstanceId",
    "finalState",
  ]) || value.format !== processTerminalReceiptFormatV1) {
    return false;
  }
  const definition = value.definition;
  const finalState = value.finalState;
  const hasMultiInstances = isRecord(finalState) &&
    Object.hasOwn(finalState, "openMultiInstances");
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
      "openIncidents",
      ...(hasMultiInstances ? ["openMultiInstances"] : []),
      "variables",
      "enabledInteractions",
      "logicalTimeMs",
    ]) &&
    finalState.kind === CanonicalObservationKind.State &&
    finalState.instanceId === value.processInstanceId &&
    finalState.status === status &&
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
    Array.isArray(finalState.openIncidents) &&
    finalState.openIncidents.length === 0 &&
    (!hasMultiInstances ||
      (Array.isArray(finalState.openMultiInstances) &&
        finalState.openMultiInstances.length === 0)) &&
    isVariablePatch(finalState.variables) &&
    Array.isArray(finalState.enabledInteractions) &&
    finalState.enabledInteractions.length === 0 &&
    Number.isSafeInteger(finalState.logicalTimeMs) &&
    Number(finalState.logicalTimeMs) >= 0
  );
}

export type LegacyTerminalProcessReceiptNormalization = Readonly<{
  receipt: TerminalProcessReceipt;
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>;
}>;

/** Decode-only seam for the exact pre-v1 Workflow result shape. */
export function normalizeLegacyTerminalProcessReceipt(
  value: unknown,
): LegacyTerminalProcessReceiptNormalization | null {
  if (!isPlainDataTree(value) || !isRecord(value) || !hasOnlyKeys(value, [
    "definition",
    "processId",
    "processInstanceId",
    "finalState",
    "messageDeliveryRecords",
  ]) || !Array.isArray(value.messageDeliveryRecords) ||
    !value.messageDeliveryRecords.every(isMessageDeliveryRecord)) {
    return null;
  }
  const candidate = {
    format: processTerminalReceiptFormatV1,
    definition: value.definition,
    processId: value.processId,
    processInstanceId: value.processInstanceId,
    finalState: value.finalState,
  };
  if (!isTerminalProcessReceipt(candidate)) {
    return null;
  }
  return {
    receipt: candidate,
    messageDeliveryRecords: value.messageDeliveryRecords,
  };
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

export function requireTerminalProcessReceipt(
  value: unknown,
): TerminalProcessReceipt {
  if (!isTerminalProcessReceipt(value)) {
    throw new TypeError(
      "Temporal Workflow returned a malformed terminal Process receipt",
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
  return isWellFormedWireString(value) && value.length > 0;
}

function isPlainDataTree(
  value: unknown,
  ancestors: Set<object> = new Set<object>(),
): boolean {
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case "boolean":
    case "number":
    case "string":
      return true;
    case "object": {
      if (ancestors.has(value)) {
        return false;
      }
      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          const ownKeys = Reflect.ownKeys(value);
          if (ownKeys.length !== value.length + 1 ||
            ownKeys.some((key) => typeof key !== "string") ||
            !ownKeys.includes("length")) {
            return false;
          }
          for (let index = 0; index < value.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(
              value,
              String(index),
            );
            if (descriptor === undefined || !descriptor.enumerable ||
              !("value" in descriptor) ||
              !isPlainDataTree(descriptor.value, ancestors)) {
              return false;
            }
          }
          return true;
        }
        const prototype = Object.getPrototypeOf(value) as object | null;
        if (prototype !== Object.prototype && prototype !== null) {
          return false;
        }
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key !== "string") {
            return false;
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (descriptor === undefined || !descriptor.enumerable ||
            !("value" in descriptor) ||
            !isPlainDataTree(descriptor.value, ancestors)) {
            return false;
          }
        }
        return true;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      return false;
  }
}
