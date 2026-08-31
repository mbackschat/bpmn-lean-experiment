import {
  isCorrelatedMessageAddress,
  isWellFormedWireString,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  DeepReadonly,
  MessageSubscriptionId,
  VariableValue,
} from "@bpmn-lean/semantic-core";

import type {
  CanonicalTupleValue,
} from "./canonical-encoding.js";
import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import {
  canonicalCorrelatedMessageAddressTuple,
  productionCorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnAdmitCorrelationPublicationUpdateName =
  "bpmn-publish-correlated-message";
export const bpmnCorrelationPublicationStatusQueryName =
  "bpmn-correlation-publication-status";
export const bpmnCorrelationPublicationIdentityConflictFailureType =
  "BpmnCorrelatedMessageIdentityConflict";
export const bpmnCorrelationPublicationInvalidFailureType =
  "BpmnCorrelatedMessageIngressInvalid";
export const bpmnCorrelationPublicationCapacityFailureType =
  "BpmnCorrelatedMessagePublicationCapacity";

const maximumCorrelationPublicationCanonicalBytes = 128 * 1024;
const maximumCorrelationPublicationPayloadCanonicalBytes = 20 * 1024;

export enum CorrelationPublicationAdmissionResultKind {
  Admitted = "admitted",
  Retained = "retained",
}

export enum CorrelationPublicationLedgerPhase {
  Queued = "queued",
  InFlight = "inFlight",
  Settled = "settled",
}

export enum CorrelationPublicationOrderResultKind {
  Idle = "idle",
  Busy = "busy",
  Started = "started",
  Settled = "settled",
}

export enum CorrelationPublicationCapacityKind {
  PublicationQueue = "publicationQueue",
  PublicationLedger = "publicationLedger",
}

export enum CorrelationPublicationCapacityMeasure {
  Count = "count",
  CanonicalBytes = "canonicalBytes",
}

export enum CorrelationPublicationStoredResolutionKind {
  Semantic = "semantic",
  TargetInconsistent = "targetInconsistent",
}

export enum CorrelationPublicationSemanticOutcomeKind {
  Committed = "committed",
  RejectedNoMatch = "rejectedNoMatch",
  RejectedAmbiguous = "rejectedAmbiguous",
}

export enum CorrelationPublicationStatusKind {
  Absent = "absent",
  Accepted = "accepted",
}

export enum CorrelationPublicationScanResolutionKind {
  RejectedNoMatch = "rejectedNoMatch",
  RejectedAmbiguous = "rejectedAmbiguous",
  TargetSelected = "targetSelected",
}

export type CorrelationPublicationPayload = Extract<
  VariableValue,
  { kind: "string" }
>;

export type CorrelationPublicationCommand = DeepReadonly<{
  commandId: string;
  address: CorrelatedMessageAddress;
  payload: CorrelationPublicationPayload;
}>;

export type CorrelationPublicationTarget = DeepReadonly<{
  processInstanceId: string;
  subscriptionId: MessageSubscriptionId;
}>;

export type CorrelationPublicationStoredResolution =
  | DeepReadonly<{
      kind: CorrelationPublicationStoredResolutionKind.Semantic;
      outcome:
        | { kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch }
        | { kind: CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous }
        | {
            kind: CorrelationPublicationSemanticOutcomeKind.Committed;
            target: CorrelationPublicationTarget;
          };
    }>
  | DeepReadonly<{
      kind: CorrelationPublicationStoredResolutionKind.TargetInconsistent;
      target: CorrelationPublicationTarget;
    }>;

export type CorrelationPublicationQueueRecord = DeepReadonly<{
  commandId: string;
  contentSha256: string;
  payload: CorrelationPublicationPayload;
}>;

export type CorrelationPublicationLedgerRecord = DeepReadonly<{
  commandId: string;
  contentSha256: string;
  phase: CorrelationPublicationLedgerPhase;
  ordinal: number | null;
  target: CorrelationPublicationTarget | null;
  resolution: CorrelationPublicationStoredResolution | null;
}>;

export type CorrelationPublicationInFlightRecord = DeepReadonly<{
  commandId: string;
  contentSha256: string;
  ordinal: number;
  payload: CorrelationPublicationPayload;
  target: CorrelationPublicationTarget | null;
}>;

export type CorrelationPublicationState = DeepReadonly<{
  nextOrdinal: number;
  queue: CorrelationPublicationQueueRecord[];
  ledger: CorrelationPublicationLedgerRecord[];
  inFlight: CorrelationPublicationInFlightRecord | null;
}>;

export type CorrelationPublicationAdmissionResult = DeepReadonly<{
  kind:
    | CorrelationPublicationAdmissionResultKind.Admitted
    | CorrelationPublicationAdmissionResultKind.Retained;
  commandId: string;
  contentSha256: string;
  phase: CorrelationPublicationLedgerPhase;
  ordinal: number | null;
}>;

export type CorrelationPublicationCapacityFailure = DeepReadonly<{
  kind: CorrelationPublicationCapacityKind;
  measure: CorrelationPublicationCapacityMeasure;
  configuredBound: number;
  observedValue: number;
}>;

export type CorrelationPublicationOrderResult =
  | DeepReadonly<{
      kind: CorrelationPublicationOrderResultKind.Idle;
    }>
  | DeepReadonly<{
      kind: CorrelationPublicationOrderResultKind.Busy;
      commandId: string;
      ordinal: number;
    }>
  | DeepReadonly<{
      kind: CorrelationPublicationOrderResultKind.Started;
      command: CorrelationPublicationCommand;
      contentSha256: string;
      ordinal: number;
    }>
  | DeepReadonly<{
      kind: CorrelationPublicationOrderResultKind.Settled;
      commandId: string;
      ordinal: number;
    }>;

export type CorrelationPublicationSettlement = DeepReadonly<{
  commandId: string;
  ordinal: number;
  resolution: CorrelationPublicationStoredResolution;
}>;

export type CorrelationPublicationStatusRequest = CorrelationPublicationCommand;

export type CorrelationPublicationStatus =
  | DeepReadonly<{
      kind: CorrelationPublicationStatusKind.Absent;
      commandId: string;
      contentSha256: string;
    }>
  | DeepReadonly<{
      kind: CorrelationPublicationStatusKind.Accepted;
      record: CorrelationPublicationLedgerRecord;
    }>;

export type BpmnAdmitCorrelationPublicationUpdateArguments = [
  command: CorrelationPublicationCommand,
];
export type BpmnCorrelationPublicationStatusQueryArguments = [
  request: CorrelationPublicationStatusRequest,
];

export function requireCorrelationPublicationCommand(
  value: unknown,
): CorrelationPublicationCommand {
  if (!isRecordWithExactKeys(value, ["commandId", "address", "payload"]) ||
    !nonemptyBoundedCommandId(value.commandId) ||
    !isCorrelatedMessageAddress(value.address) ||
    !isCorrelationPublicationPayload(value.payload)) {
    throw new TypeError("Correlation publication command is malformed");
  }
  const command = {
    commandId: value.commandId,
    address: value.address,
    payload: value.payload,
  } satisfies CorrelationPublicationCommand;
  if (utf8ByteLength(canonicalPayloadTupleEncoding(command.payload)) >
    maximumCorrelationPublicationPayloadCanonicalBytes) {
    throw new RangeError("Correlation publication payload exceeds 20480 canonical UTF-8 bytes");
  }
  if (utf8ByteLength(canonicalCorrelationPublicationCommandEncodingUnchecked(command)) >
    maximumCorrelationPublicationCanonicalBytes) {
    throw new RangeError("Correlation publication exceeds 131072 canonical UTF-8 bytes");
  }
  return command;
}

export function canonicalCorrelationPublicationCommandEncoding(
  command: CorrelationPublicationCommand,
): string {
  return canonicalCorrelationPublicationCommandEncodingUnchecked(
    requireCorrelationPublicationCommand(command),
  );
}

export function correlationPublicationContentSha256(
  command: CorrelationPublicationCommand,
): string {
  return deterministicSha256Hex(
    canonicalCorrelationPublicationCommandEncoding(command),
  );
}

export function correlationPublicationUpdateId(
  command: CorrelationPublicationCommand,
): string {
  return `bpmn-correlation-publish-sha256:${correlationPublicationContentSha256(command)}`;
}

export function canonicalCorrelationPublicationQueueEncoding(
  records: ReadonlyArray<CorrelationPublicationQueueRecord>,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationPublicationQueue",
    records.map((record) => {
      const accepted = requireCorrelationPublicationQueueRecord(record);
      return [
        accepted.commandId,
        accepted.contentSha256,
        correlationPublicationPayloadTuple(accepted.payload),
      ];
    }),
  ]);
}

