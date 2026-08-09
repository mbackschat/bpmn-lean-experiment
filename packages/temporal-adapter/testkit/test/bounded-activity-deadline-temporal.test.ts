/** Locks the host's boundary-deadline scheduler against winner selection and unconditional refusal. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { bpmnBoundedActivitySchedulerUnavailableFailureType } from "@bpmn-lean/temporal-testkit";

import {
  requireDeadlineNotWithdrawn,
  requireDeadlineWithdrawn,
  requireNoHostFailure,
  requireNoWinnerSelected,
  requireRefusedUpdateAnswered,
  requireRouteCompleted,
  requireRouteNotTaken,
} from "./boundary-deadline-assertions.ts";
import {
  runBoundedActivityDeadlineWitness,
} from "./bounded-activity-deadline-witness.ts";

const deadlineWitness = runBoundedActivityDeadlineWitness();

/**
 * Both ordinary outcomes must execute. A host that refuses whenever a deadline is merely armed
 * makes the family unreachable, which is indistinguishable from not implementing it.
 *
 * Each route is observed by completing *its own* follow-on User Task and requiring the Process to
 * reach an End Event. Absence of failure would not discriminate here: a Workflow that did nothing at
 * all also never fails.
 */
test("the host executes each victory when only its own callback arrives", async () => {
  const witness = await deadlineWitness;
  requireNoHostFailure(witness.activityVictoryCompletions);
  requireNoHostFailure(witness.deadlineVictoryCompletions);
  requireRouteCompleted(witness.activityVictoryCompletions);
  requireRouteCompleted(witness.deadlineVictoryCompletions);
  requireDeadlineWithdrawn(witness.activityVictoryCompletions);
  requireDeadlineNotWithdrawn(witness.deadlineVictoryCompletions);
});

/**
 * The routes must actually differ. This completes the *normal* follow-on Task after the deadline
 * won, which no route offers, so the Process must not reach an End Event — without this, both
 * victories above would pass on a host that always took the same route.
 */
test("the deadline victory does not open the normal route's follow-on Task", async () => {
  requireRouteNotTaken((await deadlineWitness).crossRouteCompletions);
});

/**
 * This capsule defines no winner for host simultaneity, so a shared activation must refuse under
 * its own identity rather than let raw job order decide BPMN meaning. The two assertions are
 * distinct: refusing is not enough if the refusal is reached by first committing a victory.
 */
test("a shared activation refuses under the bounded identity instead of choosing", async () => {
  const witness = await deadlineWitness;
  requireNoWinnerSelected(
    witness.sharedActivationCompletion,
    bpmnBoundedActivitySchedulerUnavailableFailureType,
  );
  assert.throws(
    () => requireNoWinnerSelected(
      witness.sharedActivationCompletion,
      "BpmnEventRaceOrderingUnavailable",
    ),
    /BpmnBoundedActivitySchedulerUnavailable/u,
  );
});

/**
 * The refusal must not strand the completion it refuses. Its Update is accepted and then answered by
 * the Workflow's own failure, never by a result — a result would mean a winner was chosen after the
 * host declared it could not choose one.
 */
test("the refused shared activation answers its in-flight completion Update", async () => {
  const witness = await deadlineWitness;
  requireRefusedUpdateAnswered(witness.sharedActivationCompletion);
  // The successful runs do produce a result, so the assertion above is reading the refusal's own
  // shape rather than a property every activation happens to have.
  const victoryFirstActivation = witness.activityVictoryCompletions[0];
  assert.notEqual(victoryFirstActivation, undefined);
  if (victoryFirstActivation !== undefined) {
    assert.throws(() => requireRefusedUpdateAnswered(victoryFirstActivation));
  }
});
