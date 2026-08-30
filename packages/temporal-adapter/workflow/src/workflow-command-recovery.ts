import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  canonicalStimulusEncoding,
  deterministicSha256Hex,
  requireWorkflowChainCommandRecoveryRequest,
  requireWorkflowChainCommandRecoveryResponse,
  requireWorkflowChainRecoveryEntry,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  TerminalProcessReceipt,
  WorkflowChainCapacityFailureDetails,
  WorkflowChainCommandRecoveryRequest,
  WorkflowChainCommandRecoveryResponse,
  WorkflowChainRecoveryEntry,
} from "@bpmn-lean/temporal-protocol";

export type WorkflowCommandRecoveryLimits = Readonly<{
  entryCount: number;
  canonicalUtf8Bytes: number;
}>;

export type WorkflowCommandRecoveryLedgerOptions = Readonly<{
  entries?: ReadonlyArray<WorkflowChainRecoveryEntry>;
  limits?: WorkflowCommandRecoveryLimits;
}>;

export enum WorkflowCommandRecoveryLookupKind {
  Resolved = "resolved",
  IdentityConflict = "identityConflict",
  Unseen = "unseen",
}

export type WorkflowCommandRecoveryLookup =
  | Readonly<{
      kind: WorkflowCommandRecoveryLookupKind.Resolved;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: WorkflowCommandRecoveryLookupKind.IdentityConflict;
    }>
  | Readonly<{
      kind: WorkflowCommandRecoveryLookupKind.Unseen;
    }>;

export enum WorkflowCommandRecoveryPreflightKind {
  Resolved = "resolved",
  IdentityConflict = "identityConflict",
  Admitted = "admitted",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowCommandRecoveryAdmission = Readonly<{
  commandId: string;
  stimulusSha256: string;
  expectedEntryCount: number;
  expectedCanonicalUtf8Bytes: number;
  worstCaseCanonicalUtf8Bytes: number;
}>;

export type WorkflowCommandRecoveryPreflight =
  | Readonly<{
      kind: WorkflowCommandRecoveryPreflightKind.Resolved;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: WorkflowCommandRecoveryPreflightKind.IdentityConflict;
    }>
  | Readonly<{
      kind: WorkflowCommandRecoveryPreflightKind.Admitted;
      admission: WorkflowCommandRecoveryAdmission;
    }>
  | Readonly<{
      kind: WorkflowCommandRecoveryPreflightKind.CapacityExceeded;
      commandId: string;
      stimulusSha256: string;
      observedEntryCount: number;
      observedCanonicalUtf8Bytes: number;
      exhausted: ReadonlyArray<
        | WorkflowChainBudgetKind.CommandRecoveryLedgerEntries
        | WorkflowChainBudgetKind.CommandRecoveryLedgerBytes
      >;
    }>;

export type WorkflowCommandRecoveryRecordResult = Readonly<{
  entry: WorkflowChainRecoveryEntry;
  filledBounds: ReadonlyArray<WorkflowCommandRecoveryCapacityBound>;
}>;

export type WorkflowCommandRecoveryCapacityBound = Readonly<{
  budget:
    | WorkflowChainBudgetKind.CommandRecoveryLedgerEntries
    | WorkflowChainBudgetKind.CommandRecoveryLedgerBytes;
  configuredBound: number;
  observedValue: number;
}>;

export type WorkflowCommandRecoveryCapacityInspection = Readonly<{
  commandId: string;
  stimulusSha256: string;
  observedEntryCount: number;
  observedCanonicalUtf8Bytes: number;
  exhaustedBounds: ReadonlyArray<WorkflowCommandRecoveryCapacityBound>;
}>;

export type WorkflowCommandRecoveryFallback =
  | Readonly<{
      kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive;
    }>
  | Readonly<{
      kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry;
      receipt: TerminalProcessReceipt;
    }>
  | Readonly<{
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry;
      failure: WorkflowChainCapacityFailureDetails;
    }>;

export function workflowCommandStimulusSha256(stimulus: Stimulus): string {
  return deterministicSha256Hex(canonicalStimulusEncoding(stimulus));
}

/**
 * Owns the carried lifetime ledger without retaining semantic stimuli or transient host handles.
 * Admission is deliberately serial: one issued preflight must resolve before another unseen
 * command can reserve the same final slot.
 */
export class WorkflowCommandRecoveryLedger {
  readonly #limits: WorkflowCommandRecoveryLimits;
  readonly #entries: WorkflowChainRecoveryEntry[];
  #pendingAdmission: WorkflowCommandRecoveryAdmission | null = null;

