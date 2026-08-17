/** Test-only SDK capability for inspecting one started semantic Process. */
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  processWorkflowId,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
} from "@bpmn-lean/temporal-protocol";

export function getTestProcessHandle(
  client: WorkflowClient,
  processInstanceId: string,
): WorkflowHandle<BpmnProcessWorkflow> {
  return client.getHandle<BpmnProcessWorkflow>(
    processWorkflowId(processInstanceId),
  );
}
