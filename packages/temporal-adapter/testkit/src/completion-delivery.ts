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
import {
  WorkflowUpdateStage,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  TemporalInteractionEvidence,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import {
  contentBoundUpdateId,
  requireCompletedProcessReceipt,
} from "./contracts.js";
import {
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";
import {
  assertNever,
  requireSemanticOutcome,
} from "./runner-support.js";
import { withDeadline } from "./contracts.js";

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
    case TemporalCompletionDelivery.AcceptedBatch:
      return deliverAcceptedBatch(
        client,
        handle,
        processInstanceId,
        completions,
        duplicateFirstCompletion,
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
    await withDeadline(
      handle.result(),
      workflowResultDeadlineMs,
      "Workflow completed receipt before post-terminal command",
    ),
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

async function deliverAcceptedBatch(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  duplicateFirstCompletion: boolean,
): Promise<CompletionDeliveryEvidence> {
  // Every request is in flight before an acceptance response is awaited. Temporal may receive these concurrent requests in a different order, so this is an acceptance-race discriminator rather than an ordering guarantee.
  const updateHandlePromises = completions.map((stimulus) =>
    handle.startUpdate<
      CommandOutcome,
      [CompleteUserTaskInstanceStimulus]
    >(bpmnCompleteUserTaskUpdateName, {
      args: [stimulus],
      updateId: contentBoundUpdateId(stimulus),
      waitForStage: WorkflowUpdateStage.ACCEPTED,
    })
  );
  const updateHandles = await Promise.all(updateHandlePromises);
  const completionOutcomes = await Promise.all(
    updateHandles.map((updateHandle) =>
      withDeadline(
        updateHandle.result(),
        operationDeadlineMs,
        `Workflow accepted Update ${updateHandle.updateId}`,
      )
    ),
  );
  let duplicateCompletionOutcome: CommandOutcome | null = null;
  const first = completions[0];
  if (duplicateFirstCompletion && first !== undefined) {
    duplicateCompletionOutcome = requireSemanticOutcome(
      await submitUserTaskCompletionAtWorkflowId(
        client,
        handle.workflowId,
        processInstanceId,
        first,
      ),
    );
  }
  return {
    openUserTasksAfterCompletions: [],
    completionOutcomes,
    duplicateCompletionOutcome,
    postTerminalResult: null,
  };
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
    duplicateCompletionOutcome: null,
    postTerminalResult: null,
  };
}