  constructor(options: WorkflowCommandRecoveryLedgerOptions = {}) {
    this.#limits = requireLimits(options.limits ?? productionLimits());
    this.#entries = requireInitialEntries(options.entries ?? []);
    if (
      this.#entries.length > this.#limits.entryCount ||
      ledgerCanonicalUtf8Bytes(this.#entries) >
        this.#limits.canonicalUtf8Bytes
    ) {
      throw new RangeError("Initial command-recovery ledger exceeds configured limits");
    }
  }

  snapshot(): ReadonlyArray<WorkflowChainRecoveryEntry> {
    return this.#entries.map((entry) => ({ ...entry }));
  }

  lookup(stimulus: Stimulus): WorkflowCommandRecoveryLookup {
    requireExternallyRetryableStimulus(stimulus);
    return this.#lookupIdentity(
      stimulus.commandId,
      workflowCommandStimulusSha256(stimulus),
    );
  }

  /** Measures an unseen candidate without reserving a ledger slot or changing recovery state. */
  inspectUnseenCapacity(
    stimulus: Stimulus,
  ): WorkflowCommandRecoveryCapacityInspection {
    requireExternallyRetryableStimulus(stimulus);
    const commandId = stimulus.commandId;
    const stimulusSha256 = workflowCommandStimulusSha256(stimulus);
    if (
      this.#lookupIdentity(commandId, stimulusSha256).kind !==
        WorkflowCommandRecoveryLookupKind.Unseen
    ) {
      throw new TypeError("Command-recovery capacity inspection requires an unseen command");
    }
    return this.#inspectUnseenCapacity(commandId, stimulusSha256);
  }

