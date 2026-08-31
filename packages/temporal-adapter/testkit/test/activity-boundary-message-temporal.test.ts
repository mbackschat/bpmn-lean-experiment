/** Locks Message/completion co-readiness to the approved fail-closed Temporal account. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnEventRaceOrderingUnavailableFailureType,
  bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
} from "@bpmn-lean/temporal-testkit";

import {
  requireNoHostFailure,
  requireRefusedUpdateAnswered,
  requireRouteCompleted,
} from "./boundary-deadline-assertions.ts";
import {
  commands,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import {
  runActivityBoundaryMessageTemporalWitness,
} from "./activity-boundary-message-temporal-witness.ts";

const readinessWitness = runActivityBoundaryMessageTemporalWitness();

test("executes each winner when only that callback becomes ready", async () => {
  const witness = await readinessWitness;
  requireNoHostFailure(witness.taskVictoryCompletions);
  requireNoHostFailure(witness.messageVictoryCompletions);
  requireRouteCompleted(witness.taskVictoryCompletions);
  requireRouteCompleted(witness.messageVictoryCompletions);
});

test("fails under the Message-bounded identity when Signal and Update share one activation", async () => {
  const completion = (await readinessWitness).sharedActivationCompletion;
  assert.equal(
    workflowFailureType(completion),
    bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
  );
  assert.notEqual(
    workflowFailureType(completion),
    bpmnBoundedActivitySchedulerUnavailableFailureType,
  );
  assert.notEqual(
    workflowFailureType(completion),
    bpmnEventRaceOrderingUnavailableFailureType,
  );
  assert.equal(commands(completion).some(
    ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
  ), false);
});

test("answers the refused completion Update without publishing a result", async () => {
  requireRefusedUpdateAnswered(
    (await readinessWitness).sharedActivationCompletion,
  );
});
