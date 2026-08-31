import {
  sameCorrelatedMessageAddress,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  defineQuery,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

import {
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationCapacityKind,
  CorrelationPublicationCapacityMeasure,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationPublicationCapacityFailureType,
  bpmnCorrelationPublicationIdentityConflictFailureType,
  bpmnCorrelationPublicationInvalidFailureType,
  bpmnCorrelationPublicationStatusQueryName,
  canonicalCorrelationPublicationLedgerRecordEncoding,
  canonicalCorrelationPublicationQueueEncoding,
  correlationPublicationContentSha256,
  requireCorrelationPublicationCommand,
  requireCorrelationPublicationLedgerRecord,
  requireCorrelationPublicationQueueRecord,
  requireCorrelationPublicationStoredResolution,
  requireCorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnAdmitCorrelationPublicationUpdateArguments,
  BpmnCorrelationPublicationStatusQueryArguments,
  CorrelationIngressConfiguration,
  CorrelationPublicationAdmissionResult,
  CorrelationPublicationCapacityFailure,
  CorrelationPublicationCommand,
  CorrelationPublicationInFlightRecord,
  CorrelationPublicationLedgerRecord,
  CorrelationPublicationOrderResult,
  CorrelationPublicationSettlement,
  CorrelationPublicationState,
  CorrelationPublicationStatus,
  CorrelationPublicationStoredResolution,
  CorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";

export enum CorrelationPublicationFaultCode {
  IdentityConflict = "identityConflict",
  Capacity = "capacity",
  Invalid = "invalid",
}

export class CorrelationPublicationFault extends Error {
  constructor(
    readonly code: CorrelationPublicationFaultCode,
    message: string,
    readonly capacity: CorrelationPublicationCapacityFailure | null = null,
  ) {
    super(message);
    this.name = "CorrelationPublicationFault";
  }
}

export type CorrelationPublicationAdmissionTransition = Readonly<{
  state: CorrelationPublicationState;
  result: CorrelationPublicationAdmissionResult;
}>;

export type CorrelationPublicationOrderTransition = Readonly<{
  state: CorrelationPublicationState;
  result: CorrelationPublicationOrderResult;
}>;

export const bpmnAdmitCorrelationPublicationUpdate: ReturnType<
  typeof defineUpdate<
    CorrelationPublicationAdmissionResult,
    BpmnAdmitCorrelationPublicationUpdateArguments
  >
> = defineUpdate<
  CorrelationPublicationAdmissionResult,
  BpmnAdmitCorrelationPublicationUpdateArguments
>(bpmnAdmitCorrelationPublicationUpdateName);

export const bpmnCorrelationPublicationStatusQuery: ReturnType<
  typeof defineQuery<
    CorrelationPublicationStatus,
    BpmnCorrelationPublicationStatusQueryArguments
  >
> = defineQuery<
  CorrelationPublicationStatus,
  BpmnCorrelationPublicationStatusQueryArguments
>(bpmnCorrelationPublicationStatusQueryName);

export function emptyCorrelationPublicationState(): CorrelationPublicationState {
  return {
    nextOrdinal: 1,
    queue: [],
    ledger: [],
    inFlight: null,
  };
}

export function admitCorrelationPublication(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  commandValue: CorrelationPublicationCommand,
  quarantinedTargetValue: CorrelationPublicationTarget | null = null,
): CorrelationPublicationAdmissionTransition {
  requireCorrelationPublicationState(state, configuration);
  const command = requireAddressedCommand(commandValue, address);
  const contentSha256 = correlationPublicationContentSha256(command);
  const retained = state.ledger.find(
    (record) => record.commandId === command.commandId,
  );
  if (retained !== undefined) {
    if (retained.contentSha256 !== contentSha256) {
      throw new CorrelationPublicationFault(
        CorrelationPublicationFaultCode.IdentityConflict,
        `Correlation publication ${command.commandId} was reused with different content`,
      );
    }
    return {
      state,
      result: admissionResult(
        CorrelationPublicationAdmissionResultKind.Retained,
        retained,
      ),
    };
  }
  if (quarantinedTargetValue !== null) {
    return {
      state,
      result: {
        kind: CorrelationPublicationAdmissionResultKind.AddressQuarantined,
        commandId: command.commandId,
        target: requireCorrelationPublicationTarget(quarantinedTargetValue),
      },
    };
  }

  const queueRecord = {
    commandId: command.commandId,
    contentSha256,
    payload: command.payload,
  } as const;
  const capacity = correlationPublicationCapacityFailure(
    state,
    queueRecord,
    configuration,
  );
  if (capacity !== null) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Capacity,
      `Correlation ${capacity.kind} exceeds its ${capacity.measure} bound`,
      capacity,
    );
  }
  const ledgerRecord: CorrelationPublicationLedgerRecord = {
    commandId: command.commandId,
    contentSha256,
    phase: CorrelationPublicationLedgerPhase.Queued,
    ordinal: null,
    target: null,
    resolution: null,
  };
  const reservationBytes = utf8ByteLength(
    canonicalCorrelationPublicationLedgerRecordEncoding(ledgerRecord),
  );
  if (reservationBytes > configuration.publicationLedgerRecordBytes) {
    const failure = {
      kind: CorrelationPublicationCapacityKind.PublicationLedger,
      measure: CorrelationPublicationCapacityMeasure.CanonicalBytes,
      configuredBound: configuration.publicationLedgerRecordBytes,
      observedValue: reservationBytes,
    } satisfies CorrelationPublicationCapacityFailure;
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Capacity,
      "Correlation publication reservation exceeds its fixed ledger record",
      failure,
    );
  }
  return {
    state: {
      nextOrdinal: state.nextOrdinal,
      queue: [...state.queue, queueRecord],
      ledger: [...state.ledger, ledgerRecord],
      inFlight: state.inFlight,
    },
    result: admissionResult(
      CorrelationPublicationAdmissionResultKind.Admitted,
      ledgerRecord,
    ),
  };
}

