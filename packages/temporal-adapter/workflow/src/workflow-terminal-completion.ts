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
  canonicalWorkflowChainJson,
  requireWorkflowTerminalResultV1,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";

import { terminalProcessReceipt } from "./terminal-process-receipt.js";
import type { WorkflowCommandRecoveryLedger } from "./workflow-command-recovery.js";

type LegacyTerminalProcessReceipt = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Completed | ProcessStatus.Cancelled;
  };
  messageDeliveryRecords: MessageDeliveryRecord[];
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
