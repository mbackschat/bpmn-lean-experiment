import {
  isWellFormedWireString,
  sameCorrelatedMessageAddress,
  sameOccurrenceId,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

import {
  CorrelationCandidateCapacityMeasure,
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  CorrelationCandidateScanResultKind,
  bpmnCorrelationCandidateRegistrationIdentityConflictFailureType,
  bpmnCorrelationCandidateRegistrationInvalidFailureType,
  bpmnCorrelationCandidateRegistrationNotPreparedFailureType,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  canonicalCorrelationCandidateLocatorSetEncoding,
  canonicalCorrelationCandidateRegistrationEncoding,
  canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding,
  correlationCandidateRegistrationCapacityFailure,
  correlationCandidateRegistrationContentSha256,
  correlationCandidateRegistrationRequestFromRecord,
  correlationRegistrationBelongsToAddress,
  requireCorrelationCandidateRegistrationRequest,
  sameCorrelationCandidateRegistrationRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnFinalizeCorrelationCandidateUpdateArguments,
  BpmnPrepareCorrelationCandidateUpdateArguments,
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateRegistrationRequest,
  CorrelationCandidateRegistrationResult,
  CorrelationCandidateRegistrationState,
  CorrelationCandidateScanResult,
  CorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";

export enum CorrelationCandidateRegistrationFaultCode {
  IdentityConflict = "identityConflict",
  NotPrepared = "notPrepared",
  Invalid = "invalid",
}

export class CorrelationCandidateRegistrationFault extends Error {
  readonly code: CorrelationCandidateRegistrationFaultCode;

  constructor(
    code: CorrelationCandidateRegistrationFaultCode,
    message: string,
  ) {
    super(message);
    this.name = "CorrelationCandidateRegistrationFault";
    this.code = code;
  }
}

export type CorrelationCandidateRegistrationTransition = Readonly<{
  state: CorrelationCandidateRegistrationState;
  result: CorrelationCandidateRegistrationResult;
}>;

export type CorrelationCandidateScanTransition = Readonly<{
  state: CorrelationCandidateRegistrationState;
  result: CorrelationCandidateScanResult;
}>;

export enum CorrelationCandidateTargetDisposition {
  Removed = "removed",
  Quarantined = "quarantined",
}

export const bpmnPrepareCorrelationCandidateUpdate: ReturnType<
  typeof defineUpdate<
    CorrelationCandidateRegistrationResult,
    BpmnPrepareCorrelationCandidateUpdateArguments
  >
> = defineUpdate<
  CorrelationCandidateRegistrationResult,
  BpmnPrepareCorrelationCandidateUpdateArguments
>(bpmnPrepareCorrelationCandidateUpdateName);

export const bpmnFinalizeCorrelationCandidateUpdate: ReturnType<
  typeof defineUpdate<
    CorrelationCandidateRegistrationResult,
    BpmnFinalizeCorrelationCandidateUpdateArguments
  >
> = defineUpdate<
  CorrelationCandidateRegistrationResult,
  BpmnFinalizeCorrelationCandidateUpdateArguments
>(bpmnFinalizeCorrelationCandidateUpdateName);

export function emptyCorrelationCandidateRegistrationState(): CorrelationCandidateRegistrationState {
  return { records: [], scanBarrier: null };
}

export function prepareCorrelationCandidateRegistration(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  candidateRequest: CorrelationCandidateRegistrationRequest,
): CorrelationCandidateRegistrationTransition {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  const request = requireAddressedRegistration(candidateRequest, address);
  const retained = state.records.find(
    (record) => record.transactionId === request.transactionId,
  );
  if (retained !== undefined) {
    requireSameRetainedRegistration(retained, request);
    return {
      state,
      result: {
        kind: CorrelationCandidateRegistrationResultKind.Retained,
        transactionId: request.transactionId,
        phase: retained.phase,
      },
    };
  }
  if (state.records.some(
    (record) => record.phase === CorrelationCandidateRegistrationPhase.Quarantined,
  )) {
    return {
      state,
      result: {
        kind: CorrelationCandidateRegistrationResultKind.AddressQuarantined,
        transactionId: request.transactionId,
      },
    };
  }
  if (state.scanBarrier !== null) {
    return {
      state,
      result: {
        kind: CorrelationCandidateRegistrationResultKind.DeferredByScan,
        transactionId: request.transactionId,
        scanId: state.scanBarrier.scanId,
      },
    };
  }
  const capacity = correlationCandidateRegistrationCapacityFailure(
    state.records,
    request,
    configuration,
  );
  if (capacity !== null) {
    return {
      state,
      result: {
        kind: CorrelationCandidateRegistrationResultKind.CandidateCapacity,
        transactionId: request.transactionId,
        failure: capacity,
      },
    };
  }
  const record: CorrelationCandidateRegistrationRecord = {
    transactionId: request.transactionId,
    contentSha256: correlationCandidateRegistrationContentSha256(request),
    phase: CorrelationCandidateRegistrationPhase.Pending,
    candidate: request.candidate,
    processLocator: request.processLocator,
  };
  return {
    state: {
      records: [...state.records, record],
      scanBarrier: null,
    },
    result: {
      kind: CorrelationCandidateRegistrationResultKind.Prepared,
      transactionId: request.transactionId,
      phase: CorrelationCandidateRegistrationPhase.Pending,
    },
  };
}

export function finalizeCorrelationCandidateRegistration(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  candidateRequest: CorrelationCandidateRegistrationRequest,
): CorrelationCandidateRegistrationTransition {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  const request = requireAddressedRegistration(candidateRequest, address);
  const retained = state.records.find(
    (record) => record.transactionId === request.transactionId,
  );
  if (retained === undefined) {
    throw new CorrelationCandidateRegistrationFault(
      CorrelationCandidateRegistrationFaultCode.NotPrepared,
      `Correlation registration ${request.transactionId} was not prepared`,
    );
  }
  requireSameRetainedRegistration(retained, request);
  if (retained.phase !== CorrelationCandidateRegistrationPhase.Pending) {
    return {
      state,
      result: {
        kind: CorrelationCandidateRegistrationResultKind.Retained,
        transactionId: request.transactionId,
        phase: retained.phase,
      },
    };
  }
  const records = state.records.map((record) =>
    record === retained
      ? { ...record, phase: CorrelationCandidateRegistrationPhase.Active }
      : record
  );
  return {
    state: { records, scanBarrier: null },
    result: {
      kind: CorrelationCandidateRegistrationResultKind.Finalized,
      transactionId: request.transactionId,
      phase: CorrelationCandidateRegistrationPhase.Active,
    },
  };
}

export function beginCorrelationCandidateScan(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  scanId: string,
): CorrelationCandidateScanTransition {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  requireScanId(scanId, configuration);
  if (state.scanBarrier !== null) {
    return state.scanBarrier.scanId === scanId
      ? {
          state,
          result: {
            kind: CorrelationCandidateScanResultKind.Retained,
            scanId,
            candidates: state.scanBarrier.candidates,
          },
        }
      : {
          state,
          result: {
            kind: CorrelationCandidateScanResultKind.Busy,
            scanId,
            activeScanId: state.scanBarrier.scanId,
          },
        };
  }
  const pendingTransactionIds = state.records
    .filter((record) =>
      record.phase === CorrelationCandidateRegistrationPhase.Pending
    )
    .map(({ transactionId }) => transactionId);
  if (pendingTransactionIds.length > 0) {
    return {
      state,
      result: {
        kind: CorrelationCandidateScanResultKind.BlockedByPendingRegistration,
        scanId,
        pendingTransactionIds,
      },
    };
  }
  if (state.records.some(
    (record) => record.phase === CorrelationCandidateRegistrationPhase.Quarantined,
  )) {
    return {
      state,
      result: {
        kind: CorrelationCandidateScanResultKind.BlockedByQuarantine,
        scanId,
      },
    };
  }
  const candidates = state.records.filter(
    (record) => record.phase === CorrelationCandidateRegistrationPhase.Active,
  );
  return {
    state: {
      records: state.records,
      scanBarrier: { scanId, candidates },
    },
    result: {
      kind: CorrelationCandidateScanResultKind.Started,
      scanId,
      candidates,
    },
  };
}

export function finishCorrelationCandidateScan(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  scanId: string,
): CorrelationCandidateScanTransition {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  requireScanId(scanId, configuration);
  if (state.scanBarrier === null) {
    return {
      state,
      result: { kind: CorrelationCandidateScanResultKind.NotActive, scanId },
    };
  }
  if (state.scanBarrier.scanId !== scanId) {
    return {
      state,
      result: {
        kind: CorrelationCandidateScanResultKind.Busy,
        scanId,
        activeScanId: state.scanBarrier.scanId,
      },
    };
  }
  return {
    state: { records: state.records, scanBarrier: null },
    result: { kind: CorrelationCandidateScanResultKind.Finished, scanId },
  };
}

export function requireCorrelationActiveTargetRegistration(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  target: CorrelationPublicationTarget,
): CorrelationCandidateRegistrationRecord {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  const matches = state.records.filter((record) =>
    record.phase === CorrelationCandidateRegistrationPhase.Active &&
    record.candidate.processInstanceId === target.processInstanceId &&
    sameOccurrenceId(record.candidate.subscriptionId, target.subscriptionId)
  );
  if (matches.length !== 1) {
    invalidState("The selected correlation target has no unique active locator");
  }
  return matches[0]!;
}

export function settleCorrelationCandidateTarget(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  scanId: string,
  target: CorrelationPublicationTarget,
  disposition: CorrelationCandidateTargetDisposition,
): CorrelationCandidateRegistrationState {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  if (state.scanBarrier === null || state.scanBarrier.scanId !== scanId) {
    invalidState("Correlation target settlement does not own the exact scan barrier");
  }
  const selected = requireCorrelationActiveTargetRegistration(
    state,
    address,
    configuration,
    target,
  );
  const records = state.records.flatMap((record) => {
    if (record !== selected) {
      return [record];
    }
    switch (disposition) {
      case CorrelationCandidateTargetDisposition.Removed:
        return [];
      case CorrelationCandidateTargetDisposition.Quarantined:
        return [{
          ...record,
          phase: CorrelationCandidateRegistrationPhase.Quarantined,
        }];
      default:
        return assertNever(disposition);
    }
  });
  const next = { records, scanBarrier: null };
  requireCorrelationCandidateRegistrationState(next, address, configuration);
  return next;
}

export function correlationQuarantinedTarget(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): CorrelationPublicationTarget | null {
  requireCorrelationCandidateRegistrationState(state, address, configuration);
  const quarantined = state.records.filter((record) =>
    record.phase === CorrelationCandidateRegistrationPhase.Quarantined
  );
  if (quarantined.length > 1) {
    invalidState("Correlation address retained more than one quarantined locator");
  }
  const record = quarantined[0];
  return record === undefined
    ? null
    : {
        processInstanceId: record.candidate.processInstanceId,
        subscriptionId: record.candidate.subscriptionId,
      };
}

export function registerCorrelationCandidateRegistrationHandlers(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  currentState: () => CorrelationCandidateRegistrationState,
  replaceState: (state: CorrelationCandidateRegistrationState) => void,
): void {
  setHandler(
    bpmnPrepareCorrelationCandidateUpdate,
    (request) => {
      const transition = runOrApplicationFailure(() =>
        prepareCorrelationCandidateRegistration(
          currentState(),
          address,
          configuration,
          request,
        )
      );
      replaceState(transition.state);
      return transition.result;
    },
    {
      validator: (request) => {
        runOrApplicationFailure(() =>
          prepareCorrelationCandidateRegistration(
            currentState(),
            address,
            configuration,
            request,
          )
        );
      },
    },
  );
  setHandler(
    bpmnFinalizeCorrelationCandidateUpdate,
    (request) => {
      const transition = runOrApplicationFailure(() =>
        finalizeCorrelationCandidateRegistration(
          currentState(),
          address,
          configuration,
          request,
        )
      );
      replaceState(transition.state);
      return transition.result;
    },
    {
      validator: (request) => {
        runOrApplicationFailure(() =>
          finalizeCorrelationCandidateRegistration(
            currentState(),
            address,
            configuration,
            request,
          )
        );
      },
    },
  );
}

function requireCorrelationCandidateRegistrationState(
  state: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): void {
  if (!Array.isArray(state.records) || state.scanBarrier === undefined) {
    invalidState("Correlation candidate registration state is malformed");
  }
  const transactionIds = new Set<string>();
  for (const record of state.records) {
    const request = correlationCandidateRegistrationRequestFromRecord(record);
    requireAddressedRegistration(request, address);
    if (
      record.contentSha256 !==
        correlationCandidateRegistrationContentSha256(request) ||
      !Object.values(CorrelationCandidateRegistrationPhase).includes(record.phase) ||
      transactionIds.has(record.transactionId)
    ) {
      invalidState("Correlation candidate registration record is inconsistent");
    }
    transactionIds.add(record.transactionId);
  }
  requireRetainedCapacity(state.records, configuration);
  if (state.scanBarrier === null) {
    return;
  }
  requireScanId(state.scanBarrier.scanId, configuration);
  if (state.records.some(
    (record) => record.phase === CorrelationCandidateRegistrationPhase.Pending,
  )) {
    invalidState("A scan barrier cannot coexist with a pending registration");
  }
  const active = state.records.filter(
    (record) => record.phase === CorrelationCandidateRegistrationPhase.Active,
  );
  if (
    state.scanBarrier.candidates.length !== active.length ||
    state.scanBarrier.candidates.some((candidate, index) =>
      !sameRecord(candidate, active[index])
    )
  ) {
    invalidState("A scan barrier must retain the complete active candidate vector");
  }
}

function requireRetainedCapacity(
  records: ReadonlyArray<CorrelationCandidateRegistrationRecord>,
  configuration: CorrelationIngressConfiguration,
): void {
  if (records.length > configuration.maxCandidateLocatorRecords) {
    invalidState("Retained correlation candidates exceed their count bound");
  }
  if (
    utf8ByteLength(canonicalCorrelationCandidateLocatorSetEncoding(records)) >
      configuration.maxCandidateLocatorCanonicalBytes
  ) {
    invalidState("Retained correlation candidates exceed their byte bound");
  }
  for (const record of records) {
    const request = correlationCandidateRegistrationRequestFromRecord(record);
    if (
      utf8ByteLength(canonicalCorrelationCandidateRegistrationEncoding(request)) >
        configuration.maxActivityPayloadBytes
    ) {
      invalidState(
        `Retained correlation candidate exceeds ${CorrelationCandidateCapacityMeasure.ActivityRequestCanonicalBytes}`,
      );
    }
    if (
      utf8ByteLength(
        canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding(
          record.candidate,
          configuration,
        ),
      ) > configuration.publicationLedgerRecordBytes
    ) {
      invalidState(
        `Retained correlation candidate exceeds ${CorrelationCandidateCapacityMeasure.PublicationLedgerRecordBytes}`,
      );
    }
  }
}

function requireAddressedRegistration(
  candidateRequest: CorrelationCandidateRegistrationRequest,
  address: CorrelatedMessageAddress,
): CorrelationCandidateRegistrationRequest {
  let request: CorrelationCandidateRegistrationRequest;
  try {
    request = requireCorrelationCandidateRegistrationRequest(candidateRequest);
  } catch (error: unknown) {
    throw new CorrelationCandidateRegistrationFault(
      CorrelationCandidateRegistrationFaultCode.Invalid,
      error instanceof Error ? error.message : "Correlation registration is malformed",
    );
  }
  if (!correlationRegistrationBelongsToAddress(request, address)) {
    throw new CorrelationCandidateRegistrationFault(
      CorrelationCandidateRegistrationFaultCode.Invalid,
      "Correlation registration does not belong to this ingress address",
    );
  }
  return request;
}

function requireSameRetainedRegistration(
  record: CorrelationCandidateRegistrationRecord,
  request: CorrelationCandidateRegistrationRequest,
): void {
  if (!sameCorrelationCandidateRegistrationRequest(
    correlationCandidateRegistrationRequestFromRecord(record),
    request,
  )) {
    throw new CorrelationCandidateRegistrationFault(
      CorrelationCandidateRegistrationFaultCode.IdentityConflict,
      `Correlation registration transaction ${request.transactionId} was reused with different content`,
    );
  }
}

function requireScanId(
  scanId: string,
  configuration: CorrelationIngressConfiguration,
): void {
  if (
    scanId.length === 0 ||
    !isWellFormedWireString(scanId) ||
    utf8ByteLength(scanId) > configuration.maxCommandIdUtf8Bytes
  ) {
    throw new CorrelationCandidateRegistrationFault(
      CorrelationCandidateRegistrationFaultCode.Invalid,
      "Correlation candidate scan identity is malformed",
    );
  }
}

function sameRecord(
  left: CorrelationCandidateRegistrationRecord,
  right: CorrelationCandidateRegistrationRecord | undefined,
): boolean {
  return right !== undefined &&
    left.phase === right.phase &&
    left.contentSha256 === right.contentSha256 &&
    sameCorrelationCandidateRegistrationRequest(
      correlationCandidateRegistrationRequestFromRecord(left),
      correlationCandidateRegistrationRequestFromRecord(right),
    ) &&
    sameCorrelatedMessageAddress(left.candidate.address, right.candidate.address);
}

function invalidState(message: string): never {
  throw new CorrelationCandidateRegistrationFault(
    CorrelationCandidateRegistrationFaultCode.Invalid,
    message,
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation target disposition: ${String(value)}`);
}

function runOrApplicationFailure<Result>(run: () => Result): Result {
  try {
    return run();
  } catch (error: unknown) {
    if (error instanceof ApplicationFailure) {
      throw error;
    }
    const fault = error instanceof CorrelationCandidateRegistrationFault
      ? error
      : new CorrelationCandidateRegistrationFault(
          CorrelationCandidateRegistrationFaultCode.Invalid,
          error instanceof Error ? error.message : "Invalid correlation registration",
        );
    switch (fault.code) {
      case CorrelationCandidateRegistrationFaultCode.IdentityConflict:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationCandidateRegistrationIdentityConflictFailureType,
        );
      case CorrelationCandidateRegistrationFaultCode.NotPrepared:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationCandidateRegistrationNotPreparedFailureType,
        );
      case CorrelationCandidateRegistrationFaultCode.Invalid:
        throw ApplicationFailure.nonRetryable(
          fault.message,
          bpmnCorrelationCandidateRegistrationInvalidFailureType,
        );
    }
  }
}
