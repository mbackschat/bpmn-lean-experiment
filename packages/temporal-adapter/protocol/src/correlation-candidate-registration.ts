import {
  isCorrelatedMessageCandidate,
  isWellFormedWireString,
  sameCorrelatedMessageAddress,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
  DeepReadonly,
} from "@bpmn-lean/semantic-core";

import type {
  CanonicalTupleValue,
} from "./canonical-encoding.js";
import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import {
  canonicalCorrelatedMessageAddressTuple,
  productionCorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import type {
  CorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnPrepareCorrelationCandidateUpdateName =
  "bpmn-prepare-correlation-candidate";
export const bpmnFinalizeCorrelationCandidateUpdateName =
  "bpmn-finalize-correlation-candidate";
export const bpmnCorrelationCandidateRegistrationIdentityConflictFailureType =
  "BpmnCorrelationCandidateRegistrationIdentityConflict";
export const bpmnCorrelationCandidateRegistrationNotPreparedFailureType =
  "BpmnCorrelationCandidateRegistrationNotPrepared";
export const bpmnCorrelationCandidateRegistrationInvalidFailureType =
  "BpmnCorrelationCandidateRegistrationInvalid";

export enum CorrelationCandidateRegistrationPhase {
  Pending = "pending",
  Active = "active",
  Quarantined = "quarantined",
}

export enum CorrelationCandidateRegistrationResultKind {
  Prepared = "prepared",
  Finalized = "finalized",
  Retained = "retained",
  DeferredByScan = "deferredByScan",
  CandidateCapacity = "candidateCapacity",
  AddressQuarantined = "addressQuarantined",
}

export enum CorrelationCandidateCapacityMeasure {
  CandidateLocatorRecords = "candidateLocatorRecords",
  CandidateLocatorCanonicalBytes = "candidateLocatorCanonicalBytes",
  ActivityRequestCanonicalBytes = "activityRequestCanonicalBytes",
  PublicationLedgerRecordBytes = "publicationLedgerRecordBytes",
}

export enum CorrelationCandidateScanResultKind {
  Started = "started",
  Retained = "retained",
  BlockedByPendingRegistration = "blockedByPendingRegistration",
  BlockedByQuarantine = "blockedByQuarantine",
  Busy = "busy",
  Finished = "finished",
  NotActive = "notActive",
}

export type CorrelationProcessLocator = DeepReadonly<{
  workflowId: string;
}>;

export type CorrelationCandidateRegistrationRequest = DeepReadonly<{
  transactionId: string;
  candidate: CorrelatedMessageCandidate;
  processLocator: CorrelationProcessLocator;
}>;

export type CorrelationCandidateRegistrationRecord = DeepReadonly<{
  transactionId: string;
  contentSha256: string;
  phase: CorrelationCandidateRegistrationPhase;
  candidate: CorrelatedMessageCandidate;
  processLocator: CorrelationProcessLocator;
}>;

export type CorrelationCandidateScanBarrier = DeepReadonly<{
  scanId: string;
  candidates: CorrelationCandidateRegistrationRecord[];
}>;

export type CorrelationCandidateRegistrationState = DeepReadonly<{
  records: CorrelationCandidateRegistrationRecord[];
  scanBarrier: CorrelationCandidateScanBarrier | null;
}>;

export type CorrelationCandidateCapacityFailure = DeepReadonly<{
  measure: CorrelationCandidateCapacityMeasure;
  configuredBound: number;
  observedValue: number;
}>;

export type CorrelationCandidateRegistrationResult =
  | DeepReadonly<{
      kind:
        | CorrelationCandidateRegistrationResultKind.Prepared
        | CorrelationCandidateRegistrationResultKind.Finalized
        | CorrelationCandidateRegistrationResultKind.Retained;
      transactionId: string;
      phase: CorrelationCandidateRegistrationPhase;
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateRegistrationResultKind.DeferredByScan;
      transactionId: string;
      scanId: string;
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateRegistrationResultKind.CandidateCapacity;
      transactionId: string;
      failure: CorrelationCandidateCapacityFailure;
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateRegistrationResultKind.AddressQuarantined;
      transactionId: string;
    }>;

export type CorrelationCandidateScanResult =
  | DeepReadonly<{
      kind:
        | CorrelationCandidateScanResultKind.Started
        | CorrelationCandidateScanResultKind.Retained;
      scanId: string;
      candidates: CorrelationCandidateRegistrationRecord[];
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateScanResultKind.BlockedByPendingRegistration;
      scanId: string;
      pendingTransactionIds: string[];
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateScanResultKind.BlockedByQuarantine;
      scanId: string;
    }>
  | DeepReadonly<{
      kind: CorrelationCandidateScanResultKind.Busy;
      scanId: string;
      activeScanId: string;
    }>
  | DeepReadonly<{
      kind:
        | CorrelationCandidateScanResultKind.Finished
        | CorrelationCandidateScanResultKind.NotActive;
      scanId: string;
    }>;

export type BpmnPrepareCorrelationCandidateUpdateArguments = [
  request: CorrelationCandidateRegistrationRequest,
];
export type BpmnFinalizeCorrelationCandidateUpdateArguments = [
  request: CorrelationCandidateRegistrationRequest,
];

export function requireCorrelationCandidateRegistrationRequest(
  value: unknown,
): CorrelationCandidateRegistrationRequest {
  if (!isRecordWithExactKeys(value, [
    "transactionId",
    "candidate",
    "processLocator",
  ])) {
    throw new TypeError("Correlation candidate registration is incomplete");
  }
  if (
    !nonemptyWireString(value.transactionId) ||
    utf8ByteLength(value.transactionId) >
      productionCorrelationIngressConfiguration.maxCommandIdUtf8Bytes ||
    !isCorrelatedMessageCandidate(value.candidate) ||
    !isRecordWithExactKeys(value.processLocator, ["workflowId"]) ||
    !nonemptyWireString(value.processLocator.workflowId)
  ) {
    throw new TypeError("Correlation candidate registration is malformed");
  }
  return {
    transactionId: value.transactionId,
    candidate: value.candidate,
    processLocator: { workflowId: value.processLocator.workflowId },
  };
}

export function canonicalCorrelationCandidateRegistrationEncoding(
  request: CorrelationCandidateRegistrationRequest,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateRegistration",
    canonicalCorrelationCandidateRegistrationTuple(request),
  ]);
}

