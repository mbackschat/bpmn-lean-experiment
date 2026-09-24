/**
 * Starts one already compiled scenario Workflow under harness identity policy.
 */
import type {
  SemanticProcessProgram,
  ProcessStartStimulus,
} from "@bpmn-lean/semantic-core";
import { COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID } from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";
import {
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  productionBpmnWorkflowInitialHostInput,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
} from "./contracts.js";
import { withDeadline } from "./contracts.js";
import {
  requireScenarioAdmission,
} from "./scenario-admission.js";

export async function startScenarioWorkflow(
  client: WorkflowClient,
  start: ProcessStartStimulus,
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
        args: semanticProcess.identity.semanticProfile === COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID
          ? [start, semanticProcess, productionBpmnWorkflowInitialHostInput()]
          : [start, semanticProcess],
      },
    ),
    operationDeadlineMs,
    "Workflow start",
  );
}
