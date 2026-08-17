/** Product 1 client for a content-bound semantic incident retry Update. */
import {
  StimulusKind,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";
import type { WorkflowClient } from "@temporalio/client";

import {
  bpmnRetryEffectIncidentUpdateName,
  bpmnCancelIncidentProcessUpdateName,
  processWorkflowId,
} from "@bpmn-lean/temporal-protocol";
import type {
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";
import { resolveSemanticUpdate } from "./semantic-update-client.js";

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

export async function submitIncidentProcessCancellation(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: CancelIncidentProcessStimulus,
): Promise<ProcessCommandResult> {
  return submitIncidentProcessCancellationAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

/** Sends cancellation to a separately addressed host while binding both public Process identities. */
export async function submitIncidentProcessCancellationAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: CancelIncidentProcessStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CancelIncidentProcess ||
    stimulus.processInstanceId !== processInstanceId ||
    stimulus.incidentId.effectId.processInstanceId !== processInstanceId
  ) {
    throw new TypeError(
      "Incident cancellation must be well-formed and bind every Process identity to the named instance",
    );
  }
  return resolveSemanticUpdate({
    client,
    workflowId,
    processInstanceId,
    stimulus,
    updateName: bpmnCancelIncidentProcessUpdateName,
    operation: "incident cancellation",
  });
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
  return resolveSemanticUpdate({
    client,
    workflowId,
    processInstanceId,
    stimulus,
    updateName: bpmnRetryEffectIncidentUpdateName,
    operation: "incident retry",
  });
}