export function startNextCorrelationPublication(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): CorrelationPublicationOrderTransition {
  requireCorrelationPublicationState(state, configuration);
  if (state.inFlight !== null) {
    return {
      state,
      result: {
        kind: CorrelationPublicationOrderResultKind.Busy,
        commandId: state.inFlight.commandId,
        ordinal: state.inFlight.ordinal,
      },
    };
  }
  const queued = state.queue[0];
  if (queued === undefined) {
    return {
      state,
      result: { kind: CorrelationPublicationOrderResultKind.Idle },
    };
  }
  const ledgerIndex = state.ledger.findIndex(
    (record) => record.commandId === queued.commandId,
  );
  const ledgerRecord = state.ledger[ledgerIndex];
  if (ledgerRecord === undefined ||
    ledgerRecord.contentSha256 !== queued.contentSha256 ||
    ledgerRecord.phase !== CorrelationPublicationLedgerPhase.Queued) {
    invalidState("The publication queue head has no exact ledger reservation");
  }
  const command = requireAddressedCommand({
    commandId: queued.commandId,
    address,
    payload: queued.payload,
  }, address);
  if (correlationPublicationContentSha256(command) !== queued.contentSha256) {
    invalidState("The publication queue head changed its content identity");
  }
  if (!Number.isSafeInteger(state.nextOrdinal) || state.nextOrdinal < 1) {
    invalidState("The next correlation publication ordinal is invalid");
  }
  const ordinal = state.nextOrdinal;
  const inFlight = {
    commandId: queued.commandId,
    contentSha256: queued.contentSha256,
    ordinal,
    payload: queued.payload,
    target: null,
  } as const;
  const ledger = state.ledger.map((record, index) =>
    index === ledgerIndex
      ? {
          ...record,
          phase: CorrelationPublicationLedgerPhase.InFlight,
          ordinal,
        }
      : record
  );
  return {
    state: {
      nextOrdinal: ordinal + 1,
      queue: state.queue.slice(1),
      ledger,
      inFlight,
    },
    result: {
      kind: CorrelationPublicationOrderResultKind.Started,
      command,
      contentSha256: queued.contentSha256,
      ordinal,
    },
  };
}

