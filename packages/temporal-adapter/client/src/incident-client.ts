/** Product 1 client for a content-bound semantic incident retry Update. */
import {
  StimulusKind,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";
import type { WorkflowClient } from "@temporalio/client";

import {
  bpmnRetryEffectIncidentUpdateName,
  contentBoundUpdateId,
  processWorkflowId,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";
import { resolveSemanticUpdate } from "./semantic-update-client.js";

const operationDeadlineMs = 5_000;

export async function submitIncidentRetry(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: RetryIncidentStimulus,
): Promise<ProcessCommandResult> {
  return submitIncidentRetryAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

/** Sends a retry to a separately addressed host while preserving semantic Process identity. */
export async function submitIncidentRetryAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: RetryIncidentStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.RetryIncident ||
    stimulus.incidentId.effectId.processInstanceId !== processInstanceId
  ) {
    throw new TypeError(
      "Incident retry must be well-formed and address the named Process instance",
    );
  }
  const updateId = contentBoundUpdateId(stimulus);
  const handle = client.getHandle<BpmnProcessWorkflow>(
    workflowId,
  );
  return resolveSemanticUpdate({
    commandId: stimulus.commandId,
    processInstanceId,
    updateId,
    execute: () => withDeadline(
      handle.executeUpdate<CommandOutcome, [RetryIncidentStimulus]>(
        bpmnRetryEffectIncidentUpdateName,
        { args: [stimulus], updateId },
      ),
      operationDeadlineMs,
      `incident retry Update ${updateId}`,
    ),
    retained: () => withDeadline(
      handle.getUpdateHandle<CommandOutcome>(updateId).result(),
      operationDeadlineMs,
      `retained incident retry Update ${updateId}`,
    ),
    completedReceipt: () => withDeadline(
      handle.result(),
      operationDeadlineMs,
      "retained completed Process receipt",
    ),
  });
}
