import { Client, WorkflowClient } from "@temporalio/client";

export function createTemporalClient(
  options: ConstructorParameters<typeof Client>[0],
): Client {
  return new Client(options);
}

export type TemporalWorkflowClient = WorkflowClient;

export function createTemporalWorkflowClient(
  options: ConstructorParameters<typeof WorkflowClient>[0],
): TemporalWorkflowClient {
  return new WorkflowClient(options);
}
