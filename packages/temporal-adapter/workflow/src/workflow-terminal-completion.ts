/** Retained legacy result construction and closed v1 Workflow terminal envelopes. */
import type {
  CanonicalObservation,
  DeepReadonly,
  RuntimeState,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  MessageDeliveryRecord,
  WorkflowTerminalResultV1,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowTerminalResultV1,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";

import { terminalProcessReceipt } from "./terminal-process-receipt.js";
import type { WorkflowCommandRecoveryLedger } from "./workflow-command-recovery.js";
import type {
  WorkflowChainCapacityState,
  WorkflowChainObservedCapacityBound,
} from "./workflow-chain-capacity.js";

type LegacyTerminalProcessReceipt = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Completed | ProcessStatus.Cancelled;
  };
  messageDeliveryRecords: MessageDeliveryRecord[];
}>;

export type WorkflowTerminalResultCapacityLimits = Readonly<{
  terminalResultEnvelopeBytes: number;
}>;

export enum WorkflowTerminalResultCapacityPreflightKind {
  Ready = "ready",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowTerminalResultCapacityPreflight =
  | Readonly<{
      kind: WorkflowTerminalResultCapacityPreflightKind.Ready;
      result: WorkflowTerminalResultV1;
    }>
  | Readonly<{
      kind: WorkflowTerminalResultCapacityPreflightKind.CapacityExceeded;
      failure: WorkflowChainObservedCapacityBound;
    }>;

export function terminalWorkflowResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>,
  recovery: WorkflowCommandRecoveryLedger,
): WorkflowTerminalResultV1;
export function terminalWorkflowResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>,
  recovery: null,
): LegacyTerminalProcessReceipt;
export function terminalWorkflowResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>,
  recovery: WorkflowCommandRecoveryLedger | null,
): WorkflowTerminalResultV1 | LegacyTerminalProcessReceipt;
export function terminalWorkflowResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>,
  recovery: WorkflowCommandRecoveryLedger | null,
): WorkflowTerminalResultV1 | LegacyTerminalProcessReceipt {
  const receipt = terminalProcessReceipt(
    semanticProcess,
    processInstanceId,
    state,
    trace,
  );
  if (recovery === null) {
    if (receipt.finalState.status === ProcessStatus.Failed) {
      throw new TypeError(
        "Retained legacy terminal result cannot encode a failed Process",
      );
    }
    // This exact property set and order is replay data for retained two-argument histories. It is
    // intentionally private rather than a second public receipt contract.
    return {
      definition: receipt.definition,
      processId: receipt.processId,
      processInstanceId: receipt.processInstanceId,
      finalState: receipt.finalState,
      messageDeliveryRecords: [...messageDeliveryRecords],
    };
  }
  return requireWorkflowTerminalResultForExecution(
    {
      format: workflowTerminalResultFormatV1,
      receipt,
      entries: recovery.snapshot(),
    },
    semanticProcess,
    processInstanceId,
    recovery,
  );
}

/** Converts an oversized private terminal envelope into the chain's typed host failure. */
export function completeWorkflowChainTerminalResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  recovery: WorkflowCommandRecoveryLedger,
  capacity: WorkflowChainCapacityState,
  publicRevision: number,
  limits?: WorkflowTerminalResultCapacityLimits,
): WorkflowTerminalResultV1 {
  const preflight = preflightWorkflowTerminalResult(
    semanticProcess,
    processInstanceId,
    state,
    trace,
    recovery,
    limits,
  );
  switch (preflight.kind) {
    case WorkflowTerminalResultCapacityPreflightKind.Ready:
      return preflight.result;
    case WorkflowTerminalResultCapacityPreflightKind.CapacityExceeded:
      throw capacity.applicationFailureForObservedCapacity(
        preflight.failure,
        publicRevision,
      );
    default:
      return assertNever(preflight);
  }
}

export function preflightWorkflowTerminalResult(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
  recovery: WorkflowCommandRecoveryLedger,
  limits: WorkflowTerminalResultCapacityLimits = productionCapacityLimits(),
): WorkflowTerminalResultCapacityPreflight {
  const configured = requireCapacityLimits(limits);
  const candidate = {
    format: workflowTerminalResultFormatV1,
    receipt: terminalProcessReceipt(
      semanticProcess,
      processInstanceId,
      state,
      trace,
    ),
    entries: recovery.snapshot(),
  } as const;
  const observedValue = workflowChainCanonicalUtf8ByteLength(candidate);
  if (observedValue > configured.terminalResultEnvelopeBytes) {
    return {
      kind: WorkflowTerminalResultCapacityPreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
        configuredBound: configured.terminalResultEnvelopeBytes,
        observedValue,
      },
    };
  }
  return {
    kind: WorkflowTerminalResultCapacityPreflightKind.Ready,
    result: requireWorkflowTerminalResultForExecution(
      candidate,
      semanticProcess,
      processInstanceId,
      recovery,
    ),
  };
}

/** Validates the private envelope against the exact execution and lifetime ledger before return. */
export function requireWorkflowTerminalResultForExecution(
  value: unknown,
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  recovery: WorkflowCommandRecoveryLedger,
): WorkflowTerminalResultV1 {
  const result = requireWorkflowTerminalResultV1(value);
  if (
    result.receipt.processId !== semanticProcess.processId ||
    result.receipt.processInstanceId !== processInstanceId ||
    canonicalWorkflowChainJson(result.receipt.definition) !==
      canonicalWorkflowChainJson(semanticProcess.identity)
  ) {
    throw new TypeError("Workflow terminal result has an execution identity mismatch");
  }
  if (
    canonicalWorkflowChainJson(result.entries) !==
      canonicalWorkflowChainJson(recovery.snapshot())
  ) {
    throw new TypeError("Workflow terminal result differs from its recovery ledger snapshot");
  }
  return result;
}

function productionCapacityLimits(): WorkflowTerminalResultCapacityLimits {
  return {
    terminalResultEnvelopeBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
    ),
  };
}

function requireCapacityLimits(
  value: WorkflowTerminalResultCapacityLimits,
): WorkflowTerminalResultCapacityLimits {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, "terminalResultEnvelopeBytes")) {
    throw new TypeError("Workflow terminal-envelope capacity limits are not closed");
  }
  if (!Number.isSafeInteger(value.terminalResultEnvelopeBytes) ||
    value.terminalResultEnvelopeBytes < 1) {
    throw new RangeError(
      "terminalResultEnvelopeBytes limit must be a positive safe integer",
    );
  }
  if (value.terminalResultEnvelopeBytes > workflowChainProductionLimit(
    WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
  )) {
    throw new RangeError("terminalResultEnvelopeBytes limit exceeds production");
  }
  return { terminalResultEnvelopeBytes: value.terminalResultEnvelopeBytes };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow terminal-capacity variant: ${String(value)}`);
}
