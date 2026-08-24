/** Locks the sequential Multi-Instance host to one outer-lifetime Timer. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  bpmnSequentialMultiInstanceSchedulerUnavailableFailureType,
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
} from "./direct-vm-activation-harness.ts";
import type { Completion } from "./direct-vm-activation-harness.ts";
import {
  runSequentialMultiInstanceDeadlineWitness,
} from "./sequential-multi-instance-deadline-witness.ts";

const deadlineWitness = runSequentialMultiInstanceDeadlineWitness();

test("task turnover preserves one Timer and natural completion withdraws it", async () => {
  const { naturalCompletions } = await deadlineWitness;
  requireNoHostFailure(naturalCompletions);
  requireRouteCompleted(naturalCompletions);
  requireDeadlineWithdrawn(naturalCompletions);
  assertNoTimerCommand(naturalCompletions[0]);
  assert.equal(completedUpdateOutcome(naturalCompletions[0]), CommandOutcome.Committed);
  assert.equal(completedUpdateOutcome(naturalCompletions[1]), CommandOutcome.Committed);
});

test("the original Timer interrupts the successor task and its stale identity is rejected", async () => {
  const { interruptedCompletions } = await deadlineWitness;
  requireNoHostFailure(interruptedCompletions);
  requireRouteCompleted(interruptedCompletions);
  requireDeadlineNotWithdrawn(interruptedCompletions);
  assertNoTimerCommand(interruptedCompletions[0]);
  assert.equal(completedUpdateOutcome(interruptedCompletions[2]), CommandOutcome.Rejected);
  assert.equal(completedUpdateOutcome(interruptedCompletions[3]), CommandOutcome.Committed);
});

test("a coalesced successor completion and lifetime Timer fail before choosing", async () => {
  const { sharedActivationCompletion } = await deadlineWitness;
  requireNoWinnerSelected(
    sharedActivationCompletion,
    bpmnSequentialMultiInstanceSchedulerUnavailableFailureType,
  );
  requireRefusedUpdateAnswered(sharedActivationCompletion);
  assert.throws(
    () =>
      requireNoWinnerSelected(
        sharedActivationCompletion,
        "BpmnBoundedActivitySchedulerUnavailable",
      ),
    /BpmnSequentialMultiInstanceSchedulerUnavailable/u,
  );
});

function assertNoTimerCommand(completion: Completion | undefined): void {
  assert.ok(completion !== undefined);
  assert.equal(
    commands(completion).some(
      ({ startTimer, cancelTimer }) =>
        startTimer !== undefined || cancelTimer !== undefined,
    ),
    false,
  );
}

function completedUpdateOutcome(completion: Completion | undefined): CommandOutcome {
  assert.ok(completion !== undefined);
  const completed = commands(completion).flatMap(({ updateResponse }) =>
    updateResponse?.completed === undefined || updateResponse.completed === null
      ? []
      : [updateResponse.completed]
  );
  assert.equal(completed.length, 1);
  const [payload] = completed;
  assert.ok(payload !== undefined);
  const outcome = defaultPayloadConverter.fromPayload(payload);
  assert.equal(Object.values(CommandOutcome).includes(outcome as CommandOutcome), true);
  return outcome as CommandOutcome;
}
