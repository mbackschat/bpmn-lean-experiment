import {
  isCorrelatedMessageAddress,
  isCorrelatedMessageCandidate,
  isWellFormedWireString,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
  DeepReadonly,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateScanResultKind,
  canonicalCorrelatedMessageCandidateTuple,
  correlationCandidateRegistrationContentSha256,
  correlationCandidateRegistrationRequestFromRecord,
  correlationRegistrationBelongsToAddress,
  requireCorrelationCandidateRegistrationRequest,
  sameCorrelationCandidateRegistrationRequest,
} from "./correlation-candidate-registration.js";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateScanResult,
} from "./correlation-candidate-registration.js";
import {
  canonicalCorrelatedMessageAddressTuple,
  productionCorrelationIngressConfiguration,
  requireCorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import type {
  CorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnBeginCorrelationCandidateScanUpdateName =
  "bpmn-begin-correlation-candidate-scan";
export const bpmnFinishCorrelationCandidateScanUpdateName =
  "bpmn-finish-correlation-candidate-scan";
export const bpmnResolveCorrelationCandidateScanActivityName =
  "resolveBpmnCorrelationCandidateScan";

export enum CorrelationCandidateScanCompletionKind {
  Complete = "complete",
}

export type CorrelationCandidateScanRequest = DeepReadonly<{
  scanId: string;
}>;

export type CorrelationCandidateScanActivityRequest = DeepReadonly<{
  scanId: string;
  address: CorrelatedMessageAddress;
  registrations: CorrelationCandidateRegistrationRecord[];
  configuration: CorrelationIngressConfiguration;
}>;

export type CorrelationCandidateScanCompletion = DeepReadonly<{
  kind: CorrelationCandidateScanCompletionKind.Complete;
  scanId: string;
  candidates: CorrelatedMessageCandidate[];
}>;

export type CorrelationCandidateScanBeginResult =
  | CorrelationCandidateScanCompletion
  | Extract<CorrelationCandidateScanResult, {
      kind:
        | CorrelationCandidateScanResultKind.BlockedByPendingRegistration
        | CorrelationCandidateScanResultKind.BlockedByQuarantine
        | CorrelationCandidateScanResultKind.Busy;
    }>;

export type CorrelationCandidateScanFinishResult = DeepReadonly<{
  kind: CorrelationCandidateScanResultKind.Finished;
  scanId: string;
}>;

export type CorrelationCandidateScanActivities = Readonly<{
  [bpmnResolveCorrelationCandidateScanActivityName]: (
    request: CorrelationCandidateScanActivityRequest,
  ) => Promise<CorrelationCandidateScanCompletion>;
}>;

export type BpmnBeginCorrelationCandidateScanUpdateArguments = [
  request: CorrelationCandidateScanRequest,
];
export type BpmnFinishCorrelationCandidateScanUpdateArguments = [
  completion: CorrelationCandidateScanCompletion,
];

export function requireCorrelationCandidateScanRequest(
  value: unknown,
  configuration: CorrelationIngressConfiguration,
): CorrelationCandidateScanRequest {
  if (!isRecordWithExactKeys(value, ["scanId"]) ||
    !nonemptyBoundedScanId(value.scanId, configuration)) {
    throw new TypeError("Correlation candidate scan request is malformed");
  }
  return { scanId: value.scanId };
}

export function beginCorrelationCandidateScanUpdateId(
  request: CorrelationCandidateScanRequest,
): string {
  const accepted = requireCorrelationCandidateScanRequest(
    request,
    productionCorrelationIngressConfiguration,
  );
  return scanUpdateId("begin", canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateScanBegin",
    accepted.scanId,
  ]));
}

export function finishCorrelationCandidateScanUpdateId(
  completion: CorrelationCandidateScanCompletion,
): string {
  return scanUpdateId(
    "finish",
    canonicalCorrelationCandidateScanCompletionEncoding(completion),
  );
}

export function requireCorrelationCandidateScanActivityRequest(
  value: unknown,
): CorrelationCandidateScanActivityRequest {
  if (!isRecordWithExactKeys(value, [
    "scanId",
    "address",
    "registrations",
    "configuration",
  ]) ||
    !isCorrelatedMessageAddress(value.address) ||
    !Array.isArray(value.registrations)) {
    throw new TypeError("Correlation candidate scan Activity request is malformed");
  }
  const configuration = requireCorrelationIngressConfiguration(
    value.configuration,
  );
  const address = value.address as CorrelatedMessageAddress;
  const scan = requireCorrelationCandidateScanRequest(
    { scanId: value.scanId },
    configuration,
  );
  const transactionIds = new Set<string>();
  const registrations = value.registrations.map((record) => {
    if (!isRecordWithExactKeys(record, [
      "transactionId",
      "contentSha256",
      "phase",
      "candidate",
      "processLocator",
    ])) {
      throw new TypeError("Correlation candidate scan registration is malformed");
    }
    const registration = requireCorrelationCandidateRegistrationRequest({
      transactionId: record.transactionId,
      candidate: record.candidate,
      processLocator: record.processLocator,
    });
    if (
      record.phase !== CorrelationCandidateRegistrationPhase.Active ||
      record.contentSha256 !==
        correlationCandidateRegistrationContentSha256(registration) ||
      !correlationRegistrationBelongsToAddress(registration, address) ||
      transactionIds.has(registration.transactionId)
    ) {
      throw new TypeError("Correlation candidate scan registration changed");
    }
    transactionIds.add(registration.transactionId);
    return {
      ...registration,
      contentSha256: record.contentSha256,
      phase: CorrelationCandidateRegistrationPhase.Active,
    };
  });
  const request = {
    scanId: scan.scanId,
    address,
    registrations,
    configuration,
  } satisfies CorrelationCandidateScanActivityRequest;
  const observedBytes = utf8ByteLength(
    canonicalCorrelationCandidateScanActivityRequestEncodingUnchecked(request),
  );
  if (observedBytes > configuration.maxActivityPayloadBytes) {
    throw new TypeError("Correlation candidate scan Activity request exceeds its byte bound");
  }
  return request;
}

