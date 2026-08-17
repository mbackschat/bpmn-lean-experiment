/** Test-only SDK capability for inspecting one started semantic Process. */
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  decodeWorkflowTerminalResult,
  processWorkflowId,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  DecodedWorkflowTerminalResult,
} from "@bpmn-lean/temporal-protocol";

export function getTestProcessHandle(
  client: WorkflowClient,
  processInstanceId: string,
): WorkflowHandle<BpmnProcessWorkflow> {
  return client.getHandle<BpmnProcessWorkflow>(
    processWorkflowId(processInstanceId),
  );
}

/** Decodes the private Workflow result without widening any Product receipt. */
export async function readTestProcessTerminalResult(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<DecodedWorkflowTerminalResult> {
  return decodeWorkflowTerminalResult(await handle.result());
}