  preflight(stimulus: Stimulus): WorkflowCommandRecoveryPreflight {
    requireExternallyRetryableStimulus(stimulus);
    const commandId = stimulus.commandId;
    const stimulusSha256 = workflowCommandStimulusSha256(stimulus);
    const existing = this.#lookupIdentity(commandId, stimulusSha256);
    switch (existing.kind) {
      case WorkflowCommandRecoveryLookupKind.Resolved:
        return {
          kind: WorkflowCommandRecoveryPreflightKind.Resolved,
          outcome: existing.outcome,
        };
      case WorkflowCommandRecoveryLookupKind.IdentityConflict:
        return {
          kind: WorkflowCommandRecoveryPreflightKind.IdentityConflict,
        };
      case WorkflowCommandRecoveryLookupKind.Unseen:
        break;
      default:
        return assertNever(existing);
    }

    if (this.#pendingAdmission !== null) {
      throw new TypeError(
        "Command-recovery preflight requires the prior admission to resolve",
      );
    }
    const inspection = this.#inspectUnseenCapacity(commandId, stimulusSha256);
    const {
      observedEntryCount,
      observedCanonicalUtf8Bytes,
      exhaustedBounds,
    } = inspection;
    const exhausted = exhaustedBounds.map((bound) => bound.budget);
    if (exhausted.length > 0) {
      return {
        kind: WorkflowCommandRecoveryPreflightKind.CapacityExceeded,
        commandId,
        stimulusSha256,
        observedEntryCount,
        observedCanonicalUtf8Bytes,
        exhausted,
      };
    }

    const admission = Object.freeze({
      commandId,
      stimulusSha256,
      expectedEntryCount: this.#entries.length,
      expectedCanonicalUtf8Bytes: ledgerCanonicalUtf8Bytes(this.#entries),
      worstCaseCanonicalUtf8Bytes: observedCanonicalUtf8Bytes,
    });
    this.#pendingAdmission = admission;
    return {
      kind: WorkflowCommandRecoveryPreflightKind.Admitted,
      admission,
    };
  }

  record(
    admission: WorkflowCommandRecoveryAdmission,
    outcome: CommandOutcome,
  ): WorkflowCommandRecoveryRecordResult {
    if (admission !== this.#pendingAdmission) {
      throw new TypeError("Command outcome has no matching issued preflight");
    }
    if (
      this.#entries.length !== admission.expectedEntryCount ||
      ledgerCanonicalUtf8Bytes(this.#entries) !==
        admission.expectedCanonicalUtf8Bytes ||
      this.#lookupIdentity(
        admission.commandId,
        admission.stimulusSha256,
      ).kind !== WorkflowCommandRecoveryLookupKind.Unseen
    ) {
      throw new TypeError("Command outcome does not match its preflight candidate");
    }

    const entry = recoveryEntry(
      admission.commandId,
      admission.stimulusSha256,
      outcome,
    );
    const candidate = [...this.#entries, entry];
    const candidateBytes = ledgerCanonicalUtf8Bytes(candidate);
    if (
      candidate.length > this.#limits.entryCount ||
      candidateBytes > this.#limits.canonicalUtf8Bytes ||
      candidateBytes > admission.worstCaseCanonicalUtf8Bytes
    ) {
      throw new RangeError("Recorded command outcome exceeds its preflight bounds");
    }

    this.#entries.push(entry);
    this.#pendingAdmission = null;
    const filledBounds = filledBoundsFor(
      this.#limits,
      candidate.length,
      candidateBytes,
    );
    return {
      entry: { ...entry },
      filledBounds,
    };
  }

  projectResponse(
    processInstanceId: string,
    request: WorkflowChainCommandRecoveryRequest,
    fallback: WorkflowCommandRecoveryFallback,
  ): WorkflowChainCommandRecoveryResponse {
    const identity = requireWorkflowChainCommandRecoveryRequest(request);
    if (identity.processInstanceId !== processInstanceId) {
      throw new TypeError("Workflow-chain recovery Process-instance mismatch");
    }

    const existing = this.#lookupIdentity(
      identity.commandId,
      identity.stimulusSha256,
    );
    let response: WorkflowChainCommandRecoveryResponse;
    switch (existing.kind) {
      case WorkflowCommandRecoveryLookupKind.Resolved:
        response = {
          ...identity,
          kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
          outcome: existing.outcome,
        };
        break;
      case WorkflowCommandRecoveryLookupKind.IdentityConflict:
        response = {
          ...identity,
          kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
        };
        break;
      case WorkflowCommandRecoveryLookupKind.Unseen:
        response = { ...identity, ...fallback };
        break;
      default:
        return assertNever(existing);
    }
    return requireWorkflowChainCommandRecoveryResponse(response, identity);
  }

  #lookupIdentity(
    commandId: string,
    stimulusSha256: string,
  ): WorkflowCommandRecoveryLookup {
    const entry = this.#entries.find(
      (candidate) => candidate.commandId === commandId,
    );
    if (entry === undefined) {
      return { kind: WorkflowCommandRecoveryLookupKind.Unseen };
    }
    return entry.stimulusSha256 === stimulusSha256
      ? {
          kind: WorkflowCommandRecoveryLookupKind.Resolved,
          outcome: entry.outcome,
        }
      : { kind: WorkflowCommandRecoveryLookupKind.IdentityConflict };
  }

  #inspectUnseenCapacity(
    commandId: string,
    stimulusSha256: string,
  ): WorkflowCommandRecoveryCapacityInspection {
    const worstCaseEntry = recoveryEntry(
      commandId,
      stimulusSha256,
      CommandOutcome.SemanticFailure,
    );
    const observedEntryCount = this.#entries.length + 1;
    const observedCanonicalUtf8Bytes = ledgerCanonicalUtf8Bytes([
      ...this.#entries,
      worstCaseEntry,
    ]);
    return {
      commandId,
      stimulusSha256,
      observedEntryCount,
      observedCanonicalUtf8Bytes,
      exhaustedBounds: exceededBoundsFor(
        this.#limits,
        observedEntryCount,
        observedCanonicalUtf8Bytes,
      ),
    };
  }
}