export function reserveCorrelationPublicationTarget(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  commandId: string,
  ordinal: number,
  targetValue: CorrelationPublicationTarget,
): CorrelationPublicationState {
  requireCorrelationPublicationState(state, configuration);
  const target = requireCorrelationPublicationTarget(targetValue);
  const inFlight = state.inFlight;
  if (inFlight === null ||
    inFlight.commandId !== commandId ||
    inFlight.ordinal !== ordinal) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      "Correlation target does not identify the current publication ordinal",
    );
  }
  const command = requireAddressedCommand({
    commandId: inFlight.commandId,
    address,
    payload: inFlight.payload,
  }, address);
  if (correlationPublicationContentSha256(command) !== inFlight.contentSha256) {
    invalidState("The target reservation changed publication content identity");
  }
  if (inFlight.target !== null) {
    if (!sameCorrelationPublicationTarget(inFlight.target, target)) {
      throw new CorrelationPublicationFault(
        CorrelationPublicationFaultCode.Invalid,
        "Correlation publication target changed after selection",
      );
    }
    return state;
  }
  const ledgerIndex = state.ledger.findIndex(
    (record) => record.commandId === inFlight.commandId,
  );
  const current = state.ledger[ledgerIndex];
  if (current === undefined ||
    current.phase !== CorrelationPublicationLedgerPhase.InFlight ||
    current.ordinal !== inFlight.ordinal ||
    current.contentSha256 !== inFlight.contentSha256 ||
    current.target !== null ||
    current.resolution !== null) {
    invalidState("The selected target has no exact in-flight reservation");
  }
  const selected: CorrelationPublicationLedgerRecord = { ...current, target };
  if (utf8ByteLength(canonicalCorrelationPublicationLedgerRecordEncoding(selected)) >
    configuration.publicationLedgerRecordBytes) {
    invalidState("The selected target exceeds its fixed ledger reservation");
  }
  return {
    nextOrdinal: state.nextOrdinal,
    queue: state.queue,
    ledger: state.ledger.map((record, index) =>
      index === ledgerIndex ? selected : record
    ),
    inFlight: { ...inFlight, target },
  };
}

export function requireCorrelationPublicationSelectedTarget(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): CorrelationPublicationInFlightRecord & Readonly<{
  target: CorrelationPublicationTarget;
}> {
  requireCorrelationPublicationState(state, configuration);
  const inFlight = state.inFlight;
  if (inFlight === null || inFlight.target === null) {
    invalidState("Correlation publication has no selected in-flight target");
  }
  const command = requireAddressedCommand({
    commandId: inFlight.commandId,
    address,
    payload: inFlight.payload,
  }, address);
  if (correlationPublicationContentSha256(command) !== inFlight.contentSha256) {
    invalidState("Selected correlation publication changed content identity");
  }
  return { ...inFlight, target: inFlight.target };
}

export function settleCorrelationPublication(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  settlement: CorrelationPublicationSettlement,
): CorrelationPublicationOrderTransition {
  requireCorrelationPublicationState(state, configuration);
  const inFlight = state.inFlight;
  if (inFlight === null ||
    settlement.commandId !== inFlight.commandId ||
    settlement.ordinal !== inFlight.ordinal ||
    !Number.isSafeInteger(settlement.ordinal) ||
    settlement.ordinal < 1) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      "Correlation publication settlement does not identify the current ordinal",
    );
  }
  const command = requireAddressedCommand({
    commandId: inFlight.commandId,
    address,
    payload: inFlight.payload,
  }, address);
  if (correlationPublicationContentSha256(command) !== inFlight.contentSha256) {
    invalidState("The in-flight publication changed its content identity");
  }
  const resolution = requireCorrelationPublicationStoredResolution(
    settlement.resolution,
  );
  const ledgerIndex = state.ledger.findIndex(
    (record) => record.commandId === inFlight.commandId,
  );
  const current = state.ledger[ledgerIndex];
  if (current === undefined ||
    current.contentSha256 !== inFlight.contentSha256 ||
    current.phase !== CorrelationPublicationLedgerPhase.InFlight ||
    current.ordinal !== inFlight.ordinal ||
    !sameNullableCorrelationPublicationTarget(current.target, inFlight.target) ||
    current.resolution !== null) {
    invalidState("The in-flight publication has no exact reserved ledger record");
  }
  if (!resolutionMatchesTarget(resolution, inFlight.target)) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      "Correlation publication resolution disagrees with its selected target",
    );
  }
  const settled: CorrelationPublicationLedgerRecord = {
    ...current,
    phase: CorrelationPublicationLedgerPhase.Settled,
    resolution,
  };
  if (utf8ByteLength(canonicalCorrelationPublicationLedgerRecordEncoding(settled)) >
    configuration.publicationLedgerRecordBytes) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      "Correlation publication settlement exceeds its reserved ledger record",
    );
  }
  return {
    state: {
      nextOrdinal: state.nextOrdinal,
      queue: state.queue,
      ledger: state.ledger.map((record, index) =>
        index === ledgerIndex ? settled : record
      ),
      inFlight: null,
    },
    result: {
      kind: CorrelationPublicationOrderResultKind.Settled,
      commandId: settlement.commandId,
      ordinal: settlement.ordinal,
    },
  };
}

