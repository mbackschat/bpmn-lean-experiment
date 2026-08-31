import { VariableValueKind } from "./contract.js";
import type {
  MessageSubscriptionId,
  VariableValue,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { isMessageChannel, sameMessageChannel } from "./message-channel.js";
import {
  SemanticProcessCompilerId,
} from "./semantic-process-contract.js";
import type {
  SemanticProcessIdentity,
} from "./semantic-process-contract.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import type { MessageChannel } from "./semantic-value-contract.js";
import {
  isSourceOverlayIdentityOrNull,
  sameSourceOverlayIdentity,
} from "./source-overlay-identity.js";
import { isWellFormedWireString } from "./wire.js";

/** Complete immutable definition address for one global correlated Message population. */
export type CorrelatedMessageAddress = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
  correlationKeyId: string;
}>;

/** One exact candidate projected from committed Process state under an ingress-held barrier. */
export type CorrelatedMessageCandidate = DeepReadonly<{
  address: CorrelatedMessageAddress;
  processInstanceId: string;
  subscriptionId: MessageSubscriptionId;
  correlationPropertyId: string;
  processPropertyId: string;
  key: Extract<VariableValue, { kind: typeof VariableValueKind.String }>;
}>;

export const CorrelatedMessageMatchKind = Object.freeze({
  NoMatch: "noMatch",
  Unique: "unique",
  Ambiguous: "ambiguous",
} as const);

export type CorrelatedMessageMatch =
  | DeepReadonly<{ kind: typeof CorrelatedMessageMatchKind.NoMatch }>
  | DeepReadonly<{
      kind: typeof CorrelatedMessageMatchKind.Unique;
      candidate: CorrelatedMessageCandidate;
    }>
  | DeepReadonly<{ kind: typeof CorrelatedMessageMatchKind.Ambiguous }>;

/** Pure exact-cardinality matcher; malformed candidate evidence fails closed before filtering. */
export function matchCorrelatedMessageCandidates(
  address: CorrelatedMessageAddress,
  payload: VariableValue,
  candidates: ReadonlyArray<CorrelatedMessageCandidate>,
): CorrelatedMessageMatch | null {
  if (
    !isCorrelatedMessageAddress(address) ||
    payload.kind !== VariableValueKind.String ||
    payload.value.length === 0 ||
    !isWellFormedWireString(payload.value) ||
    candidates.some((candidate) => !isCorrelatedMessageCandidate(candidate))
  ) {
    return null;
  }
  const matches = candidates.filter((candidate) =>
    sameCorrelatedMessageAddress(candidate.address, address) &&
    candidate.key.value === payload.value
  );
  switch (matches.length) {
    case 0:
      return { kind: CorrelatedMessageMatchKind.NoMatch };
    case 1:
      return {
        kind: CorrelatedMessageMatchKind.Unique,
        candidate: matches[0]!,
      };
    default:
      return { kind: CorrelatedMessageMatchKind.Ambiguous };
  }
}

export function sameCorrelatedMessageAddress(
  left: CorrelatedMessageAddress,
  right: CorrelatedMessageAddress,
): boolean {
  return left.definition.compiler === right.definition.compiler &&
    left.definition.semanticProfile === right.definition.semanticProfile &&
    left.definition.sourceId === right.definition.sourceId &&
    left.definition.sourceSha256 === right.definition.sourceSha256 &&
    sameSourceOverlayIdentity(
      left.definition.sourceOverlay,
      right.definition.sourceOverlay,
    ) &&
    left.processId === right.processId &&
    sameMessageChannel(left.channel, right.channel) &&
    left.correlationKeyId === right.correlationKeyId;
}

export function isCorrelatedMessageAddress(
  value: unknown,
): value is CorrelatedMessageAddress {
  if (!isRecordWithKeys(value, [
    "definition",
    "processId",
    "channel",
    "correlationKeyId",
  ])) {
    return false;
  }
  const definition = value.definition;
  return isRecordWithKeys(definition, [
    "compiler",
    "semanticProfile",
    "sourceId",
    "sourceSha256",
    "sourceOverlay",
  ]) &&
    definition.compiler === SemanticProcessCompilerId.BpmnSourceSemanticProcess &&
    nonemptyWireString(definition.semanticProfile) &&
    nonemptyWireString(definition.sourceId) &&
    typeof definition.sourceSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(definition.sourceSha256) &&
    isSourceOverlayIdentityOrNull(definition.sourceOverlay) &&
    nonemptyWireString(value.processId) &&
    isMessageChannel(value.channel) &&
    value.channel.kind === MessageChannelKind.OperationMessage &&
    nonemptyWireString(value.correlationKeyId);
}

export function isCorrelatedMessageCandidate(
  value: unknown,
): value is CorrelatedMessageCandidate {
  if (!isRecordWithKeys(value, [
    "address",
    "processInstanceId",
    "subscriptionId",
    "correlationPropertyId",
    "processPropertyId",
    "key",
  ])) {
    return false;
  }
  const subscriptionId = value.subscriptionId;
  const key = value.key;
  return isCorrelatedMessageAddress(value.address) &&
    nonemptyWireString(value.processInstanceId) &&
    isRecordWithKeys(subscriptionId, [
      "processInstanceId",
      "elementId",
      "activation",
    ]) &&
    subscriptionId.processInstanceId === value.processInstanceId &&
    nonemptyWireString(subscriptionId.elementId) &&
    Number.isSafeInteger(subscriptionId.activation) &&
    typeof subscriptionId.activation === "number" &&
    subscriptionId.activation > 0 &&
    nonemptyWireString(value.correlationPropertyId) &&
    nonemptyWireString(value.processPropertyId) &&
    isRecordWithKeys(key, ["kind", "value"]) &&
    key.kind === VariableValueKind.String &&
    nonemptyWireString(key.value);
}

function nonemptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function isRecordWithKeys<K extends string>(
  value: unknown,
  keys: ReadonlyArray<K>,
): value is Record<K, unknown> {
  return typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}
