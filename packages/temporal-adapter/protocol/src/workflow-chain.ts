import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  DeepReadonly,
} from "@bpmn-lean/semantic-core";

import { isTerminalProcessReceipt } from "./lifecycle-results.js";
import type { TerminalProcessReceipt } from "./contracts.js";

export const bpmnWorkflowChainProtocolV1 =
  "bpmn-lean.workflow-chain.v1";
export const bpmnWorkflowChainCommandRecoveryQueryName =
  "bpmn-workflow-chain-command-recovery";
export const bpmnWorkflowChainCapacityExhaustedFailureType =
  "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED";

/** Every count or canonical-byte ceiling selected by the v1 Workflow-chain contract. */
export enum WorkflowChainBudgetKind {
  EventHistoryEvents = "eventHistoryEvents",
  EventHistoryBytes = "eventHistoryBytes",
  RetainedRunTraceAndPublicationBytes = "retainedRunTraceAndPublicationBytes",
  AcceptedUpdatesPerRun = "acceptedUpdatesPerRun",
  ConcurrentInFlightUpdates = "concurrentInFlightUpdates",
  SemanticInputQueueEntries = "semanticInputQueueEntries",
  SemanticInputQueueBytes = "semanticInputQueueBytes",
  PendingActivities = "pendingActivities",
  PendingTimers = "pendingTimers",
  PendingChildWorkflows = "pendingChildWorkflows",
  PendingExternalSignals = "pendingExternalSignals",
  PendingExternalCancellationRequests = "pendingExternalCancellationRequests",
  SemanticProcessProgramBytes = "semanticProcessProgramBytes",
  InitialStartStimulusBytes = "initialStartStimulusBytes",
  SemanticStimulusBytes = "semanticStimulusBytes",
  CommittedRuntimeStateBytes = "committedRuntimeStateBytes",
  PublicationBatchBytes = "publicationBatchBytes",
  CommandRecoveryLedgerEntries = "commandRecoveryLedgerEntries",
  CommandRecoveryLedgerBytes = "commandRecoveryLedgerBytes",
  PublicationContinuationAndSegmentDirectoryEntries =
    "publicationContinuationAndSegmentDirectoryEntries",
  PublicationContinuationAndSegmentDirectoryBytes =
    "publicationContinuationAndSegmentDirectoryBytes",
  QueryResponseBytes = "queryResponseBytes",
  TerminalResultEnvelopeBytes = "terminalResultEnvelopeBytes",
  EffectActivityRequestBytes = "effectActivityRequestBytes",
  EffectActivityResultBytes = "effectActivityResultBytes",
  EffectActivityFailureProjectionBytes = "effectActivityFailureProjectionBytes",
  CorrelationRegistrationContinuationBytes =
    "correlationRegistrationContinuationBytes",
  ContinueAsNewCarriedArgumentsBytes = "continueAsNewCarriedArgumentsBytes",
  WorkflowChainRuns = "workflowChainRuns",
}