export function correlationPublicationStatus(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  commandValue: CorrelationPublicationCommand,
): CorrelationPublicationStatus {
  requireCorrelationPublicationState(state, configuration);
  const command = requireAddressedCommand(commandValue, address);
  const contentSha256 = correlationPublicationContentSha256(command);
  const record = state.ledger.find(
    (candidate) => candidate.commandId === command.commandId,
  );
  if (record === undefined) {
    return {
      kind: CorrelationPublicationStatusKind.Absent,
      commandId: command.commandId,
      contentSha256,
    };
  }
  if (record.contentSha256 !== contentSha256) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.IdentityConflict,
      `Correlation publication ${command.commandId} was reused with different content`,
    );
  }
  return {
    kind: CorrelationPublicationStatusKind.Accepted,
    record,
  };
}

export function registerCorrelationPublicationHandlers(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  currentState: () => CorrelationPublicationState,
  replaceState: (state: CorrelationPublicationState) => void,
  currentQuarantinedTarget: () => CorrelationPublicationTarget | null = () => null,
): void {
  setHandler(
    bpmnAdmitCorrelationPublicationUpdate,
    (command) => {
      const transition = runOrApplicationFailure(() =>
        admitCorrelationPublication(
          currentState(),
          address,
          configuration,
          command,
          currentQuarantinedTarget(),
        )
      );
      replaceState(transition.state);
      return transition.result;
    },
    {
      validator: (command) => {
        runOrApplicationFailure(() =>
          admitCorrelationPublication(
            currentState(),
            address,
            configuration,
            command,
            currentQuarantinedTarget(),
          )
        );
      },
    },
  );
  setHandler(
    bpmnCorrelationPublicationStatusQuery,
    (request) => runOrApplicationFailure(() =>
      correlationPublicationStatus(
        currentState(),
        address,
        configuration,
        request,
      )
    ),
  );
}

function correlationPublicationCapacityFailure(
  state: CorrelationPublicationState,
  queueRecord: CorrelationPublicationState["queue"][number],
  configuration: CorrelationIngressConfiguration,
): CorrelationPublicationCapacityFailure | null {
  const prospectiveQueue = [...state.queue, queueRecord];
  if (prospectiveQueue.length > configuration.maxQueuedPublicationRecords) {
    return {
      kind: CorrelationPublicationCapacityKind.PublicationQueue,
      measure: CorrelationPublicationCapacityMeasure.Count,
      configuredBound: configuration.maxQueuedPublicationRecords,
      observedValue: prospectiveQueue.length,
    };
  }
  const queueBytes = utf8ByteLength(
    canonicalCorrelationPublicationQueueEncoding(prospectiveQueue),
  );
  if (queueBytes > configuration.maxQueuedPublicationCanonicalBytes) {
    return {
      kind: CorrelationPublicationCapacityKind.PublicationQueue,
      measure: CorrelationPublicationCapacityMeasure.CanonicalBytes,
      configuredBound: configuration.maxQueuedPublicationCanonicalBytes,
      observedValue: queueBytes,
    };
  }
  const ledgerCount = state.ledger.length + 1;
  if (ledgerCount > configuration.maxPublicationLedgerRecords) {
    return {
      kind: CorrelationPublicationCapacityKind.PublicationLedger,
      measure: CorrelationPublicationCapacityMeasure.Count,
      configuredBound: configuration.maxPublicationLedgerRecords,
      observedValue: ledgerCount,
    };
  }
  const chargedBytes = ledgerCount * configuration.publicationLedgerRecordBytes;
  if (chargedBytes > configuration.maxPublicationLedgerChargedBytes) {
    return {
      kind: CorrelationPublicationCapacityKind.PublicationLedger,
      measure: CorrelationPublicationCapacityMeasure.CanonicalBytes,
      configuredBound: configuration.maxPublicationLedgerChargedBytes,
      observedValue: chargedBytes,
    };
  }
  return null;
}

