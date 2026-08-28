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

const workflowChainPollDeadlineMs = 20_000;
const workflowChainPollIntervalMs = 25;

export type WorkflowChainPollScheduler = Readonly<{
  now: () => number;
  delay: (durationMs: number) => Promise<void>;
}>;

const workflowChainPollScheduler: WorkflowChainPollScheduler = {
  now: () => performance.now(),
  delay,
};

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
  scheduler: WorkflowChainPollScheduler = workflowChainPollScheduler,
): Promise<void> {
  let latest = 0;
  const matched = await pollWorkflowChainObservation(async () => {
    latest = (await workflowChainRuns(environment, workflowId)).length;
    return latest === expected ? true : undefined;
  }, scheduler);
  if (matched === true) {
    return;
  }
  throw new Error(
    `Workflow chain did not reach ${expected} Runs; latest was ${latest}`,
  );
}

export async function waitForPublishedWorkflowChainState(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  predicate: (state: StateObservation) => boolean,
  scheduler: WorkflowChainPollScheduler = workflowChainPollScheduler,
): Promise<StateObservation> {
  const state = await pollWorkflowChainObservation(async () => {
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
        return undefined;
      }
      if (result.page.current !== null && predicate(result.page.current.state)) {
        return result.page.current.state;
      }
      if (result.page.pageThroughRevision <= afterRevision) {
        break;
      }
      afterRevision = result.page.pageThroughRevision;
    }
    return undefined;
  }, scheduler);
  if (state !== undefined) {
    return state;
  }
  throw new Error("Workflow-chain publication did not reach the expected state");
}

async function pollWorkflowChainObservation<Result>(
  observe: () => Promise<Result | undefined>,
  scheduler: WorkflowChainPollScheduler,
): Promise<Result | undefined> {
  const deadlineMs = scheduler.now() + workflowChainPollDeadlineMs;
  while (scheduler.now() < deadlineMs) {
    const result = await observe();
    if (result !== undefined) {
      return result;
    }
    const remainingMs = deadlineMs - scheduler.now();
    if (remainingMs > 0) {
      await scheduler.delay(
        Math.min(workflowChainPollIntervalMs, remainingMs),
      );
    }
  }
  return undefined;
}