/** The production ceiling. Test configuration may lower it but cannot raise it. */
export function workflowChainProductionLimit(
  kind: WorkflowChainBudgetKind,
): number {
  switch (kind) {
    case WorkflowChainBudgetKind.EventHistoryEvents:
      return 8_000;
    case WorkflowChainBudgetKind.EventHistoryBytes:
      return 8 * 1_024 * 1_024;
    case WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes:
      return 2 * 1_024 * 1_024;
    case WorkflowChainBudgetKind.AcceptedUpdatesPerRun:
      return 1_500;
    case WorkflowChainBudgetKind.ConcurrentInFlightUpdates:
      return 8;
    case WorkflowChainBudgetKind.SemanticInputQueueEntries:
      return 64;
    case WorkflowChainBudgetKind.SemanticInputQueueBytes:
      return 256 * 1_024;
    case WorkflowChainBudgetKind.PendingActivities:
      return 1;
    case WorkflowChainBudgetKind.PendingTimers:
      return 64;
    case WorkflowChainBudgetKind.PendingChildWorkflows:
    case WorkflowChainBudgetKind.PendingExternalSignals:
    case WorkflowChainBudgetKind.PendingExternalCancellationRequests:
      return 0;
    case WorkflowChainBudgetKind.SemanticProcessProgramBytes:
      return 192 * 1_024;
    case WorkflowChainBudgetKind.InitialStartStimulusBytes:
    case WorkflowChainBudgetKind.SemanticStimulusBytes:
    case WorkflowChainBudgetKind.CommittedRuntimeStateBytes:
    case WorkflowChainBudgetKind.PublicationBatchBytes:
    case WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes:
    case WorkflowChainBudgetKind.EffectActivityRequestBytes:
    case WorkflowChainBudgetKind.EffectActivityResultBytes:
    case WorkflowChainBudgetKind.CorrelationRegistrationContinuationBytes:
      return 64 * 1_024;
    case WorkflowChainBudgetKind.CommandRecoveryLedgerEntries:
      return 512;
    case WorkflowChainBudgetKind.CommandRecoveryLedgerBytes:
      return 96 * 1_024;
    case WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryEntries:
    case WorkflowChainBudgetKind.WorkflowChainRuns:
      return 128;
    case WorkflowChainBudgetKind.QueryResponseBytes:
    case WorkflowChainBudgetKind.TerminalResultEnvelopeBytes:
      return 192 * 1_024;
    case WorkflowChainBudgetKind.EffectActivityFailureProjectionBytes:
      return 16 * 1_024;
    case WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes:
      return 448 * 1_024;
    default:
      return assertNever(kind);
  }
}

export function isWithinWorkflowChainBudget(
  kind: WorkflowChainBudgetKind,
  observedValue: number,
): boolean {
  requireNonnegativeSafeInteger(observedValue, "observed budget value");
  return observedValue <= workflowChainProductionLimit(kind);
}

/** Encodes the strict project-owned canonical JSON used for every v1 byte budget. */
export function canonicalWorkflowChainJson(value: unknown): string {
  return encodeCanonicalJson(value, new Set<object>());
}

export function workflowChainCanonicalUtf8ByteLength(value: unknown): number {
  return utf8ByteLength(canonicalWorkflowChainJson(value));
}

/** Returns the measured bytes or throws before an over-budget value can cross a boundary. */
export function requireWorkflowChainCanonicalByteBudget(
  kind: WorkflowChainBudgetKind,
  value: unknown,
): number {
  const observedValue = workflowChainCanonicalUtf8ByteLength(value);
  const configuredBound = workflowChainProductionLimit(kind);
  if (observedValue > configuredBound) {
    throw new RangeError(
      `${kind} exceeds ${configuredBound} canonical UTF-8 bytes: ${observedValue}`,
    );
  }
  return observedValue;
}

export type WorkflowChainCommandRecoveryRequest = DeepReadonly<{
  protocol: typeof bpmnWorkflowChainProtocolV1;
  processInstanceId: string;
  commandId: string;
  stimulusSha256: string;
}>;

/** The lifetime ledger stores only the first content-bound semantic resolution. */
export type WorkflowChainRecoveryEntry = DeepReadonly<{
  commandId: string;
  stimulusSha256: string;
  outcome: CommandOutcome;
}>;

export enum WorkflowChainCommandRecoveryResponseKind {
  Resolved = "resolved",
  IdentityConflict = "identityConflict",
  UnknownWhileActive = "unknownWhileActive",
  TerminalWithoutEntry = "terminalWithoutEntry",
  CapacityFailedWithoutEntry = "capacityFailedWithoutEntry",
}

export type WorkflowChainCapacityFailureDetails = DeepReadonly<{
  budget: WorkflowChainBudgetKind;
  configuredBound: number;
  observedValue: number;
  processInstanceId: string;
  publicRevision: number;
  runOrdinal: number;
}>;

type RecoveryIdentityEcho = WorkflowChainCommandRecoveryRequest;