export function correlationCandidateRegistrationContentSha256(
  request: CorrelationCandidateRegistrationRequest,
): string {
  return deterministicSha256Hex(
    canonicalCorrelationCandidateRegistrationEncoding(request),
  );
}

export function prepareCorrelationCandidateRegistrationUpdateId(
  request: CorrelationCandidateRegistrationRequest,
): string {
  return correlationCandidateRegistrationUpdateId("prepare", request);
}

export function finalizeCorrelationCandidateRegistrationUpdateId(
  request: CorrelationCandidateRegistrationRequest,
): string {
  return correlationCandidateRegistrationUpdateId("finalize", request);
}

export function sameCorrelationCandidateRegistrationRequest(
  left: CorrelationCandidateRegistrationRequest,
  right: CorrelationCandidateRegistrationRequest,
): boolean {
  try {
    return canonicalCorrelationCandidateRegistrationEncoding(left) ===
      canonicalCorrelationCandidateRegistrationEncoding(right);
  } catch {
    return false;
  }
}

export function correlationCandidateRegistrationRequestFromRecord(
  record: CorrelationCandidateRegistrationRecord,
): CorrelationCandidateRegistrationRequest {
  return {
    transactionId: record.transactionId,
    candidate: record.candidate,
    processLocator: record.processLocator,
  };
}

export function requireCorrelationCandidateCapacityFailure(
  value: unknown,
): CorrelationCandidateCapacityFailure {
  if (!isRecordWithExactKeys(value, [
    "measure",
    "configuredBound",
    "observedValue",
  ]) ||
    !Object.values(CorrelationCandidateCapacityMeasure).includes(
      value.measure as CorrelationCandidateCapacityMeasure,
    ) ||
    typeof value.configuredBound !== "number" ||
    !Number.isSafeInteger(value.configuredBound) ||
    value.configuredBound < 1 ||
    typeof value.observedValue !== "number" ||
    !Number.isSafeInteger(value.observedValue) ||
    value.observedValue <= value.configuredBound) {
    throw new TypeError("Correlation candidate capacity failure is malformed");
  }
  return value as CorrelationCandidateCapacityFailure;
}