export function canonicalCorrelationCandidateScanActivityRequestEncoding(
  request: CorrelationCandidateScanActivityRequest,
): string {
  return canonicalCorrelationCandidateScanActivityRequestEncodingUnchecked(
    requireCorrelationCandidateScanActivityRequest(request),
  );
}

export function requireCorrelationCandidateScanCompletion(
  value: unknown,
  request: CorrelationCandidateScanActivityRequest,
): CorrelationCandidateScanCompletion {
  const acceptedRequest = requireCorrelationCandidateScanActivityRequest(request);
  const completion = requireCorrelationCandidateScanCompletionShape(
    value,
    acceptedRequest.configuration,
  );
  if (
    completion.scanId !== acceptedRequest.scanId ||
    completion.candidates.length !== acceptedRequest.registrations.length ||
    completion.candidates.some((candidate, index) => {
      const record = acceptedRequest.registrations[index];
      return record === undefined || !sameCorrelationCandidateRegistrationRequest(
        {
          ...correlationCandidateRegistrationRequestFromRecord(record),
          candidate,
        },
        correlationCandidateRegistrationRequestFromRecord(record),
      );
    })
  ) {
    throw new TypeError("Correlation candidate scan did not return the complete exact vector");
  }
  return completion;
}

export function canonicalCorrelationCandidateScanCompletionEncoding(
  completion: CorrelationCandidateScanCompletion,
): string {
  const accepted = requireCorrelationCandidateScanCompletionShape(
    completion,
    productionCorrelationIngressConfiguration,
  );
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateScanCompletion",
    accepted.kind,
    accepted.scanId,
    accepted.candidates.map(canonicalCorrelatedMessageCandidateTuple),
  ]);
}

export function sameCorrelationCandidateScanCompletion(
  left: unknown,
  right: unknown,
): boolean {
  try {
    return canonicalCorrelationCandidateScanCompletionEncoding(
      left as CorrelationCandidateScanCompletion,
    ) === canonicalCorrelationCandidateScanCompletionEncoding(
      right as CorrelationCandidateScanCompletion,
    );
  } catch {
    return false;
  }
}

function canonicalCorrelationCandidateScanActivityRequestEncodingUnchecked(
  request: CorrelationCandidateScanActivityRequest,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateScanActivity",
    request.scanId,
    canonicalCorrelatedMessageAddressTuple(request.address),
    request.registrations.map((record) => [
      record.transactionId,
      record.contentSha256,
      canonicalCorrelatedMessageCandidateTuple(record.candidate),
      [record.processLocator.workflowId],
    ]),
    [
      request.configuration.maxCommandIdUtf8Bytes,
      request.configuration.maxCandidateLocatorRecords,
      request.configuration.maxCandidateLocatorCanonicalBytes,
      request.configuration.maxInFlightPublications,
      request.configuration.maxQueuedPublicationRecords,
      request.configuration.maxQueuedPublicationCanonicalBytes,
      request.configuration.maxActivityPayloadBytes,
      request.configuration.maxPublicationLedgerRecords,
      request.configuration.publicationLedgerRecordBytes,
      request.configuration.maxPublicationLedgerChargedBytes,
      request.configuration.maxQueryResponseBytes,
      request.configuration.maxContinuationArgumentBytes,
      request.configuration.maxRuns,
    ],
  ]);
}

function requireCorrelationCandidateScanCompletionShape(
  value: unknown,
  configuration: CorrelationIngressConfiguration,
): CorrelationCandidateScanCompletion {
  if (!isRecordWithExactKeys(value, ["kind", "scanId", "candidates"]) ||
    value.kind !== CorrelationCandidateScanCompletionKind.Complete ||
    !nonemptyBoundedScanId(value.scanId, configuration) ||
    !Array.isArray(value.candidates) ||
    value.candidates.some((candidate) => !isCorrelatedMessageCandidate(candidate))) {
    throw new TypeError("Correlation candidate scan completion is malformed");
  }
  const completion = {
    kind: CorrelationCandidateScanCompletionKind.Complete,
    scanId: value.scanId,
    candidates: value.candidates,
  } satisfies CorrelationCandidateScanCompletion;
  const observedBytes = utf8ByteLength(canonicalTypedTupleEncoding([
    "bpmnCorrelationCandidateScanCompletion",
    completion.kind,
    completion.scanId,
    completion.candidates.map(canonicalCorrelatedMessageCandidateTuple),
  ]));
  if (observedBytes > configuration.maxActivityPayloadBytes) {
    throw new TypeError("Correlation candidate scan completion exceeds its byte bound");
  }
  return completion;
}

function scanUpdateId(phase: "begin" | "finish", encoding: string): string {
  return `bpmn-correlation-scan-${phase}-sha256:${deterministicSha256Hex(encoding)}`;
}

function nonemptyBoundedScanId(
  value: unknown,
  configuration: CorrelationIngressConfiguration,
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value) &&
    utf8ByteLength(value) <= configuration.maxCommandIdUtf8Bytes;
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
