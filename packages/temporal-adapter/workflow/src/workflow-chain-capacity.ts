import type {
  CommandOutcome,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  condition,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  requireWorkflowChainCapacityFailureDetails,
} from "@bpmn-lean/temporal-protocol";
import type {
  TerminalProcessReceipt,
  WorkflowChainCapacityFailureDetails,
  WorkflowChainCommandRecoveryRequest,
  WorkflowChainCommandRecoveryResponse,
} from "@bpmn-lean/temporal-protocol";

import {
  WorkflowCommandRecoveryLookupKind,
} from "./workflow-command-recovery.js";
import type {
  WorkflowCommandRecoveryCapacityBound,
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryRecordResult,
} from "./workflow-command-recovery.js";

export const bpmnWorkflowChainCommandRecoveryQuery = defineQuery<
  WorkflowChainCommandRecoveryResponse,
  [request: WorkflowChainCommandRecoveryRequest]
>(bpmnWorkflowChainCommandRecoveryQueryName);

export function registerWorkflowChainRecoveryQuery(
  processInstanceId: string,
  recovery: WorkflowCommandRecoveryLedger,
  capacity: WorkflowChainCapacityState,
  terminalReceipt: () => TerminalProcessReceipt | null,
): void {
  setHandler(bpmnWorkflowChainCommandRecoveryQuery, (request) => {
    return capacity.projectRecoveryResponse(
      recovery,
      processInstanceId,
      request,
      terminalReceipt(),
    );
  });
}

export type WorkflowChainCapacityContext = Readonly<{
  processInstanceId: string;
  publicRevision: number;
  runOrdinal: number;
}>;

export type WorkflowChainObservedCapacityBound = Readonly<{
  budget: WorkflowChainBudgetKind;
  configuredBound: number;
  observedValue: number;
}>;

type WorkflowChainCapacityIdentity = Readonly<{
  processInstanceId: string;
  runOrdinal: number;
}>;

export enum WorkflowChainRecoveryIngressKind {
  Resolved = "resolved",
  IdentityConflict = "identityConflict",
  Unseen = "unseen",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowChainRecoveryIngress =
  | Readonly<{
      kind: WorkflowChainRecoveryIngressKind.Resolved;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: WorkflowChainRecoveryIngressKind.IdentityConflict;
    }>
  | Readonly<{
      kind: WorkflowChainRecoveryIngressKind.Unseen;
    }>
  | Readonly<{
      kind: WorkflowChainRecoveryIngressKind.CapacityExceeded;
      failure: WorkflowChainCapacityFailureDetails;
    }>;

export enum WorkflowChainStableCheckpointKind {
  Continue = "continue",
  Terminal = "terminal",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowChainStableCheckpointDecision =
  | Readonly<{
      kind: WorkflowChainStableCheckpointKind.Continue;
    }>
  | Readonly<{
      kind: WorkflowChainStableCheckpointKind.Terminal;
    }>
  | Readonly<{
      kind: WorkflowChainStableCheckpointKind.CapacityExceeded;
      failure: WorkflowChainCapacityFailureDetails;
    }>;

type WorkflowChainRecoveryCapacity = Readonly<{
  recovery: WorkflowCommandRecoveryLedger;
  capacity: WorkflowChainCapacityState;
}>;

/** Signals retain ordinary conflict resolution for their Query and never throw from the handler. */
export function acceptWorkflowChainSignalCapacity(
  workflowChain: WorkflowChainRecoveryCapacity | null,
  stimulus: Stimulus,
): boolean {
  if (workflowChain === null) {
    return true;
  }
  const ingress = workflowChain.capacity.classifyRecoveryIngress(
    workflowChain.recovery,
    stimulus,
  );
  switch (ingress.kind) {
    case WorkflowChainRecoveryIngressKind.Resolved:
    case WorkflowChainRecoveryIngressKind.IdentityConflict:
    case WorkflowChainRecoveryIngressKind.Unseen:
      return true;
    case WorkflowChainRecoveryIngressKind.CapacityExceeded:
      return false;
    default:
      return assertNever(ingress);
  }
}

export async function awaitWorkflowCommandOutcome(
  commandId: string,
  outcome: () => CommandOutcome | undefined,
  capacity: WorkflowChainCapacityState | null,
): Promise<CommandOutcome> {
  await condition(
    () => outcome() !== undefined || capacity?.hasPendingFailure() === true,
  );
  const resolved = outcome();
  if (resolved !== undefined) {
    return resolved;
  }
  if (capacity?.hasPendingFailure() === true) {
    throw capacity.applicationFailure();
  }
  throw ApplicationFailure.nonRetryable(
    `Semantic loop ended without an outcome for ${commandId}`,
    "BpmnCommandOutcomeMissing",
  );
}

/** Owns the single stable-checkpoint failure selected after a recovery bound is filled. */
export class WorkflowChainCapacityState {
  readonly #identity: WorkflowChainCapacityIdentity;
  #pendingFailure: WorkflowChainCapacityFailureDetails | null = null;