function productionLimits(): WorkflowCommandRecoveryLimits {
  return {
    entryCount: workflowChainProductionLimit(
      WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    ),
    canonicalUtf8Bytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
    ),
  };
}

function requireLimits(
  limits: WorkflowCommandRecoveryLimits,
): WorkflowCommandRecoveryLimits {
  requirePositiveInteger(limits.entryCount, "entry-count limit");
  requirePositiveInteger(limits.canonicalUtf8Bytes, "canonical-byte limit");
  if (limits.canonicalUtf8Bytes < ledgerCanonicalUtf8Bytes([])) {
    throw new RangeError(
      "Command-recovery byte limit cannot fit the empty canonical ledger",
    );
  }
  const production = productionLimits();
  if (
    limits.entryCount > production.entryCount ||
    limits.canonicalUtf8Bytes > production.canonicalUtf8Bytes
  ) {
    throw new RangeError("Configured command-recovery limit exceeds production");
  }
  return { ...limits };
}

function requireInitialEntries(
  entries: ReadonlyArray<WorkflowChainRecoveryEntry>,
): WorkflowChainRecoveryEntry[] {
  const commandIds = new Set<string>();
  return entries.map((value) => {
    const entry = requireWorkflowChainRecoveryEntry(value);
    if (commandIds.has(entry.commandId)) {
      throw new TypeError("Command-recovery ledger contains a duplicate command ID");
    }
    commandIds.add(entry.commandId);
    return { ...entry };
  });
}

function recoveryEntry(
  commandId: string,
  stimulusSha256: string,
  outcome: CommandOutcome,
): WorkflowChainRecoveryEntry {
  return requireWorkflowChainRecoveryEntry({
    commandId,
    stimulusSha256,
    outcome,
  });
}

function ledgerCanonicalUtf8Bytes(
  entries: ReadonlyArray<WorkflowChainRecoveryEntry>,
): number {
  return workflowChainCanonicalUtf8ByteLength(entries);
}

function exceededBoundsFor(
  limits: WorkflowCommandRecoveryLimits,
  observedEntryCount: number,
  observedCanonicalUtf8Bytes: number,
): ReadonlyArray<WorkflowCommandRecoveryCapacityBound> {
  const exhausted: WorkflowCommandRecoveryCapacityBound[] = [];
  if (observedEntryCount > limits.entryCount) {
    exhausted.push({
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
      configuredBound: limits.entryCount,
      observedValue: observedEntryCount,
    });
  }
  if (observedCanonicalUtf8Bytes > limits.canonicalUtf8Bytes) {
    exhausted.push({
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      configuredBound: limits.canonicalUtf8Bytes,
      observedValue: observedCanonicalUtf8Bytes,
    });
  }
  return exhausted;
}

function filledBoundsFor(
  limits: WorkflowCommandRecoveryLimits,
  observedEntryCount: number,
  observedCanonicalUtf8Bytes: number,
): ReadonlyArray<WorkflowCommandRecoveryCapacityBound> {
  const filled: WorkflowCommandRecoveryCapacityBound[] = [];
  if (observedEntryCount === limits.entryCount) {
    filled.push({
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
      configuredBound: limits.entryCount,
      observedValue: observedEntryCount,
    });
  }
  if (observedCanonicalUtf8Bytes === limits.canonicalUtf8Bytes) {
    filled.push({
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      configuredBound: limits.canonicalUtf8Bytes,
      observedValue: observedCanonicalUtf8Bytes,
    });
  }
  return filled;
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Command-recovery ${label} must be a positive integer`);
  }
}

function requireExternallyRetryableStimulus(stimulus: Stimulus): void {
  switch (stimulus.kind) {
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return;
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
      throw new TypeError(
        `Command-recovery ledger accepts only externally retryable stimuli, not ${stimulus.kind}`,
      );
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported command-recovery variant: ${String(value)}`);
}
