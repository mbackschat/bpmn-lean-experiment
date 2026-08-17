/** Shared Product 1 entry point for content-bound semantic Workflow Updates. */
import type {
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";

import type {
  WorkflowChainUpdateResolution,
} from "./workflow-chain-recovery-client.js";
import {
  resolveWorkflowChainUpdate,
} from "./workflow-chain-recovery-client.js";

export type SemanticUpdateResolution = WorkflowChainUpdateResolution;

export function resolveSemanticUpdate(
  resolution: SemanticUpdateResolution,
): Promise<ProcessCommandResult> {
  return resolveWorkflowChainUpdate(resolution);
}