export type WorkflowChainCommandRecoveryResponse = DeepReadonly<
  | (RecoveryIdentityEcho & {
      kind: WorkflowChainCommandRecoveryResponseKind.Resolved;
      outcome: CommandOutcome;
    })
  | (RecoveryIdentityEcho & {
      kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict;
    })
  | (RecoveryIdentityEcho & {
      kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive;
    })
  | (RecoveryIdentityEcho & {
      kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry;
      receipt: TerminalProcessReceipt;
    })
  | (RecoveryIdentityEcho & {
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry;
      failure: WorkflowChainCapacityFailureDetails;
    })
>;

export function requireWorkflowChainCommandRecoveryRequest(
  value: unknown,
): WorkflowChainCommandRecoveryRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, recoveryIdentityKeys)) {
    throw new TypeError("Malformed Workflow-chain recovery request");
  }
  requireRecoveryIdentity(value);
  return value as WorkflowChainCommandRecoveryRequest;
}

/** Canonical map key for the exact four-field recovery identity tuple. */
export function canonicalWorkflowChainRecoveryIdentity(
  value: unknown,
): string {
  const identity = requireWorkflowChainCommandRecoveryRequest(value);
  return canonicalWorkflowChainJson([
    identity.protocol,
    identity.processInstanceId,
    identity.commandId,
    identity.stimulusSha256,
  ]);
}

export function requireWorkflowChainRecoveryEntry(
  value: unknown,
): WorkflowChainRecoveryEntry {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "commandId",
    "stimulusSha256",
    "outcome",
  ])) {
    throw new TypeError("Malformed Workflow-chain recovery entry");
  }
  requireIdentityString(value.commandId, "command ID");
  requireSha256(value.stimulusSha256, "stimulus SHA-256");
  requireCommandOutcome(value.outcome);
  return value as WorkflowChainRecoveryEntry;
}

export function requireWorkflowChainCapacityFailureDetails(
  value: unknown,
): WorkflowChainCapacityFailureDetails {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "budget",
    "configuredBound",
    "observedValue",
    "processInstanceId",
    "publicRevision",
    "runOrdinal",
  ])) {
    throw new TypeError("Malformed Workflow-chain capacity-failure details");
  }
  const budget = requireWorkflowChainBudgetKind(value.budget);
  requireNonnegativeSafeInteger(value.configuredBound, "configured bound");
  requireNonnegativeSafeInteger(value.observedValue, "observed value");
  requireIdentityString(value.processInstanceId, "Process-instance ID");
  requireNonnegativeSafeInteger(value.publicRevision, "public revision");
  requirePositiveSafeInteger(value.runOrdinal, "Run ordinal");
  if (value.configuredBound > workflowChainProductionLimit(budget)) {
    throw new RangeError("Configured Workflow-chain bound exceeds production");
  }
  if (value.observedValue < value.configuredBound) {
    throw new RangeError("Capacity failure requires an exhausted configured bound");
  }
  return value as WorkflowChainCapacityFailureDetails;
}

/**
 * Validates the closed recovery result before a client may interpret it.
 *
 * The expected request is authoritative. A response cannot redirect recovery to another Process,
 * command, or stimulus while preserving a plausible result shape.
 */
export function requireWorkflowChainCommandRecoveryResponse(
  value: unknown,
  expected: WorkflowChainCommandRecoveryRequest,
): WorkflowChainCommandRecoveryResponse {
  const expectedIdentity = requireWorkflowChainCommandRecoveryRequest(expected);
  if (!isRecord(value)) {
    throw new TypeError("Malformed Workflow-chain recovery response");
  }
  requireRecoveryIdentity(value);
  requireMatchingRecoveryIdentity(value, expectedIdentity);

  switch (value.kind) {
    case WorkflowChainCommandRecoveryResponseKind.Resolved:
      requireOnlyResponseKeys(value, ["outcome"]);
      requireCommandOutcome(value.outcome);
      break;
    case WorkflowChainCommandRecoveryResponseKind.IdentityConflict:
    case WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive:
      requireOnlyResponseKeys(value, []);
      break;
    case WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry:
      requireOnlyResponseKeys(value, ["receipt"]);
      if (
        !isTerminalProcessReceipt(value.receipt) ||
        value.receipt.processInstanceId !== expectedIdentity.processInstanceId
      ) {
        throw new TypeError("Invalid terminal receipt in recovery response");
      }
      break;
    case WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry: {
      requireOnlyResponseKeys(value, ["failure"]);
      const failure = requireWorkflowChainCapacityFailureDetails(value.failure);
      if (failure.processInstanceId !== expectedIdentity.processInstanceId) {
        throw new TypeError("Capacity failure has mismatched recovery identity");
      }
      break;
    }
    default:
      throw new TypeError("Malformed Workflow-chain recovery response variant");
  }
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.QueryResponseBytes,
    value,
  );
  return value as WorkflowChainCommandRecoveryResponse;
}