function requireCorrelationPublicationState(
  state: CorrelationPublicationState,
  configuration: CorrelationIngressConfiguration,
): void {
  if (!Number.isSafeInteger(state.nextOrdinal) || state.nextOrdinal < 1 ||
    !Array.isArray(state.queue) ||
    !Array.isArray(state.ledger) ||
    state.inFlight === undefined) {
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
  let reachedQueuedSuffix = false;
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
        reachedQueuedSuffix = true;
        break;
      case CorrelationPublicationLedgerPhase.InFlight:
        if (record.ordinal === null || record.resolution !== null) {
          invalidState("An in-flight publication has no reserved ordinal");
        }
        if (reachedQueuedSuffix || record.ordinal !== expectedOrdinal) {
          invalidState("In-flight publication order is not the ledger prefix");
        }
        expectedOrdinal += 1;
        break;
      case CorrelationPublicationLedgerPhase.Settled:
        if (record.ordinal === null || record.resolution === null) {
          invalidState("A settled publication retained no resolution");
        }
        if (!resolutionMatchesTarget(record.resolution, record.target)) {
          invalidState("A settled publication resolution disagrees with its target");
        }
        if (reachedQueuedSuffix || record.ordinal !== expectedOrdinal) {
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
    return;
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
}

function resolutionMatchesTarget(
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

function sameNullableCorrelationPublicationTarget(
  left: CorrelationPublicationTarget | null,
  right: CorrelationPublicationTarget | null,
): boolean {
  return left === null
    ? right === null
    : right !== null && sameCorrelationPublicationTarget(left, right);
}

function sameCorrelationPublicationTarget(
  left: CorrelationPublicationTarget,
  right: CorrelationPublicationTarget,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.subscriptionId.processInstanceId ===
      right.subscriptionId.processInstanceId &&
    left.subscriptionId.elementId === right.subscriptionId.elementId &&
    left.subscriptionId.activation === right.subscriptionId.activation;
}

function admissionResult(
  kind:
    | CorrelationPublicationAdmissionResultKind.Admitted
    | CorrelationPublicationAdmissionResultKind.Retained,
  record: CorrelationPublicationLedgerRecord,
): CorrelationPublicationAdmissionResult {
  return {
    kind,
    commandId: record.commandId,
    contentSha256: record.contentSha256,
    phase: record.phase,
    ordinal: record.ordinal,
  };
}

function requireAddressedCommand(
  commandValue: CorrelationPublicationCommand,
  address: CorrelatedMessageAddress,
): CorrelationPublicationCommand {
  let command: CorrelationPublicationCommand;
  try {
    command = requireCorrelationPublicationCommand(commandValue);
  } catch (error: unknown) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      error instanceof Error ? error.message : "Correlation publication is malformed",
    );
  }
  if (!sameCorrelatedMessageAddress(command.address, address)) {
    throw new CorrelationPublicationFault(
      CorrelationPublicationFaultCode.Invalid,
      "Correlation publication does not belong to this ingress address",
    );
  }
  return command;
}

function invalidState(message: string): never {
  throw new CorrelationPublicationFault(
    CorrelationPublicationFaultCode.Invalid,
    message,
  );
}

function runOrApplicationFailure<Result>(run: () => Result): Result {
  try {
    return run();
  } catch (error: unknown) {
    if (error instanceof ApplicationFailure) {
      throw error;
    }
    const fault = error instanceof CorrelationPublicationFault
      ? error
      : new CorrelationPublicationFault(
          CorrelationPublicationFaultCode.Invalid,
          error instanceof Error ? error.message : "Invalid correlation publication",
        );
    switch (fault.code) {
      case CorrelationPublicationFaultCode.IdentityConflict:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationPublicationIdentityConflictFailureType,
        );
      case CorrelationPublicationFaultCode.Capacity:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationPublicationCapacityFailureType,
          fault.capacity,
        );
      case CorrelationPublicationFaultCode.Invalid:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationPublicationInvalidFailureType,
        );
    }
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation publication phase: ${String(value)}`);
}
