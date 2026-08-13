/** Shared retained-result lifecycle for content-bound semantic Workflow Updates. */
import type { CommandOutcome } from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  ProcessCommandResultKind,
  requireTerminalProcessReceipt,
  semanticCommandResult,
} from "@bpmn-lean/temporal-protocol";
import type { ProcessCommandResult } from "@bpmn-lean/temporal-protocol";

export type SemanticUpdateResolution = Readonly<{
  commandId: string;
  processInstanceId: string;
  updateId: string;
  execute(): Promise<CommandOutcome>;
  retained(): Promise<CommandOutcome>;
  completedReceipt(): Promise<unknown>;
}>;

export async function resolveSemanticUpdate(
  resolution: SemanticUpdateResolution,
): Promise<ProcessCommandResult> {
  try {
    return semanticCommandResult(
      resolution.commandId,
      await resolution.execute(),
    );
  } catch (error: unknown) {
    requireMissingWorkflow(error);
  }

  try {
    return semanticCommandResult(
      resolution.commandId,
      await resolution.retained(),
    );
  } catch (error: unknown) {
    requireMissingWorkflow(error);
  }

  try {
    const receipt = requireTerminalProcessReceipt(
      await resolution.completedReceipt(),
    );
    if (receipt.processInstanceId !== resolution.processInstanceId) {
      throw new TypeError(
        "Temporal Workflow receipt does not match the addressed Process instance",
      );
    }
    return {
      kind: ProcessCommandResultKind.ProcessClosed,
      commandId: resolution.commandId,
      receipt,
    };
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
    return {
      kind: ProcessCommandResultKind.ProcessUnknown,
      commandId: resolution.commandId,
      processInstanceId: resolution.processInstanceId,
    };
  }
}

function requireMissingWorkflow(error: unknown): void {
  if (!(error instanceof WorkflowNotFoundError)) {
    throw error;
  }
}
