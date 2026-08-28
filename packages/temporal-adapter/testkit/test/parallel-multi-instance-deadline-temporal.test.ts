/** Locks the parallel Multi-Instance host to one outer-lifetime Timer and typed coalescence refusal. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  FlowNodeOccurrenceTerminalKind,
  SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  bpmnParallelMultiInstanceSchedulerUnavailableFailureType,
} from "@bpmn-lean/temporal-testkit";
import type {
  ExecutionPublicationResult,
  FlowNodeOccurrenceId,
  FlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-testkit";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  requireDeadlineNotWithdrawn,
  requireDeadlineWithdrawn,
  requireNoHostFailure,
  requireNoWinnerSelected,
  requireRefusedUpdateAnswered,
  requireRouteCompleted,
} from "./boundary-deadline-assertions.ts";
import {
  commands,
  completedWorkflowResult,
} from "./direct-vm-activation-harness.ts";
import type { Completion } from "./direct-vm-activation-harness.ts";
import {
  runParallelMultiInstanceFirstFifoWitness,
  runParallelMultiInstanceDeadlineWitness,
} from "./parallel-multi-instance-deadline-witness.ts";
import type {
  ParallelMultiInstanceFirstFifoRun,
} from "./parallel-multi-instance-deadline-witness.ts";

const deadlineWitness = runParallelMultiInstanceDeadlineWitness();

test("out-of-index completion preserves one Timer and all completion withdraws it", async () => {
  const { naturalCompletions } = await deadlineWitness;
  requireNoHostFailure(naturalCompletions);
  requireRouteCompleted(naturalCompletions);
  requireDeadlineWithdrawn(naturalCompletions);
  assertNoTimerCommand(naturalCompletions[0]);
  assert.deepEqual(naturalCompletions.map(completedUpdateOutcome), [
    CommandOutcome.Committed,
    CommandOutcome.Committed,
    CommandOutcome.Committed,
  ]);
});

test("the outer Timer withdraws every sibling and a later child is stale", async () => {
  const { interruptedCompletions } = await deadlineWitness;
  requireNoHostFailure(interruptedCompletions);
  requireRouteCompleted(interruptedCompletions);
  requireDeadlineNotWithdrawn(interruptedCompletions);
  assert.equal(completedUpdateOutcome(interruptedCompletions[2]), CommandOutcome.Rejected);
  assert.equal(completedUpdateOutcome(interruptedCompletions[3]), CommandOutcome.Committed);
});

test("coalesced child completion and outer Timer fail before choosing and answer the Update", async () => {
  const { sharedActivationCompletion } = await deadlineWitness;
  requireNoWinnerSelected(
    sharedActivationCompletion,
    bpmnParallelMultiInstanceSchedulerUnavailableFailureType,
  );
  requireRefusedUpdateAnswered(sharedActivationCompletion);
  assert.throws(
    () => requireNoWinnerSelected(
      sharedActivationCompletion,
      "BpmnSequentialMultiInstanceSchedulerUnavailable",
    ),
    /BpmnParallelMultiInstanceSchedulerUnavailable/u,
  );
});

test("first completion follows same-activation Update FIFO in E1 and E2", async () => {
  const runs = await runParallelMultiInstanceFirstFifoWitness();
  const summaries = runs.map(requireFirstFifoRun);
  assert.deepEqual(
    completedWorkflowResult(runs[0].mutationCompletion),
    completedWorkflowResult(runs[1].mutationCompletion),
    "first-policy job order changes the trace, not the terminal semantic receipt",
  );
  assert.deepEqual(summaries.map(({ winnerActivation }) => winnerActivation), [1, 2]);
  assert.deepEqual(
    summaries.map(({ winnerCommandId }) => winnerCommandId),
    ["complete-parallel-review-1", "complete-parallel-review-2"],
  );
  assert.notEqual(
    summaries[0]?.winnerOccurrence,
    summaries[1]?.winnerOccurrence,
    "reversing the two Update jobs must reverse the completed E2 occurrence",
  );
});

function requireFirstFifoRun(run: ParallelMultiInstanceFirstFifoRun): Readonly<{
  winnerActivation: number;
  winnerCommandId: string;
  winnerOccurrence: string;
}> {
  requireNoHostFailure([run.mutationCompletion, run.publicationCompletion]);
  const [winner, stale] = run.stimuli;
  assert.equal(winner.taskId.activation === stale.taskId.activation, false);

  const responses = commands(run.mutationCompletion).flatMap(({ updateResponse }) =>
    updateResponse === undefined || updateResponse === null ? [] : [updateResponse]
  );
  assert.equal(responses.length, 4);
  assert.deepEqual(
    run.updateIds.map((updateId) =>
      responses.filter(({ protocolInstanceId, accepted }) =>
        protocolInstanceId === updateId && accepted !== undefined && accepted !== null
      ).length
    ),
    [1, 1],
    "both same-activation Updates must emit their protocol acceptance response",
  );
  const outcomes = run.updateIds.map((updateId) => {
    const completed = responses.filter(({ protocolInstanceId, completed }) =>
      protocolInstanceId === updateId && completed !== undefined && completed !== null
    );
    assert.equal(completed.length, 1, `${updateId} was not durably resolved`);
    assert.equal(completed[0]?.rejected, undefined);
    const payload = completed[0]?.completed;
    assert.ok(payload !== undefined && payload !== null);
    return defaultPayloadConverter.fromPayload(payload);
  });
  assert.deepEqual(outcomes, [CommandOutcome.Committed, CommandOutcome.Rejected]);

  const execution = queryResult<ExecutionPublicationResult>(
    run.publicationCompletion,
    "parallel-first-e1",
  );
  assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
  if (execution.kind !== ExecutionPublicationResultKind.Available) {
    assert.fail("parallel first-policy E1 publication is unavailable");
  }
  const winnerExecutionBatches = execution.page.batches.filter(({ commandId }) =>
    commandId === winner.commandId
  );
  assert.equal(winnerExecutionBatches.length, 1);
  assert.equal(
    execution.page.batches.some(({ commandId }) => commandId === stale.commandId),
    false,
    "the later queued command must be semantically stale",
  );
  const firstTransition = winnerExecutionBatches[0]?.transitions[0]?.transition;
  assert.equal(firstTransition?.kind, SemanticTransitionKind.ExternalStimulus);
  if (firstTransition?.kind !== SemanticTransitionKind.ExternalStimulus) {
    assert.fail("the accepted exact completion command does not head its E1 batch");
  }
  assert.deepEqual(firstTransition.stimulus, winner);

  const occurrences = queryResult<FlowNodeOccurrencePublicationResult>(
    run.publicationCompletion,
    "parallel-first-e2",
  );
  assert.equal(
    occurrences.kind,
    FlowNodeOccurrencePublicationResultKind.Available,
  );
  if (occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) {
    assert.fail("parallel first-policy E2 publication is unavailable");
  }
  const childStarts = occurrences.page.batches.flatMap(({ transitions }) =>
    transitions.flatMap(({ lifecycle }) => lifecycle.started)
  ).filter(({ elementId }) => elementId === "UserTask_Review");
  assert.equal(childStarts.length, 3);
  const winnerOccurrence = childStarts[winner.taskId.activation - 1];
  assert.ok(winnerOccurrence !== undefined);
  const winnerOccurrenceBatch = occurrences.page.batches.filter(({ commandId }) =>
    commandId === winner.commandId
  );
  assert.equal(winnerOccurrenceBatch.length, 1);
  assert.equal(
    occurrences.page.batches.some(({ commandId }) => commandId === stale.commandId),
    false,
    "the stale completion must publish no E2 batch",
  );
  const childEnds = winnerOccurrenceBatch[0]?.transitions.flatMap(({ lifecycle }) =>
    lifecycle.ended
  ).filter(({ id }) => childStarts.some((started) =>
    occurrenceKey(started.id) === occurrenceKey(id)
  )) ?? [];
  assert.equal(childEnds.length, 3);
  assert.deepEqual(
    childStarts.map(({ id }) =>
      childEnds.find((ended) => occurrenceKey(ended.id) === occurrenceKey(id))?.terminal
    ),
    childStarts.map(({ id }) =>
      occurrenceKey(id) === occurrenceKey(winnerOccurrence.id)
        ? FlowNodeOccurrenceTerminalKind.Completed
        : FlowNodeOccurrenceTerminalKind.Cancelled
    ),
  );
  assert.equal(
    occurrences.page.batches.some(({ transitions }) =>
      transitions.some(({ lifecycle }) =>
        lifecycle.started.some(({ elementId }) => elementId === "UserTask_Escalation")
      )
    ),
    false,
    "the outer Timer route must not win",
  );
  assert.equal(
    commands(run.mutationCompletion).some(({ cancelTimer }) => cancelTimer?.seq === 1),
    true,
    "first completion must withdraw the still-live outer Timer",
  );

  return {
    winnerActivation: winner.taskId.activation,
    winnerCommandId: winner.commandId,
    winnerOccurrence: occurrenceKey(winnerOccurrence.id),
  };
}

function queryResult<Result>(completion: Completion, queryId: string): Result {
  const results = commands(completion).flatMap(({ respondToQuery }) =>
    respondToQuery?.queryId === queryId ? [respondToQuery] : []
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]?.failed, undefined);
  const payload = results[0]?.succeeded?.response;
  assert.ok(payload !== undefined && payload !== null);
  return defaultPayloadConverter.fromPayload(payload) as Result;
}

function occurrenceKey(id: FlowNodeOccurrenceId): string {
  return `${id.processInstanceId}:${String(id.startRevision)}:${String(id.startIndex)}`;
}

function assertNoTimerCommand(completion: Completion | undefined): void {
  assert.ok(completion !== undefined);
  assert.equal(commands(completion).some(({ startTimer, cancelTimer }) =>
    startTimer !== undefined || cancelTimer !== undefined), false);
}

function completedUpdateOutcome(completion: Completion | undefined): CommandOutcome {
  assert.ok(completion !== undefined);
  const completed = commands(completion).flatMap(({ updateResponse }) =>
    updateResponse?.completed === undefined || updateResponse.completed === null
      ? []
      : [updateResponse.completed]
  );
  assert.equal(completed.length, 1);
  const payload = completed[0];
  assert.ok(payload !== undefined);
  const outcome = defaultPayloadConverter.fromPayload(payload);
  assert.equal(Object.values(CommandOutcome).includes(outcome as CommandOutcome), true);
  return outcome as CommandOutcome;
}
