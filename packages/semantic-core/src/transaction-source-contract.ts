import type { DeepReadonly } from "./deep-readonly.js";
import type { CheckedCompensationSubject } from "./compensation-source-contract.js";

/** Child-owned source declaration for the bounded Transaction cancellation account. */
export type CheckedTransactionCancellation = DeepReadonly<{
  definitionScopeId: string;
  triggerElementId: string;
  subject: Extract<CheckedCompensationSubject, { kind: "boundaryActivity" }>;
  retentionLimits: { maxRecords: 1; maxCanonicalBytes: 4096 };
  executionLimits: { maxTriggers: 1; maxHandlers: 1; maxCanonicalBytes: 20480 };
}>;
