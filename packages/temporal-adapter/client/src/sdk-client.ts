import { WorkflowClient } from "@temporalio/client";

export type TemporalWorkflowClient = WorkflowClient;

export function createTemporalWorkflowClient(
  options: ConstructorParameters<typeof WorkflowClient>[0],
): TemporalWorkflowClient {
  return new WorkflowClient(options);
}
