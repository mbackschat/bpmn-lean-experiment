/**
 * Starts one already compiled scenario Workflow under harness identity policy.
 */
import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";
import {
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
} from "./contracts.js";
import {
  withDeadline,
} from "./runner-support.js";
import {
  requireScenarioAdmission,
} from "./scenario-admission.js";

export async function startScenarioWorkflow(
  client: WorkflowClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  operationDeadlineMs: number,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  requireScenarioAdmission(start, semanticProcess);
  return withDeadline(
    client.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess],
      },
    ),
    operationDeadlineMs,
    "Workflow start",
  );
}
