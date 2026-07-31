/**
 * Delivers answer-free Message stimuli through the production Signal client.
 *
 * The generic runner owns scenario ordering; this collaborator owns the
 * bounded transport deadline and diagnostic label for Message ingress.
 */
import type {
  Scenario,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
} from "@temporalio/client";
import {
  submitMessageDeliveryAtWorkflowId,
} from "./process-client.js";
import {
  requireMessageDeliveryStimuli,
} from "./runner-support.js";
import { withDeadline } from "./async-boundary.js";

export async function deliverScenarioMessages(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  scenario: Scenario,
  operationDeadlineMs: number,
): Promise<void> {
  for (const delivery of requireMessageDeliveryStimuli(scenario)) {
    await withDeadline(
      submitMessageDeliveryAtWorkflowId(
        client,
        workflowId,
        processInstanceId,
        delivery,
      ),
      operationDeadlineMs,
      `Workflow Message delivery ${delivery.commandId}`,
    );
  }
}