const recoveryIdentityKeys = [
  "protocol",
  "processInstanceId",
  "commandId",
  "stimulusSha256",
] as const;

function requireRecoveryIdentity(value: Record<string, unknown>): void {
  if (value.protocol !== bpmnWorkflowChainProtocolV1) {
    throw new TypeError("Invalid Workflow-chain recovery protocol");
  }
  requireIdentityString(value.processInstanceId, "Process-instance ID");
  requireIdentityString(value.commandId, "command ID");
  requireSha256(value.stimulusSha256, "stimulus SHA-256");
}

function requireMatchingRecoveryIdentity(
  value: Record<string, unknown>,
  expected: WorkflowChainCommandRecoveryRequest,
): void {
  if (
    value.protocol !== expected.protocol ||
    value.processInstanceId !== expected.processInstanceId ||
    value.commandId !== expected.commandId ||
    value.stimulusSha256 !== expected.stimulusSha256
  ) {
    throw new TypeError("Workflow-chain recovery identity mismatch");
  }
}

function requireOnlyResponseKeys(
  value: Record<string, unknown>,
  variantKeys: ReadonlyArray<string>,
): void {
  if (!hasOnlyKeys(value, [...recoveryIdentityKeys, "kind", ...variantKeys])) {
    throw new TypeError("Malformed Workflow-chain recovery response variant");
  }
}

function requireWorkflowChainBudgetKind(
  value: unknown,
): WorkflowChainBudgetKind {
  switch (value) {
    case WorkflowChainBudgetKind.EventHistoryEvents:
    case WorkflowChainBudgetKind.EventHistoryBytes:
    case WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes:
    case WorkflowChainBudgetKind.AcceptedUpdatesPerRun:
    case WorkflowChainBudgetKind.ConcurrentInFlightUpdates:
    case WorkflowChainBudgetKind.SemanticInputQueueEntries:
    case WorkflowChainBudgetKind.SemanticInputQueueBytes:
    case WorkflowChainBudgetKind.PendingActivities:
    case WorkflowChainBudgetKind.PendingTimers:
    case WorkflowChainBudgetKind.PendingChildWorkflows:
    case WorkflowChainBudgetKind.PendingExternalSignals:
    case WorkflowChainBudgetKind.PendingExternalCancellationRequests:
    case WorkflowChainBudgetKind.SemanticProcessProgramBytes:
    case WorkflowChainBudgetKind.InitialStartStimulusBytes:
    case WorkflowChainBudgetKind.SemanticStimulusBytes:
    case WorkflowChainBudgetKind.CommittedRuntimeStateBytes:
    case WorkflowChainBudgetKind.PublicationBatchBytes:
    case WorkflowChainBudgetKind.CommandRecoveryLedgerEntries:
    case WorkflowChainBudgetKind.CommandRecoveryLedgerBytes:
    case WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryEntries:
    case WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes:
    case WorkflowChainBudgetKind.QueryResponseBytes:
    case WorkflowChainBudgetKind.TerminalResultEnvelopeBytes:
    case WorkflowChainBudgetKind.EffectActivityRequestBytes:
    case WorkflowChainBudgetKind.EffectActivityResultBytes:
    case WorkflowChainBudgetKind.EffectActivityFailureProjectionBytes:
    case WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes:
    case WorkflowChainBudgetKind.WorkflowChainRuns:
      return value;
    default:
      throw new TypeError("Unknown Workflow-chain budget");
  }
}