export function canonicalCorrelationPublicationLedgerRecordEncoding(
  record: CorrelationPublicationLedgerRecord,
): string {
  const accepted = requireCorrelationPublicationLedgerRecord(record);
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationPublicationLedgerRecord",
    accepted.commandId,
    accepted.contentSha256,
    accepted.phase,
    accepted.ordinal === null ? ["none"] : ["some", accepted.ordinal],
    accepted.target === null
      ? ["none"]
      : ["some", correlationPublicationTargetTuple(accepted.target)],
    accepted.resolution === null
      ? ["reserved"]
      : ["settled", correlationPublicationResolutionTuple(accepted.resolution)],
  ]);
}

export function requireCorrelationPublicationQueueRecord(
  value: unknown,
): CorrelationPublicationQueueRecord {
  if (!isRecordWithExactKeys(value, ["commandId", "contentSha256", "payload"]) ||
    !nonemptyBoundedCommandId(value.commandId) ||
    !isSha256(value.contentSha256) ||
    !isCorrelationPublicationPayload(value.payload) ||
    utf8ByteLength(canonicalPayloadTupleEncoding(value.payload)) >
      maximumCorrelationPublicationPayloadCanonicalBytes) {
    throw new TypeError("Correlation publication queue record is malformed");
  }
  return value as CorrelationPublicationQueueRecord;
}