  constructor(identity: WorkflowChainCapacityIdentity) {
    this.#identity = { ...identity };
  }

  observeRecoveryRecord(
    record: WorkflowCommandRecoveryRecordResult,
    publicRevision: number,
  ): WorkflowChainCapacityFailureDetails | null {
    if (this.#pendingFailure !== null) {
      return copyFailure(this.#pendingFailure);
    }
    const filled = preferredFilledBound(record);
    if (filled === null) {
      return null;
    }
    this.#pendingFailure = capacityFailure(
      filled,
      this.#context(publicRevision),
    );
    return copyFailure(this.#pendingFailure);
  }

  /** Retains the first pre-commit capacity failure so every waiting handler sees one stable fact. */
  retainObservedCapacity(
    bound: WorkflowChainObservedCapacityBound,
    publicRevision: number,
  ): WorkflowChainCapacityFailureDetails {
    if (this.#pendingFailure === null) {
      this.#pendingFailure = capacityFailure(
        bound,
        this.#context(publicRevision),
      );
    }
    return copyFailure(this.#pendingFailure);
  }

  retainUnseenCapacity(
    ledger: WorkflowCommandRecoveryLedger,
    stimulus: Stimulus,
    publicRevision: number,
  ): WorkflowChainCapacityFailureDetails {
    const ingress = this.classifyUpdateIngress(ledger, stimulus, publicRevision);
    if (ingress.kind !== WorkflowChainRecoveryIngressKind.CapacityExceeded) {
      throw new TypeError("Unseen recovery candidate has remaining capacity");
    }
    if (this.#pendingFailure === null) {
      this.#pendingFailure = ingress.failure;
    }
    return copyFailure(this.#pendingFailure);
  }

  pendingFailure(): WorkflowChainCapacityFailureDetails | null {
    return this.#pendingFailure === null
      ? null
      : copyFailure(this.#pendingFailure);
  }

  hasPendingFailure(): boolean {
    return this.#pendingFailure !== null;
  }

  classifyRecoveryIngress(
    ledger: WorkflowCommandRecoveryLedger,
    stimulus: Stimulus,
  ): WorkflowChainRecoveryIngress {
    const lookup = ledger.lookup(stimulus);
    switch (lookup.kind) {
      case WorkflowCommandRecoveryLookupKind.Resolved:
        return {
          kind: WorkflowChainRecoveryIngressKind.Resolved,
          outcome: lookup.outcome,
        };
      case WorkflowCommandRecoveryLookupKind.IdentityConflict:
        return { kind: WorkflowChainRecoveryIngressKind.IdentityConflict };
      case WorkflowCommandRecoveryLookupKind.Unseen:
        return this.#pendingFailure === null
          ? { kind: WorkflowChainRecoveryIngressKind.Unseen }
          : {
              kind: WorkflowChainRecoveryIngressKind.CapacityExceeded,
              failure: copyFailure(this.#pendingFailure),
            };
      default:
        return assertNever(lookup);
    }
  }

  classifyUpdateIngress(
    ledger: WorkflowCommandRecoveryLedger,
    stimulus: Stimulus,
    publicRevision: number,
  ): WorkflowChainRecoveryIngress {
    const current = this.classifyRecoveryIngress(ledger, stimulus);
    if (current.kind !== WorkflowChainRecoveryIngressKind.Unseen) {
      return current;
    }
    const exceeded = preferredCapacityBound(
      ledger.inspectUnseenCapacity(stimulus).exhaustedBounds,
    );
    return exceeded === null
      ? current
      : {
          kind: WorkflowChainRecoveryIngressKind.CapacityExceeded,
          failure: capacityFailure(exceeded, this.#context(publicRevision)),
        };
  }

  projectRecoveryResponse(
    ledger: WorkflowCommandRecoveryLedger,
    processInstanceId: string,
    request: WorkflowChainCommandRecoveryRequest,
    terminalReceipt: TerminalProcessReceipt | null,
  ): WorkflowChainCommandRecoveryResponse {
    const fallback = terminalReceipt !== null
      ? {
          kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
          receipt: terminalReceipt,
        } as const
      : this.#pendingFailure !== null
      ? {
          kind:
            WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
          failure: copyFailure(this.#pendingFailure),
        } as const
      : {
          kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive,
        } as const;
    return ledger.projectResponse(processInstanceId, request, fallback);
  }

  decideStableCheckpoint(
    isTerminal: boolean,
  ): WorkflowChainStableCheckpointDecision {
    if (isTerminal) {
      return { kind: WorkflowChainStableCheckpointKind.Terminal };
    }
    return this.#pendingFailure === null
      ? { kind: WorkflowChainStableCheckpointKind.Continue }
      : {
          kind: WorkflowChainStableCheckpointKind.CapacityExceeded,
          failure: copyFailure(this.#pendingFailure),
        };
  }

  applicationFailure(
    failure: WorkflowChainCapacityFailureDetails | null = this.#pendingFailure,
  ): ApplicationFailure {
    if (failure === null) {
      throw new TypeError("Workflow-chain capacity has no pending failure");
    }
    return workflowChainCapacityApplicationFailure(failure);
  }

  applicationFailureForObservedCapacity(
    bound: WorkflowChainObservedCapacityBound,
    publicRevision: number,
  ): ApplicationFailure {
    return workflowChainCapacityApplicationFailure(
      capacityFailure(bound, this.#context(publicRevision)),
    );
  }

  #context(publicRevision: number): WorkflowChainCapacityContext {
    return { ...this.#identity, publicRevision };
  }
}

export function workflowChainCapacityApplicationFailure(
  details: WorkflowChainCapacityFailureDetails,
): ApplicationFailure {
  const validated = requireWorkflowChainCapacityFailureDetails(details);
  return ApplicationFailure.nonRetryable(
    "Workflow-chain capacity is exhausted",
    bpmnWorkflowChainCapacityExhaustedFailureType,
    validated,
  );
}

function preferredFilledBound(
  record: WorkflowCommandRecoveryRecordResult,
): WorkflowCommandRecoveryRecordResult["filledBounds"][number] | null {
  return preferredCapacityBound(record.filledBounds);
}

function preferredCapacityBound(
  bounds: ReadonlyArray<WorkflowCommandRecoveryCapacityBound>,
): WorkflowCommandRecoveryCapacityBound | null {
  for (const budget of [
    WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
  ] as const) {
    const filled = bounds.find(
      (candidate) => candidate.budget === budget,
    );
    if (filled !== undefined) {
      switch (filled.budget) {
        case WorkflowChainBudgetKind.CommandRecoveryLedgerEntries:
        case WorkflowChainBudgetKind.CommandRecoveryLedgerBytes:
          return filled;
        default:
          return assertNever(filled.budget);
      }
    }
  }
  return null;
}

function capacityFailure(
  bound: WorkflowChainObservedCapacityBound,
  context: WorkflowChainCapacityContext,
): WorkflowChainCapacityFailureDetails {
  return requireWorkflowChainCapacityFailureDetails({
    ...bound,
    ...context,
  });
}

function copyFailure(
  value: WorkflowChainCapacityFailureDetails,
): WorkflowChainCapacityFailureDetails {
  return { ...value };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow-chain capacity variant: ${String(value)}`);
}
