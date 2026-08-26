/** Locks the parallel Multi-Instance host to one outer-lifetime Timer and typed coalescence refusal. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  bpmnParallelMultiInstanceSchedulerUnavailableFailureType,
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
import { commands } from "./direct-vm-activation-harness.ts";
import type { Completion } from "./direct-vm-activation-harness.ts";
import {
  runParallelMultiInstanceDeadlineWitness,
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
