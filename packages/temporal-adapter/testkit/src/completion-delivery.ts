/**
 * Explicit User Task command-delivery schedules used by the refinement harness.
 *
 * The schedule is verifier-owned input. This module deliberately does not own Workflow creation,
 * Worker lifecycle, or semantic interpretation.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  bpmnOpenUserTasksQueryName,
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  ProcessCommandResult,
  TemporalInteractionEvidence,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import { requireCompletedProcessReceipt } from "./contracts.js";
import {
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";
import {
  assertNever,
  requireSemanticOutcome,
} from "./runner-support.js";
import { withDeadline } from "./contracts.js";
import { readTestProcessTerminalResult } from "./private-process-handle.js";

const operationDeadlineMs = 5_000;
const workflowResultDeadlineMs = 10_000;

export type CompletionDeliveryEvidence = Omit<
  TemporalInteractionEvidence,
  "openUserTasksAtWait" | "openTimersAtWait" | "openEffectsAtWait"
> & Readonly<{
  completedReceipt?: CompletedProcessReceipt;
}>;

export async function deliverCompletions(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  options: TemporalScenarioExecutionOptions,
  assertWorkerHealthy: () => void,
): Promise<CompletionDeliveryEvidence> {
  const duplicateFirstCompletion =
    options.executionSchedule ===
      TemporalExecutionSchedule.DuplicateFirstCompletion;
  switch (options.completionDelivery) {
    case TemporalCompletionDelivery.Ordered:
      return deliverOrderedCompletions(
        client,
        handle,
        processInstanceId,
        completions,
        duplicateFirstCompletion,
        assertWorkerHealthy,
      );
    case TemporalCompletionDelivery.PostTerminal:
      return deliverPostTerminalCompletion(
        client,
        handle,
        processInstanceId,
        completions,
        duplicateFirstCompletion,
        assertWorkerHealthy,
      );
    case TemporalCompletionDelivery.LifecycleRace:
      return deliverLifecycleRace(
        client,
        handle,
        processInstanceId,
        completions,
        assertWorkerHealthy,
      );
    case TemporalCompletionDelivery.Concurrent:
      return deliverConcurrentCompletions(
        client,
        processInstanceId,
        completions,
        options.workflowId,
        assertWorkerHealthy,
      );
    default:
      return assertNever(options.completionDelivery);
  }
}

async function deliverOrderedCompletions(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  duplicateFirstCompletion: boolean,
  assertWorkerHealthy: () => void,
): Promise<CompletionDeliveryEvidence> {
  const completionOutcomes: CommandOutcome[] = [];
  const openUserTasksAfterCompletions:
    Array<ReadonlyArray<OpenUserTask>> = [];
  let duplicateCompletionOutcome: CommandOutcome | null = null;

  for (const [index, stimulus] of completions.entries()) {
    assertWorkerHealthy();
    completionOutcomes.push(
      requireSemanticOutcome(
        await submitUserTaskCompletionAtWorkflowId(
          client,
          handle.workflowId,
          processInstanceId,
          stimulus,
        ),
      ),
    );
    if (
      index === 0 &&
      duplicateFirstCompletion
    ) {
      duplicateCompletionOutcome = requireSemanticOutcome(
        await submitUserTaskCompletionAtWorkflowId(
          client,
          handle.workflowId,
          processInstanceId,
          stimulus,
        ),
      );
    }
    if (index < completions.length - 1) {
      openUserTasksAfterCompletions.push(
        await withDeadline(
          handle.query<ReadonlyArray<OpenUserTask>>(
            bpmnOpenUserTasksQueryName,
          ),
          operationDeadlineMs,
          "Workflow intermediate open User Tasks Query",
        ),
      );
    }
  }

  return {
    openUserTasksAfterCompletions,
    completionOutcomes,
    completionClosureResults: [],
    duplicateCompletionOutcome,
    postTerminalResult: null,
  };
}

async function deliverPostTerminalCompletion(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  duplicateFirstCompletion: boolean,
  assertWorkerHealthy: () => void,
): Promise<CompletionDeliveryEvidence> {
  const postTerminalStimulus = completions.at(-1);
  if (postTerminalStimulus === undefined) {
    throw new TypeError(
      "Post-terminal delivery requires one command after semantic completion",
    );
  }
  const semanticCompletions = completions.slice(0, -1);
  const delivered = await deliverOrderedCompletions(
    client,
    handle,
    processInstanceId,
    semanticCompletions,
    duplicateFirstCompletion,
    assertWorkerHealthy,
  );
  const completedReceipt = requireCompletedProcessReceipt(
    (await withDeadline(
      readTestProcessTerminalResult(handle),
      workflowResultDeadlineMs,
      "Workflow terminal result before post-terminal command",
    )).receipt,
  );
  const postTerminalResult = await submitUserTaskCompletionAtWorkflowId(
    client,
    handle.workflowId,
    processInstanceId,
    postTerminalStimulus,
  );
  if (
    postTerminalResult.kind !==
      ProcessCommandResultKind.ProcessClosed ||
    !isDeepStrictEqual(
      postTerminalResult.receipt,
      completedReceipt,
    )
  ) {
    throw new Error(
      `Post-terminal command ${postTerminalStimulus.commandId} did not resolve against the completed Process receipt`,
    );
  }
  return {
    ...delivered,
    openUserTasksAfterCompletions: [
      ...delivered.openUserTasksAfterCompletions,
      completedReceipt.finalState.openUserTasks,
    ],
    postTerminalResult,
    completedReceipt,
  };
}

async function deliverLifecycleRace(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  assertWorkerHealthy: () => void,
): Promise<CompletionDeliveryEvidence> {
  const results = await Promise.all(
    completions.map((stimulus) => {
      assertWorkerHealthy();
      return submitUserTaskCompletionAtWorkflowId(
        client,
        handle.workflowId,
        processInstanceId,
        stimulus,
      );
    }),
  );
  const classified = classifyConcurrentCompletionResults(results);
  return {
    openUserTasksAfterCompletions: [],
    ...classified,
    duplicateCompletionOutcome: null,
    postTerminalResult: null,
  };
}

export type ConcurrentCompletionEvidence = Readonly<{
  completionOutcomes: CommandOutcome[];
  completionClosureResults: Array<Extract<
    ProcessCommandResult,
    { kind: ProcessCommandResultKind.ProcessClosed }
  >>;
}>;

/**
 * Separates semantic Update results from requests that reached ingress only after Workflow closure.
 * An unknown Process address is an infrastructure failure because the harness retains the exact
 * Workflow address for the whole race.
 */
