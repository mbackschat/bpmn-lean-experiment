/**
 * Locks the structured Message-payload capacity envelope of `PBV-MSG-03`: the journey answers the single open
 * payload-bearing Message wait with the full-allowance payload, every host-input and continuation estimate after the
 * delivery counts its completed delivery record, and identifier length is the only lever that refuses a Start.
 *
 * Soundness against the Workflow encoders is settled by the Workflow package's Message-payload envelope test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { StimulusKind } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  WorkflowChainBudgetKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  runStartCapacityJourney,
} from "../dist/index.js";
import { manifestStart, settlementProgram, shipmentManifestProgram } from "./message-payload-capacity-fixture.ts";

test("the journey delivers the full-allowance payload to the one Message wait, then completes Review with no data", async () => {
  const program = await shipmentManifestProgram();
  const { steps } = runStartCapacityJourney(manifestStart(program, "Manifest_1"), program);
  const [, delivery, review] = steps.map(({ stimulus }) => stimulus);
  assert.equal(steps.length, 3);
  assert.ok(delivery?.kind === StimulusKind.DeliverPayloadMessage);
  assert.deepEqual(delivery.payload, fullAllowanceValue());
  assert.equal(delivery.commandId.length, reservedFutureCommandIdBytes);
  assert.ok(review?.kind === StimulusKind.CompleteUserTaskInstance);
  assert.deepEqual(review.submittedValues, []);
  assert.equal(steps.at(-1)?.committed.state.control.kind, "completed");
});

test("the host input and successor estimates carry the reserved delivery record beside the bound Property", async () => {
  const program = await shipmentManifestProgram();
  const envelope = assessStartCapacityEnvelope(manifestStart(program, "Manifest_1"), program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
  // Committed state, the publication continuation and the host input's delivery record each carry one payload copy
  // after delivery; without the record the successor estimate holds only two.
  assert.ok(envelope.estimates[WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes] > 3 * 16_384);
});

test("identifier length alone refuses a Start, naming the exceeded budget", async () => {
  const program = await shipmentManifestProgram();
  const production = productionStartCapacityEnvelopeLimits();
  const host = WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes;
  const fits = assessStartCapacityEnvelope(manifestStart(program, "Manifest_1"), program);
  assert.ok(fits.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  const lowered = { ...production, [host]: fits.estimates[host] };
  assert.equal(assessStartCapacityEnvelope(manifestStart(program, "Manifest_1"), program, lowered).kind,
    StartCapacityEnvelopeResultKind.WithinCapacity, "the exact estimate fits");
  const longer = assessStartCapacityEnvelope(manifestStart(program, "Manifest_12"), program, lowered);
  assert.ok(longer.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(longer.failure.budget, host);
});

test("the closed scalar payload-catch profile is outside the envelope", async () => {
  const program = await settlementProgram();
  assert.equal(assessStartCapacityEnvelope(manifestStart(program, "Settlement_1"), program).kind,
    StartCapacityEnvelopeResultKind.NotApplicable);
});