export function requireCorrelationPublicationLedgerRecord(
  value: unknown,
): CorrelationPublicationLedgerRecord {
  if (!isRecordWithExactKeys(value, [
    "commandId",
    "contentSha256",
    "phase",
    "ordinal",
    "target",
    "resolution",
  ]) ||
    !nonemptyBoundedCommandId(value.commandId) ||
    !isSha256(value.contentSha256) ||
    !Object.values(CorrelationPublicationLedgerPhase).includes(
      value.phase as CorrelationPublicationLedgerPhase,
    ) ||
    !(value.ordinal === null || isPositiveSafeInteger(value.ordinal)) ||
    !(value.target === null || isCorrelationPublicationTarget(value.target)) ||
    !(value.resolution === null || isStoredResolution(value.resolution))) {
    throw new TypeError("Correlation publication ledger record is malformed");
  }
  return value as CorrelationPublicationLedgerRecord;
}

export function requireCorrelationPublicationStoredResolution(
  value: unknown,
): CorrelationPublicationStoredResolution {
  if (!isRecord(value) || !Object.hasOwn(value, "kind")) {
    throw new TypeError("Correlation publication resolution is malformed");
  }
  switch (value.kind) {
    case CorrelationPublicationStoredResolutionKind.Semantic:
      if (!isRecordWithExactKeys(value, ["kind", "outcome"]) ||
        !isRecord(value.outcome)) {
        break;
      }
      switch (value.outcome.kind) {
        case CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch:
        case CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous:
          if (isRecordWithExactKeys(value.outcome, ["kind"])) {
            return value as CorrelationPublicationStoredResolution;
          }
          break;
        case CorrelationPublicationSemanticOutcomeKind.Committed:
          if (isRecordWithExactKeys(value.outcome, ["kind", "target"]) &&
            isCorrelationPublicationTarget(value.outcome.target)) {
            return value as CorrelationPublicationStoredResolution;
          }
          break;
      }
      break;
    case CorrelationPublicationStoredResolutionKind.TargetInconsistent:
      if (isRecordWithExactKeys(value, ["kind", "target"]) &&
        isCorrelationPublicationTarget(value.target)) {
        return value as CorrelationPublicationStoredResolution;
      }
      break;
  }
  throw new TypeError("Correlation publication resolution is malformed");
}

export function requireCorrelationPublicationTarget(
  value: unknown,
): CorrelationPublicationTarget {
  if (!isCorrelationPublicationTarget(value)) {
    throw new TypeError("Correlation publication target is malformed");
  }
  return value;
}