export function requireCorrelationCandidateRegistrationResult(
  value: unknown,
  transactionId: string,
): CorrelationCandidateRegistrationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Correlation candidate registration result is malformed");
  }
  const keys = Object.hasOwn(value, "phase")
    ? ["kind", "transactionId", "phase"]
    : Object.hasOwn(value, "scanId")
    ? ["kind", "transactionId", "scanId"]
    : Object.hasOwn(value, "failure")
    ? ["kind", "transactionId", "failure"]
    : ["kind", "transactionId"];
  if (!isRecordWithExactKeys(value, keys) ||
    value.transactionId !== transactionId) {
    throw new TypeError("Correlation candidate registration result is malformed");
  }
  switch (value.kind) {
    case CorrelationCandidateRegistrationResultKind.Prepared:
      if (value.phase !== CorrelationCandidateRegistrationPhase.Pending) {
        throw new TypeError("Correlation prepare result changed phase");
      }
      return value as CorrelationCandidateRegistrationResult;
    case CorrelationCandidateRegistrationResultKind.Finalized:
      if (value.phase !== CorrelationCandidateRegistrationPhase.Active) {
        throw new TypeError("Correlation finalize result changed phase");
      }
      return value as CorrelationCandidateRegistrationResult;
    case CorrelationCandidateRegistrationResultKind.Retained:
      if (!Object.values(CorrelationCandidateRegistrationPhase).includes(
        value.phase as CorrelationCandidateRegistrationPhase,
      )) {
        throw new TypeError("Correlation retained result changed phase");
      }
      return value as CorrelationCandidateRegistrationResult;
    case CorrelationCandidateRegistrationResultKind.DeferredByScan:
      if (!nonemptyWireString(value.scanId)) {
        throw new TypeError("Correlation scan deferral is malformed");
      }
      return value as CorrelationCandidateRegistrationResult;
    case CorrelationCandidateRegistrationResultKind.CandidateCapacity:
      requireCorrelationCandidateCapacityFailure(value.failure);
      return value as CorrelationCandidateRegistrationResult;
    case CorrelationCandidateRegistrationResultKind.AddressQuarantined:
      return value as CorrelationCandidateRegistrationResult;
    default:
      throw new TypeError("Unknown correlation candidate registration result");
  }
}

export function correlationCandidateRegistrationCapacityFailure(
  records: ReadonlyArray<CorrelationCandidateRegistrationRecord>,
  request: CorrelationCandidateRegistrationRequest,
  configuration: CorrelationIngressConfiguration,
): CorrelationCandidateCapacityFailure | null {
  requireCorrelationCandidateRegistrationRequest(request);
  const observedCount = records.length + 1;
  if (observedCount > configuration.maxCandidateLocatorRecords) {
    return {
      measure: CorrelationCandidateCapacityMeasure.CandidateLocatorRecords,
      configuredBound: configuration.maxCandidateLocatorRecords,
      observedValue: observedCount,
    };
  }

  const prospectiveRecord: CorrelationCandidateRegistrationRecord = {
    ...request,
    contentSha256: correlationCandidateRegistrationContentSha256(request),
    phase: CorrelationCandidateRegistrationPhase.Pending,
  };
  const locatorBytes = utf8ByteLength(
    canonicalCorrelationCandidateLocatorSetEncoding([
      ...records,
      prospectiveRecord,
    ]),
  );
  if (locatorBytes > configuration.maxCandidateLocatorCanonicalBytes) {
    return {
      measure:
        CorrelationCandidateCapacityMeasure.CandidateLocatorCanonicalBytes,
      configuredBound: configuration.maxCandidateLocatorCanonicalBytes,
      observedValue: locatorBytes,
    };
  }

  const activityRequestBytes = utf8ByteLength(
    canonicalCorrelationCandidateRegistrationEncoding(request),
  );
  if (activityRequestBytes > configuration.maxActivityPayloadBytes) {
    return {
      measure: CorrelationCandidateCapacityMeasure.ActivityRequestCanonicalBytes,
      configuredBound: configuration.maxActivityPayloadBytes,
      observedValue: activityRequestBytes,
    };
  }

  const resultEnvelopeBytes = utf8ByteLength(
    canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding(
      request.candidate,
      configuration,
    ),
  );
  if (resultEnvelopeBytes > configuration.publicationLedgerRecordBytes) {
    return {
      measure: CorrelationCandidateCapacityMeasure.PublicationLedgerRecordBytes,
      configuredBound: configuration.publicationLedgerRecordBytes,
      observedValue: resultEnvelopeBytes,
    };
  }
  return null;
}

