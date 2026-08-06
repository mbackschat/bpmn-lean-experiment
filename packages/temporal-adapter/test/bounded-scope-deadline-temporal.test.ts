/** Locks the bounded-scope deadline scheduler against winner selection and a copied refusal identity. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnBoundedScopeSchedulerUnavailableFailureType,
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
  runBoundedScopeDeadlineWitness,
} from "./bounded-scope-deadline-witness.ts";

const scopeWitness = runBoundedScopeDeadlineWitness();

/**
 * Both ordinary outcomes must execute. A host that refuses whenever a deadline is merely armed makes
 * the family unreachable, which is indistinguishable from not implementing it.
 *
 * Each route is observed by completing *its own* follow-on User Task and requiring the Process to
 * reach an End Event. Absence of failure would not discriminate here: a Workflow that did nothing at
 * all also never fails.
 */
test("the host executes each bounded-scope victory when only its own callback arrives", async () => {
  const witness = await scopeWitness;
  requireNoHostFailure(witness.quiescenceVictoryCompletions);
  requireNoHostFailure(witness.deadlineVictoryCompletions);
  requireRouteCompleted(witness.quiescenceVictoryCompletions);
  requireRouteCompleted(witness.deadlineVictoryCompletions);
  requireDeadlineWithdrawn(witness.quiescenceVictoryCompletions);
  requireDeadlineNotWithdrawn(witness.deadlineVictoryCompletions);
});

/**
 * The routes must actually differ. This completes the *normal* follow-on Task after the deadline
 * cancelled the child region, which no route offers, so the Process must not reach an End Event —
 * without this, both victories above would pass on a host that always took the same route.
 */
test("the bounded-scope deadline victory does not open the normal route's follow-on Task", async () => {
  requireRouteNotTaken((await scopeWitness).crossRouteCompletions);
});

/**
 * This capsule defines no winner for host simultaneity, so a shared activation must refuse under its
 * own identity rather than let raw job order decide BPMN meaning.
 *
 * The second assertion is the one this lane exists for. The bounded-Activity scheduler is the same
 * mechanism with the same barrier, so a copied identity would satisfy every other assertion in this
 * file and in its sibling; requiring the refusal *not* to carry the Activity identity is what makes
 * that copy visible. The third assertion keeps the first two honest by checking that the refusal is
 * not reached by first committing a victory.
 */
test("a shared bounded-scope activation refuses under its own identity instead of choosing", async () => {
  const witness = await scopeWitness;
  requireNoWinnerSelected(
    witness.sharedActivationCompletion,
    bpmnBoundedScopeSchedulerUnavailableFailureType,
  );
  assert.throws(
    () =>
      requireNoWinnerSelected(
        witness.sharedActivationCompletion,
        bpmnBoundedActivitySchedulerUnavailableFailureType,
      ),
    /BpmnBoundedScopeSchedulerUnavailable/u,
  );
  assert.notEqual(
    bpmnBoundedScopeSchedulerUnavailableFailureType,
    bpmnBoundedActivitySchedulerUnavailableFailureType,
  );
});

/**
 * The refusal must not strand the child completion it refuses. Its Update is accepted and then
 * answered by the Workflow's own failure, never by a result — a result would mean a winner was
 * chosen after the host declared it could not choose one.
 */
test("the refused shared bounded-scope activation answers its in-flight completion Update", async () => {
  const witness = await scopeWitness;
  requireRefusedUpdateAnswered(witness.sharedActivationCompletion);
  // The successful runs do produce a result, so the assertion above is reading the refusal's own
  // shape rather than a property every activation happens to have.
  const victoryFirstActivation = witness.quiescenceVictoryCompletions[0];
  assert.notEqual(victoryFirstActivation, undefined);
  if (victoryFirstActivation !== undefined) {
    assert.throws(() => requireRefusedUpdateAnswered(victoryFirstActivation));
  }
});
