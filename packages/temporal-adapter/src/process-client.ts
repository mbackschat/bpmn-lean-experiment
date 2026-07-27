/**
 * Production-facing Process start and User Task command ingress.
 *
 * Resolution after a failed Update lookup follows the lifecycle contract: retained Update result,
 * completed receipt, then unknown Process.
 */
import type {
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  StimulusKind,
  isWellFormedStimulus,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  ProcessCommandResultKind,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
} from "./contracts.js";
import {
  contentBoundUpdateId,
} from "./command-identity.js";
import {
  processWorkflowId,
} from "./process-address.js";
import {
  requireCompletedProcessReceipt,
  semanticCommandResult,
  withDeadline,
} from "./runner-support.js";

const operationDeadlineMs = 5_000;

export async function startBpmnProcess(
  client: WorkflowClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  if (!supportsSemanticProcessExecution(start, semanticProcess)) {
    throw new TypeError(
      "Workflow start requires one admitted Semantic Process execution",
    );
  }
  return withDeadline(
    client.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: processWorkflowId(start.instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess],
      },
    ),
    operationDeadlineMs,
    "Process Workflow start",
  );
}

export async function submitUserTaskCompletion(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  return submitUserTaskCompletionAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

export async function submitUserTaskCompletionAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.taskId.processInstanceId !== processInstanceId
  ) {
    throw new TypeError(
      "Completion command must be well-formed and address the named Process instance",
    );
  }
  const updateId = contentBoundUpdateId(stimulus);
  const handle = client.getHandle<BpmnProcessWorkflow>(workflowId);
  try {
    const outcome = await withDeadline(
      handle.executeUpdate<
        CommandOutcome,
        [CompleteUserTaskInstanceStimulus]
      >(bpmnCompleteUserTaskUpdateName, {
        args: [stimulus],
        updateId,
      }),
      operationDeadlineMs,
      `Workflow Update ${updateId}`,
    );
    return semanticCommandResult(stimulus.commandId, outcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const retainedOutcome = await withDeadline(
      handle.getUpdateHandle<CommandOutcome>(updateId).result(),
      operationDeadlineMs,
      `retained Workflow Update ${updateId}`,
    );
    return semanticCommandResult(stimulus.commandId, retainedOutcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "retained completed Process receipt",
      ),
    );
    if (receipt.processInstanceId !== processInstanceId) {
      throw new TypeError(
        "Temporal Workflow receipt does not match the addressed Process instance",
      );
    }
    return {
      kind: ProcessCommandResultKind.ProcessClosed,
      commandId: stimulus.commandId,
      receipt,
    };
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: stimulus.commandId,
        processInstanceId,
      };
    }
    throw error;
  }
}