export function classifyConcurrentCompletionResults(
  results: ReadonlyArray<ProcessCommandResult>,
): ConcurrentCompletionEvidence {
  const completionOutcomes: CommandOutcome[] = [];
  const completionClosureResults: ConcurrentCompletionEvidence[
    "completionClosureResults"
  ] = [];
  for (const result of results) {
    switch (result.kind) {
      case ProcessCommandResultKind.Semantic:
        completionOutcomes.push(result.outcome);
        break;
      case ProcessCommandResultKind.ProcessClosed:
        completionClosureResults.push(result);
        break;
      case ProcessCommandResultKind.ProcessUnknown:
        throw new Error(
          `Concurrent completion resolved to an unknown Process: ${result.processInstanceId}`,
        );
      default:
        assertNever(result);
    }
  }
  return { completionOutcomes, completionClosureResults };
}

async function deliverConcurrentCompletions(
  client: WorkflowClient,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  workflowId: string,
  assertWorkerHealthy: () => void,
): Promise<CompletionDeliveryEvidence> {
  const completionOutcomes = await Promise.all(
    completions.map((stimulus) => {
      assertWorkerHealthy();
      return submitUserTaskCompletionAtWorkflowId(
        client,
        workflowId,
        processInstanceId,
        stimulus,
      ).then(
        requireSemanticOutcome,
      );
    }),
  );
  return {
    openUserTasksAfterCompletions: [],
    completionOutcomes,
    completionClosureResults: [],
    duplicateCompletionOutcome: null,
    postTerminalResult: null,
  };
}
