/**
 * Host-level assertions shared by every boundary-deadline family.
 *
 * These read only emitted Workflow commands, so they are generic over which wait the deadline bounds
 * and over what firing does to it: a bounded Activity's own task, a bounded scope's live child
 * region, or a monitored task that firing leaves open. The refusal identity is a parameter rather
 * than a constant here precisely because the families must not share one, and a copied identity
 * would otherwise satisfy every assertion in all three.
 */
import assert from "node:assert/strict";

import {
  commands,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import type { Completion } from "./direct-vm-activation-harness.ts";

/** Requires the route to have reached its own End Event. */
export function requireRouteCompleted(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(reachedCompletion(completions), true);
}

/** Requires the other route's follow-on Task to have never opened. */
export function requireRouteNotTaken(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(reachedCompletion(completions), false);
}

function reachedCompletion(
  completions: ReadonlyArray<Completion>,
): boolean {
  return completions.some((completion) =>
    commands(completion).some(
      ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
    )
  );
}

/** Requires the host to have refused under `failureType` rather than selected a winner. */
export function requireNoWinnerSelected(
  completion: Completion,
  failureType: string,
): void {
  assert.equal(workflowFailureType(completion), failureType);
  // A refusal that had already cancelled the deadline would have committed a victory first.
  assert.equal(
    commands(completion).some(({ cancelTimer }) => cancelTimer !== undefined),
    false,
  );
}

/**
 * Requires the bounded wait's own victory to have withdrawn its durable deadline.
 *
 * Its counterpart below must stay separate: a deadline that fired was never withdrawn, so asserting
 * withdrawal on both routes would assert nothing about either.
 */
export function requireDeadlineWithdrawn(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(cancelledDeadline(completions), true);
}

/** Requires the winning deadline not to have been cancelled, since it fired instead. */
export function requireDeadlineNotWithdrawn(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(cancelledDeadline(completions), false);
}

function cancelledDeadline(completions: ReadonlyArray<Completion>): boolean {
  return completions.some((completion) =>
    commands(completion).some(({ cancelTimer }) => cancelTimer?.seq === 1)
  );
}

/**
 * Requires the refused completion Update to have been answered rather than left silent.
 *
 * The two ways this could go wrong are opposite: no response at all would strand the caller, while a
 * `completed` response would mean the host had chosen a winner after declaring it could not.
 *
 * What this does *not* establish: that a client awaiting the Update observes the failure. That is a
 * server-side fact and needs the real Temporal service.
 */
export function requireRefusedUpdateAnswered(completion: Completion): void {
  const responses = commands(completion).flatMap(({ updateResponse }) =>
    updateResponse === undefined || updateResponse === null ? [] : [updateResponse]
  );
  assert.equal(responses.length, 1);
  assert.notEqual(responses[0]?.accepted, undefined);
  // The refusal is non-retryable, so no later attempt can produce this result either.
  assert.equal(responses[0]?.completed, undefined);
  assert.equal(responses[0]?.rejected, undefined);
}

/** Requires no activation in the run to have failed. */
export function requireNoHostFailure(
  completions: ReadonlyArray<Completion>,
): void {
  for (const completion of completions) {
    assert.equal(workflowFailureType(completion), undefined);
  }
}
