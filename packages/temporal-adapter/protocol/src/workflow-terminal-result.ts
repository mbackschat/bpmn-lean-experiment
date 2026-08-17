import type {
  DeepReadonly,
} from "@bpmn-lean/semantic-core";

import type {
  MessageDeliveryRecord,
  TerminalProcessReceipt,
} from "./contracts.js";
import {
  normalizeLegacyTerminalProcessReceipt,
  requireTerminalProcessReceipt,
} from "./lifecycle-results.js";
import type {
  WorkflowChainRecoveryEntry,
} from "./workflow-chain.js";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowChainCanonicalByteBudget,
  requireWorkflowChainRecoveryEntry,
  workflowChainProductionLimit,
} from "./workflow-chain.js";

export const workflowTerminalResultFormatV1 =
  "bpmn-lean.workflow-terminal-result.v1" as const;

/** Private Temporal result. Product callers receive only `receipt`. */
export type WorkflowTerminalResultV1 = DeepReadonly<{
  format: typeof workflowTerminalResultFormatV1;
  receipt: TerminalProcessReceipt;
  entries: WorkflowChainRecoveryEntry[];
}>;

/** Adapter-private normalized view shared by new and retained legacy Workflows. */
export type DecodedWorkflowTerminalResult = DeepReadonly<{
  receipt: TerminalProcessReceipt;
  recoveryEntries: WorkflowChainRecoveryEntry[];
  legacyMessageDeliveryRecords: MessageDeliveryRecord[];
}>;

export function requireWorkflowTerminalResultV1(
  value: unknown,
): WorkflowTerminalResultV1 {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
    value,
  );
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "format",
    "receipt",
    "entries",
  ]) || value.format !== workflowTerminalResultFormatV1 ||
    !Array.isArray(value.entries)) {
    throw new TypeError("Malformed Workflow terminal-result envelope");
  }
  requireTerminalProcessReceipt(value.receipt);
  if (value.entries.length > workflowChainProductionLimit(
    WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
  )) {
    throw new RangeError("Workflow terminal recovery-entry count exceeds production bound");
  }
  const commandIds = new Set<string>();
  for (const candidate of value.entries) {
    const entry = requireWorkflowChainRecoveryEntry(candidate);
    if (commandIds.has(entry.commandId)) {
      throw new TypeError("Workflow terminal result has a duplicate command ID");
    }
    commandIds.add(entry.commandId);
  }
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
    value.entries,
  );
  return value as WorkflowTerminalResultV1;
}

/** Normalizes retained old receipts without exposing a public old/new union. */
export function decodeWorkflowTerminalResult(
  value: unknown,
): DecodedWorkflowTerminalResult {
  canonicalWorkflowChainJson(value);
  if (isRecord(value) && value.format === workflowTerminalResultFormatV1) {
    const result = requireWorkflowTerminalResultV1(value);
    return {
      receipt: result.receipt,
      recoveryEntries: result.entries,
      legacyMessageDeliveryRecords: [],
    };
  }
  const legacy = normalizeLegacyTerminalProcessReceipt(value);
  if (legacy === null) {
    throw new TypeError("Malformed legacy Workflow terminal result");
  }
  return {
    receipt: legacy.receipt,
    recoveryEntries: [],
    legacyMessageDeliveryRecords: legacy.messageDeliveryRecords,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlyArray<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length &&
    keys.every((key) => allowedKeys.includes(key));
}
