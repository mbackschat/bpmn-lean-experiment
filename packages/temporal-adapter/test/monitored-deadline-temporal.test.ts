/** Locks the host's non-interrupting deadline scheduler against winner selection and over-refusal. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bpmnMonitoredActivitySchedulerUnavailableFailureType,
} from "@bpmn-lean/temporal-adapter";

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
  runMonitoredDeadlineWitness,
} from "./monitored-deadline-witness.ts";

const deadlineWitness = runMonitoredDeadlineWitness();

/**
 * Both ordinary outcomes must execute. A host that refuses whenever a deadline is merely armed makes
 * the family unreachable, which is indistinguishable from not implementing it.
 *
 * The completion outcome withdraws the deadline; the spawn outcome does not, because the deadline
 * fired instead of being cancelled.
 */
test("the host executes both the withdrawal and the spawn when only one callback arrives", async () => {
  const witness = await deadlineWitness;
  requireNoHostFailure(witness.completionVictoryCompletions);
  requireNoHostFailure(witness.spawnCompletions);
  requireRouteCompleted(witness.completionVictoryCompletions);
  requireRouteCompleted(witness.spawnCompletions);
  requireDeadlineWithdrawn(witness.completionVictoryCompletions);
  requireDeadlineNotWithdrawn(witness.spawnCompletions);
});

/**
 * The spawn must leave its host active rather than route around it. Completing the *normal*
 * follow-on straight after the deadline fires must not reach an End Event, because that task belongs
 * to the host's own completion and the host is still open. Without this, a host that interrupted on
 * firing and continued along the normal flow would satisfy every assertion above.
 */
test("the spawn does not open the host's own follow-on Task", async () => {
  requireRouteNotTaken((await deadlineWitness).prematureNormalRouteCompletions);
});

/**
 * This profile defines no winner for host simultaneity, so a shared activation must refuse under its
 * own identity rather than let raw job order decide BPMN meaning. The two assertions are distinct:
 * refusing is not enough if the refusal is reached by first committing an outcome.
 *
 * The identity must be this family's. Sharing the interrupting family's would make the three hosts'
 * failures indistinguishable in the one place an operator reads them.
 */
test("a shared activation refuses under the monitored identity instead of choosing", async () => {
  const witness = await deadlineWitness;
  requireNoWinnerSelected(
    witness.sharedActivationCompletion,
    bpmnMonitoredActivitySchedulerUnavailableFailureType,
  );
  assert.throws(
    () =>
      requireNoWinnerSelected(
        witness.sharedActivationCompletion,
        "BpmnBoundedActivitySchedulerUnavailable",
      ),
    /BpmnMonitoredActivitySchedulerUnavailable/u,
  );
});

/**
 * The refusal must not strand the completion it refuses. Its Update is accepted and then answered by
 * the Workflow's own failure, never by a result, because a result would mean a winner was chosen
 * after the host declared it could not choose one.
 */
test("the refused shared activation answers its in-flight completion Update", async () => {
  const witness = await deadlineWitness;
  requireRefusedUpdateAnswered(witness.sharedActivationCompletion);
  // The successful runs do produce a result, so the assertion above reads the refusal's own shape
  // rather than a property every activation happens to have.
  const spawnFirstActivation = witness.spawnCompletions[0];
  assert.notEqual(spawnFirstActivation, undefined);
  if (spawnFirstActivation !== undefined) {
    assert.throws(() => requireRefusedUpdateAnswered(spawnFirstActivation));
  }
});