export function requireCorrelationPublicationCapacityFailure(
  value: unknown,
): CorrelationPublicationCapacityFailure {
  if (!isRecordWithExactKeys(value, [
    "kind",
    "measure",
    "configuredBound",
    "observedValue",
  ]) ||
    !Object.values(CorrelationPublicationCapacityKind).includes(
      value.kind as CorrelationPublicationCapacityKind,
    ) ||
    !Object.values(CorrelationPublicationCapacityMeasure).includes(
      value.measure as CorrelationPublicationCapacityMeasure,
    ) ||
    !isNonnegativeSafeInteger(value.configuredBound) ||
    !isPositiveSafeInteger(value.observedValue) ||
    value.observedValue <= value.configuredBound) {
    throw new TypeError("Correlation publication capacity failure is malformed");
  }
  return value as CorrelationPublicationCapacityFailure;
}

export function sameCorrelationPublicationCommand(
  left: CorrelationPublicationCommand,
  right: CorrelationPublicationCommand,
): boolean {
  try {
    return canonicalCorrelationPublicationCommandEncoding(left) ===
      canonicalCorrelationPublicationCommandEncoding(right);
  } catch {
    return false;
  }
}

function canonicalCorrelationPublicationCommandEncodingUnchecked(
  command: CorrelationPublicationCommand,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationPublication",
    command.commandId,
    canonicalCorrelatedMessageAddressTuple(command.address),
    correlationPublicationPayloadTuple(command.payload),
  ]);
}

function canonicalPayloadTupleEncoding(
  payload: CorrelationPublicationPayload,
): string {
  return canonicalTypedTupleEncoding(correlationPublicationPayloadTuple(payload));
}

function correlationPublicationPayloadTuple(
  payload: CorrelationPublicationPayload,
): ReadonlyArray<CanonicalTupleValue> {
  return [payload.kind, payload.value];
}

function correlationPublicationResolutionTuple(
  resolution: CorrelationPublicationStoredResolution,
): ReadonlyArray<CanonicalTupleValue> {
  const accepted = requireCorrelationPublicationStoredResolution(resolution);
  switch (accepted.kind) {
    case CorrelationPublicationStoredResolutionKind.Semantic:
      switch (accepted.outcome.kind) {
        case CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch:
        case CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous:
          return [accepted.kind, [accepted.outcome.kind]];
        case CorrelationPublicationSemanticOutcomeKind.Committed:
          return [
            accepted.kind,
            [accepted.outcome.kind, correlationPublicationTargetTuple(
              accepted.outcome.target,
            )],
          ];
      }
      break;
    case CorrelationPublicationStoredResolutionKind.TargetInconsistent:
      return [accepted.kind, correlationPublicationTargetTuple(accepted.target)];
  }
}

function correlationPublicationTargetTuple(
  target: CorrelationPublicationTarget,
): ReadonlyArray<CanonicalTupleValue> {
  return [
    target.processInstanceId,
    [
      target.subscriptionId.processInstanceId,
      target.subscriptionId.elementId,
      target.subscriptionId.activation,
    ],
  ];
}

function isStoredResolution(
  value: unknown,
): value is CorrelationPublicationStoredResolution {
  try {
    requireCorrelationPublicationStoredResolution(value);
    return true;
  } catch {
    return false;
  }
}

function isCorrelationPublicationPayload(
  value: unknown,
): value is CorrelationPublicationPayload {
  return isRecordWithExactKeys(value, ["kind", "value"]) &&
    value.kind === "string" &&
    typeof value.value === "string" &&
    value.value.length > 0 &&
    isWellFormedWireString(value.value);
}

function isCorrelationPublicationTarget(
  value: unknown,
): value is CorrelationPublicationTarget {
  if (!isRecordWithExactKeys(value, ["processInstanceId", "subscriptionId"]) ||
    !nonemptyWireString(value.processInstanceId) ||
    !isRecordWithExactKeys(value.subscriptionId, [
      "processInstanceId",
      "elementId",
      "activation",
    ])) {
    return false;
  }
  return value.subscriptionId.processInstanceId === value.processInstanceId &&
    nonemptyWireString(value.subscriptionId.elementId) &&
    isPositiveSafeInteger(value.subscriptionId.activation);
}

function nonemptyBoundedCommandId(value: unknown): value is string {
  return nonemptyWireString(value) &&
    utf8ByteLength(value) <=
      productionCorrelationIngressConfiguration.maxCommandIdUtf8Bytes;
}

function nonemptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: ReadonlyArray<Key>,
): value is Record<Key, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
