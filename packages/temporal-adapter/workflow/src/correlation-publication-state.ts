import {
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  canonicalCorrelationPublicationLedgerRecordEncoding,
  canonicalCorrelationPublicationQueueEncoding,
  requireCorrelationPublicationLedgerRecord,
  requireCorrelationPublicationQueueRecord,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationIngressConfiguration,
  CorrelationPublicationState,
  CorrelationPublicationStoredResolution,
  CorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";

enum CorrelationPublicationLedgerSequencePhase {
  SettledPrefix = "settledPrefix",
  InFlight = "inFlight",
  QueuedSuffix = "queuedSuffix",
}

/** Validates the complete durable publication ledger, FIFO projection, and in-flight binding. */
export function requireCorrelationPublicationState(
  stateValue: unknown,
  configuration: CorrelationIngressConfiguration,
): CorrelationPublicationState {
  if (!isRecordWithExactKeys(stateValue, [
    "nextOrdinal",
    "queue",
    "ledger",
    "inFlight",
  ])) {
    invalidState("Correlation publication state is malformed");
  }
  const state = stateValue as unknown as CorrelationPublicationState;
  if (!Number.isSafeInteger(state.nextOrdinal) || state.nextOrdinal < 1 ||
    !Array.isArray(state.queue) ||
    !Array.isArray(state.ledger) ||
    !(state.inFlight === null || isRecordWithExactKeys(state.inFlight, [
      "commandId",
      "contentSha256",
      "ordinal",
      "payload",
      "target",
    ]))) {
    invalidState("Correlation publication state is malformed");
  }
  if (state.queue.length > configuration.maxQueuedPublicationRecords ||
    utf8ByteLength(canonicalCorrelationPublicationQueueEncoding(state.queue)) >
      configuration.maxQueuedPublicationCanonicalBytes ||
    state.ledger.length > configuration.maxPublicationLedgerRecords ||
    state.ledger.length * configuration.publicationLedgerRecordBytes >
      configuration.maxPublicationLedgerChargedBytes) {
    invalidState("Retained correlation publication state exceeds capacity");
  }

  const commandIds = new Set<string>();
  let expectedOrdinal = 1;
  let sequencePhase = CorrelationPublicationLedgerSequencePhase.SettledPrefix;
  for (const recordValue of state.ledger) {
    const record = requireCorrelationPublicationLedgerRecord(recordValue);
    if (commandIds.has(record.commandId)) {
      invalidState("Correlation publication command identity is duplicated");
    }
    commandIds.add(record.commandId);
    if (utf8ByteLength(canonicalCorrelationPublicationLedgerRecordEncoding(record)) >
      configuration.publicationLedgerRecordBytes) {
      invalidState("A publication exceeds its fixed ledger reservation");
    }
    switch (record.phase) {
      case CorrelationPublicationLedgerPhase.Queued:
        if (record.ordinal !== null ||
          record.target !== null ||
          record.resolution !== null) {
          invalidState("A queued publication already has an ordinal, target, or resolution");
        }
        sequencePhase = CorrelationPublicationLedgerSequencePhase.QueuedSuffix;
        break;
      case CorrelationPublicationLedgerPhase.InFlight:
        if (record.ordinal === null || record.resolution !== null) {
          invalidState("An in-flight publication has no reserved ordinal");
        }
        if (sequencePhase !== CorrelationPublicationLedgerSequencePhase.SettledPrefix ||
          record.ordinal !== expectedOrdinal) {
          invalidState("In-flight publication does not follow the settled ledger prefix");
        }
        sequencePhase = CorrelationPublicationLedgerSequencePhase.InFlight;
        expectedOrdinal += 1;
        break;
      case CorrelationPublicationLedgerPhase.Settled:
        if (record.ordinal === null || record.resolution === null) {
          invalidState("A settled publication retained no resolution");
        }
        if (!correlationPublicationResolutionMatchesTarget(
          record.resolution,
          record.target,
        )) {
          invalidState("A settled publication resolution disagrees with its target");
        }
        if (sequencePhase !== CorrelationPublicationLedgerSequencePhase.SettledPrefix ||
          record.ordinal !== expectedOrdinal) {
          invalidState("Settled publication order is not the ledger prefix");
        }
        expectedOrdinal += 1;
        break;
      default:
        assertNever(record.phase);
    }
  }
  if (state.nextOrdinal !== expectedOrdinal) {
    invalidState("Correlation publication ordinals are not contiguous");
  }

  const queuedLedger = state.ledger.filter(
    (record) => record.phase === CorrelationPublicationLedgerPhase.Queued,
  );
  if (queuedLedger.length !== state.queue.length ||
    state.queue.some((queueRecordValue, index) => {
      const queueRecord = requireCorrelationPublicationQueueRecord(queueRecordValue);
      const ledgerRecord = queuedLedger[index];
      return ledgerRecord === undefined ||
        queueRecord.commandId !== ledgerRecord.commandId ||
        queueRecord.contentSha256 !== ledgerRecord.contentSha256;
    })) {
    invalidState("Correlation publication queue is not the ledger's FIFO projection");
  }

  const inFlightLedger = state.ledger.filter(
    (record) => record.phase === CorrelationPublicationLedgerPhase.InFlight,
  );
  if (state.inFlight === null) {
    if (inFlightLedger.length !== 0) {
      invalidState("An in-flight ledger reservation has no payload record");
    }
    return state;
  }
  if (configuration.maxInFlightPublications !== 1 ||
    inFlightLedger.length !== 1) {
    invalidState("Correlation publication state exceeds its in-flight bound");
  }
  const inFlight = state.inFlight;
  requireCorrelationPublicationQueueRecord({
    commandId: inFlight.commandId,
    contentSha256: inFlight.contentSha256,
    payload: inFlight.payload,
  });
  const ledgerRecord = inFlightLedger[0];
  if (ledgerRecord === undefined ||
    ledgerRecord.commandId !== inFlight.commandId ||
    ledgerRecord.contentSha256 !== inFlight.contentSha256 ||
    ledgerRecord.ordinal !== inFlight.ordinal ||
    !sameNullableCorrelationPublicationTarget(
      ledgerRecord.target,
      inFlight.target,
    )) {
    invalidState("The in-flight payload is not bound to its ledger reservation");
  }
  return state;
}

export function correlationPublicationResolutionMatchesTarget(
  resolution: CorrelationPublicationStoredResolution,
  target: CorrelationPublicationTarget | null,
): boolean {
  switch (resolution.kind) {
    case CorrelationPublicationStoredResolutionKind.Semantic:
      switch (resolution.outcome.kind) {
        case CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch:
        case CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous:
          return target === null;
        case CorrelationPublicationSemanticOutcomeKind.Committed:
          return target !== null && sameCorrelationPublicationTarget(
            resolution.outcome.target,
            target,
          );
      }
      break;
    case CorrelationPublicationStoredResolutionKind.TargetInconsistent:
      return target !== null && sameCorrelationPublicationTarget(
        resolution.target,
        target,
      );
  }
}

export function sameNullableCorrelationPublicationTarget(
  left: CorrelationPublicationTarget | null,
  right: CorrelationPublicationTarget | null,
): boolean {
  return left === null
    ? right === null
    : right !== null && sameCorrelationPublicationTarget(left, right);
}

export function sameCorrelationPublicationTarget(
  left: CorrelationPublicationTarget,
  right: CorrelationPublicationTarget,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.subscriptionId.processInstanceId ===
      right.subscriptionId.processInstanceId &&
    left.subscriptionId.elementId === right.subscriptionId.elementId &&
    left.subscriptionId.activation === right.subscriptionId.activation;
}

function invalidState(message: string): never {
  throw new TypeError(message);
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: ReadonlyArray<Key>,
): value is Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation publication phase: ${String(value)}`);
}