export function canonicalCorrelationCandidateLocatorSetEncoding(
  records: ReadonlyArray<CorrelationCandidateRegistrationRecord>,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateLocatorSet",
    records.map((record) => [
      record.transactionId,
      record.contentSha256,
      canonicalCorrelatedMessageCandidateTuple(record.candidate),
      [record.processLocator.workflowId],
    ]),
  ]);
}

export function canonicalCorrelationPublicationLedgerRecordEnvelopeEncoding(
  candidate: CorrelatedMessageCandidate,
  configuration: CorrelationIngressConfiguration,
): string {
  if (!isCorrelatedMessageCandidate(candidate)) {
    throw new TypeError("Correlation publication target is malformed");
  }
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationPublicationLedgerRecord",
    "x".repeat(configuration.maxCommandIdUtf8Bytes),
    "f".repeat(64),
    "settled",
    ["some", Number.MAX_SAFE_INTEGER],
    [
      "some",
      [
        candidate.processInstanceId,
        [
          candidate.subscriptionId.processInstanceId,
          candidate.subscriptionId.elementId,
          candidate.subscriptionId.activation,
        ],
      ],
    ],
    [
      "settled",
      [
        "semantic",
        [
          "committed",
          [
            candidate.processInstanceId,
            [
              candidate.subscriptionId.processInstanceId,
              candidate.subscriptionId.elementId,
              candidate.subscriptionId.activation,
            ],
          ],
        ],
      ],
    ],
  ]);
}

export function correlationRegistrationBelongsToAddress(
  request: CorrelationCandidateRegistrationRequest,
  address: CorrelatedMessageAddress,
): boolean {
  return isCorrelatedMessageCandidate(request.candidate) &&
    sameCorrelatedMessageAddress(request.candidate.address, address);
}

function correlationCandidateRegistrationUpdateId(
  phase: "prepare" | "finalize",
  request: CorrelationCandidateRegistrationRequest,
): string {
  const encoded = canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateRegistrationUpdate",
    phase,
    canonicalCorrelationCandidateRegistrationTuple(request),
  ]);
  return `bpmn-correlation-${phase}-sha256:${deterministicSha256Hex(encoded)}`;
}

function canonicalCorrelationCandidateRegistrationTuple(
  request: CorrelationCandidateRegistrationRequest,
): ReadonlyArray<CanonicalTupleValue> {
  const accepted = requireCorrelationCandidateRegistrationRequest(request);
  return [
    accepted.transactionId,
    canonicalCorrelatedMessageCandidateTuple(accepted.candidate),
    [accepted.processLocator.workflowId],
  ];
}

export function canonicalCorrelatedMessageCandidateTuple(
  candidate: CorrelatedMessageCandidate,
): ReadonlyArray<CanonicalTupleValue> {
  if (!isCorrelatedMessageCandidate(candidate)) {
    throw new TypeError("Correlation candidate is malformed");
  }
  return [
    canonicalCorrelatedMessageAddressTuple(candidate.address),
    candidate.processInstanceId,
    [
      candidate.subscriptionId.processInstanceId,
      candidate.subscriptionId.elementId,
      candidate.subscriptionId.activation,
    ],
    candidate.correlationPropertyId,
    candidate.processPropertyId,
    [candidate.key.kind, candidate.key.value],
  ];
}

function nonemptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
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
