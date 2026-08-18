/** Chain-aware public-state and private-Run helpers for focused rollover witnesses. */
import { setTimeout as delay } from "node:timers/promises";

import type {
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  ExecutionPublicationResultKind,
  observeTemporalExecutionPublication,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalExecutionPublicationClient,
} from "@bpmn-lean/temporal-testkit";

import { withDeadline } from "./temporal-test-support.ts";

export type WorkflowChainRun = Readonly<{
  runId: string;
  startedAt: number;
}>;

export async function workflowChainRuns(
  environment: TestWorkflowEnvironment,
  workflowId: string,
): Promise<ReadonlyArray<WorkflowChainRun>> {
  return withDeadline((async () => {
    const runs: WorkflowChainRun[] = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        runs.push({
          runId: execution.runId,
          startedAt: execution.startTime.getTime(),
        });
      }
    }
    return runs.sort((left, right) => left.startedAt - right.startedAt);
  })(), 1_000, "Workflow-chain listing");
}

export async function waitForWorkflowChainRunCount(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await workflowChainRuns(environment, workflowId)).length === expected) {
      return;
    }
    await delay(25);
  }
  throw new Error(`Workflow chain did not reach ${expected} Runs`);
}

export async function waitForPublishedWorkflowChainState(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  predicate: (state: StateObservation) => boolean,
): Promise<StateObservation> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let afterRevision = 0;
    for (let pageIndex = 0; pageIndex < 16; pageIndex += 1) {
      const result = await observeTemporalExecutionPublication(
        environment.client.workflow as unknown as TemporalExecutionPublicationClient,
        workflowId,
        {
          definition: semanticProcess.identity,
          processId: semanticProcess.processId,
          processInstanceId,
        },
        { afterRevision },
      );
      if (result.kind !== ExecutionPublicationResultKind.Available) {
        break;
      }
      if (result.page.current !== null && predicate(result.page.current.state)) {
        return result.page.current.state;
      }
      if (result.page.pageThroughRevision <= afterRevision) {
        break;
      }
      afterRevision = result.page.pageThroughRevision;
    }
    await delay(25);
  }
  throw new Error("Workflow-chain publication did not reach the expected state");
}