function requireCommandOutcome(value: unknown): asserts value is CommandOutcome {
  switch (value) {
    case "committed":
    case "rolledBack":
    case "rejected":
    case "semanticFailure":
    case "unsupported":
      return;
    default:
      throw new TypeError("Malformed semantic command outcome");
  }
}

function encodeCanonicalJson(
  value: unknown,
  ancestors: Set<object>,
): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("Canonical Workflow-chain JSON requires safe integers");
      }
      return String(value);
    case "string":
      return canonicalString(value);
    case "object":
      return encodeCanonicalObject(value, ancestors);
    default:
      throw new TypeError("Canonical Workflow-chain JSON rejects unsupported values");
  }
}

function encodeCanonicalObject(
  value: object,
  ancestors: Set<object>,
): string {
  if (ancestors.has(value)) {
    throw new TypeError("Canonical Workflow-chain JSON rejects cyclic values");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      requireDenseCanonicalArray(value);
      return `[${value.map((member) =>
        encodeCanonicalJson(member, ancestors)
      ).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical Workflow-chain JSON requires plain objects");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCanonicalStrings);
    requireCanonicalRecordProperties(record, keys);
    return `{${keys.map((key) =>
      `${canonicalString(key)}:${encodeCanonicalJson(record[key], ancestors)}`
    ).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function requireDenseCanonicalArray(value: ReadonlyArray<unknown>): void {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.length !== value.length + 1 ||
    !ownKeys.includes("length")
  ) {
    throw new TypeError(
      "Canonical Workflow-chain JSON requires dense arrays of enumerable data properties",
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError(
        "Canonical Workflow-chain JSON requires dense arrays of enumerable data properties",
      );
    }
  }
}

function requireCanonicalRecordProperties(
  value: Record<string, unknown>,
  enumerableKeys: ReadonlyArray<string>,
): void {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== enumerableKeys.length ||
    ownKeys.some((key) => typeof key !== "string")
  ) {
    throw new TypeError("Canonical Workflow-chain JSON rejects hidden properties");
  }
  for (const key of enumerableKeys) {
    if (!isWellFormedWireString(key)) {
      throw new TypeError("Canonical Workflow-chain JSON requires Unicode scalar keys");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError("Canonical Workflow-chain JSON rejects accessors");
    }
  }
}

function canonicalString(value: string): string {
  if (!isWellFormedWireString(value)) {
    throw new TypeError("Canonical Workflow-chain JSON requires Unicode scalars");
  }
  let result = "\"";
  for (const scalar of value) {
    const point = scalar.codePointAt(0);
    if (point === undefined) {
      throw new TypeError("Canonical Workflow-chain JSON requires Unicode scalars");
    }
    switch (point) {
      case 0x08:
        result += "\\b";
        break;
      case 0x09:
        result += "\\t";
        break;
      case 0x0a:
        result += "\\n";
        break;
      case 0x0c:
        result += "\\f";
        break;
      case 0x0d:
        result += "\\r";
        break;
      case 0x22:
        result += '\\"';
        break;
      case 0x5c:
        result += "\\\\";
        break;
      default:
        result += point <= 0x1f
          ? `\\u00${point.toString(16).padStart(2, "0")}`
          : scalar;
    }
  }
  return `${result}\"`;
}

function requireIdentityString(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isWellFormedWireString(value) || value.length === 0) {
    throw new TypeError(`Workflow-chain ${label} must be a non-empty wire string`);
  }
}

function requireSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`Workflow-chain ${label} must be lowercase hexadecimal`);
  }
}

function requireNonnegativeSafeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Workflow-chain ${label} must be a non-negative safe integer`);
  }
}

function requirePositiveSafeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Workflow-chain ${label} must be a positive safe integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlyArray<string>,
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set(allowedKeys);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow-chain budget: ${String(value)}`);
}
