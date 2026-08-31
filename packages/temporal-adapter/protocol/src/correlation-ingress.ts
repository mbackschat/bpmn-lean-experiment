import {
  isCorrelatedMessageAddress,
  sameCorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";

import type {
  CanonicalTupleValue,
} from "./canonical-encoding.js";
import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnCorrelationIngressWorkflowType =
  "runBpmnCorrelationIngress";
export const bpmnCorrelationIngressConfigurationQueryName =
  "bpmn-correlation-ingress-configuration";
export const bpmnCorrelationIngressProtocolVersion =
  "bpmn-correlation-ingress-v1";

export type CorrelationIngressConfiguration = Readonly<{
  maxCommandIdUtf8Bytes: number;
  maxCandidateLocatorRecords: number;
  maxCandidateLocatorCanonicalBytes: number;
  maxInFlightPublications: number;
  maxQueuedPublicationRecords: number;
  maxQueuedPublicationCanonicalBytes: number;
  maxActivityPayloadBytes: number;
  maxPublicationLedgerRecords: number;
  publicationLedgerRecordBytes: number;
  maxPublicationLedgerChargedBytes: number;
  maxQueryResponseBytes: number;
  maxContinuationArgumentBytes: number;
  maxRuns: number;
}>;

export const productionCorrelationIngressConfiguration = Object.freeze({
  maxCommandIdUtf8Bytes: 128,
  maxCandidateLocatorRecords: 128,
  maxCandidateLocatorCanonicalBytes: 64 * 1024,
  maxInFlightPublications: 1,
  maxQueuedPublicationRecords: 64,
  maxQueuedPublicationCanonicalBytes: 256 * 1024,
  maxActivityPayloadBytes: 64 * 1024,
  maxPublicationLedgerRecords: 512,
  publicationLedgerRecordBytes: 768,
  maxPublicationLedgerChargedBytes: 384 * 1024,
  maxQueryResponseBytes: 192 * 1024,
  maxContinuationArgumentBytes: 896 * 1024,
  maxRuns: 128,
} satisfies CorrelationIngressConfiguration);

export type CorrelationIngressEcho = Readonly<{
  address: CorrelatedMessageAddress;
  protocolVersion: typeof bpmnCorrelationIngressProtocolVersion;
  configuration: CorrelationIngressConfiguration;
}>;

/** Canonical complete-address tuple shared by ingress and command identities. */
export function canonicalCorrelatedMessageAddressTuple(
  address: CorrelatedMessageAddress,
): ReadonlyArray<CanonicalTupleValue> {
  if (!isCorrelatedMessageAddress(address)) {
    throw new TypeError("Correlation ingress requires one complete Message address");
  }
  return [
    [
      address.definition.compiler,
      address.definition.semanticProfile,
      address.definition.sourceId,
      address.definition.sourceSha256,
      address.definition.sourceOverlay === null
        ? ["none"]
        : [
            "some",
            address.definition.sourceOverlay.id,
            address.definition.sourceOverlay.sha256,
          ],
    ],
    address.processId,
    [
      address.channel.kind,
      address.channel.interfaceId,
      address.channel.interfaceOperationId,
      address.channel.messageId,
    ],
    address.correlationKeyId,
  ];
}

export function canonicalCorrelationIngressAddressEncoding(
  address: CorrelatedMessageAddress,
): string {
  return canonicalTypedTupleEncoding([
    "bpmnCorrelationIngressAddress",
    canonicalCorrelatedMessageAddressTuple(address),
  ]);
}

export function correlationIngressWorkflowId(
  address: CorrelatedMessageAddress,
): string {
  return `bpmn-correlation-sha256:${deterministicSha256Hex(
    canonicalCorrelationIngressAddressEncoding(address),
  )}`;
}

export function requireCorrelationIngressConfiguration(
  value: unknown,
): CorrelationIngressConfiguration {
  if (!isRecordWithExactKeys(value, configurationKeys)) {
    throw new TypeError("Correlation ingress configuration is incomplete");
  }
  for (const key of configurationKeys) {
    if (value[key] !== productionCorrelationIngressConfiguration[key]) {
      throw new TypeError(`Correlation ingress configuration changed ${key}`);
    }
  }
  return productionCorrelationIngressConfiguration;
}

export function requireCorrelationIngressEcho(
  value: unknown,
): CorrelationIngressEcho {
  if (!isRecordWithExactKeys(value, [
    "address",
    "protocolVersion",
    "configuration",
  ])) {
    throw new TypeError("Correlation ingress echo is incomplete");
  }
  if (
    !isCorrelatedMessageAddress(value.address) ||
    value.protocolVersion !== bpmnCorrelationIngressProtocolVersion
  ) {
    throw new TypeError("Correlation ingress echo identity is malformed");
  }
  return {
    address: value.address,
    protocolVersion: value.protocolVersion,
    configuration: requireCorrelationIngressConfiguration(value.configuration),
  };
}

export function createCorrelationIngressEcho(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): CorrelationIngressEcho {
  return requireCorrelationIngressEcho({
    address,
    protocolVersion: bpmnCorrelationIngressProtocolVersion,
    configuration,
  });
}

export function sameCorrelationIngressEcho(
  left: unknown,
  right: unknown,
): boolean {
  try {
    const acceptedLeft = requireCorrelationIngressEcho(left);
    const acceptedRight = requireCorrelationIngressEcho(right);
    return sameCorrelatedMessageAddress(
      acceptedLeft.address,
      acceptedRight.address,
    );
  } catch {
    return false;
  }
}

const configurationKeySet = {
  maxCommandIdUtf8Bytes: true,
  maxCandidateLocatorRecords: true,
  maxCandidateLocatorCanonicalBytes: true,
  maxInFlightPublications: true,
  maxQueuedPublicationRecords: true,
  maxQueuedPublicationCanonicalBytes: true,
  maxActivityPayloadBytes: true,
  maxPublicationLedgerRecords: true,
  publicationLedgerRecordBytes: true,
  maxPublicationLedgerChargedBytes: true,
  maxQueryResponseBytes: true,
  maxContinuationArgumentBytes: true,
  maxRuns: true,
} satisfies { [Key in keyof CorrelationIngressConfiguration]: true };

const configurationKeys = Object.freeze(
  Object.keys(configurationKeySet) as Array<keyof CorrelationIngressConfiguration>,
);

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
