/**
 * Locks the nested scope-data capacity reservation of the hosting preflight: every User Task submits, in some
 * enumerated journey, a patch filling the whole `NSD-TASK-01` allowance under each name it may write, and the empty
 * patch; the envelope reports each budget's maximum over those journeys.
 *
 * Soundness against the Workflow encoders is settled by the Workflow package's nested scope-data envelope test.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { StimulusKind, canonicalNamedValueArrayUtf8ByteLength, nestedScopePatchByteLimit } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  WorkflowChainBudgetKind,
  assessStartCapacityEnvelope,
  productionStartCapacityEnvelopeLimits,
  runStartCapacityJourney,
  startCapacityJourneys,
} from "../dist/index.js";
import { claimStart, claimValue, nestedScopeProgram } from "./nested-scope-data-capacity-fixture.ts";

const reviewPatch = (journey: ReturnType<typeof runStartCapacityJourney>) => {
  const review = journey.steps.map(({ stimulus }) => stimulus).find(({ kind }) => kind === StimulusKind.CompleteUserTaskInstance);
  assert.ok(review?.kind === StimulusKind.CompleteUserTaskInstance);
  return review.submittedValues;
};

test("the Review Claim journeys fill the whole allowance under claim, then ticket, then submit nothing", async () => {
  const program = await nestedScopeProgram("expense-claim");
  const journeys = startCapacityJourneys(claimStart(program, "Claim_1"), program);
  assert.ok(journeys !== null);
  assert.deepEqual(journeys.map(({ reservedTargets }) => reservedTargets), [[3], [3], [3]]);
  const patches = journeys.map(reviewPatch);
  assert.deepEqual(patches.map((patch) => patch.map(({ name }) => name)), [["claim"], ["ticket"], []]);
  for (const patch of patches.slice(0, 2)) {
    assert.equal(canonicalNamedValueArrayUtf8ByteLength(patch), nestedScopePatchByteLimit);
  }
});

test("the envelope's committed-state estimate follows the ticket journey, which outgrows the claim journey", async () => {
  const program = await nestedScopeProgram("expense-claim");
  const start = claimStart(program, "Claim_1", claimValue(1));
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
  const committed = (journey: ReturnType<typeof runStartCapacityJourney>) =>
    Math.max(...journey.steps.map(({ committed: step }) => Buffer.byteLength(JSON.stringify(step.state))));
  const [claim, ticket] = startCapacityJourneys(start, program) ?? [];
  assert.ok(claim !== undefined && ticket !== undefined);
  // The ticket copies sit beside the untouched claim and its copy, so a fixed claim target would under-reserve.
  assert.ok(committed(ticket) > committed(claim));
  assert.ok(envelope.estimates[WorkflowChainBudgetKind.CommittedRuntimeStateBytes] >= committed(ticket));
});

test("a Start whose claim pushes the reserved journeys past the committed-state budget is refused", async () => {
  const program = await nestedScopeProgram("expense-claim");
  const refused = assessStartCapacityEnvelope(claimStart(program, "Claim_1", claimValue(4)), program);
  assert.ok(refused.kind === StartCapacityEnvelopeResultKind.Exceeded, JSON.stringify(refused));
  assert.ok(refused.failure.estimatedValue > productionStartCapacityEnvelopeLimits()[refused.failure.budget]);
});

for (const [model, scenario] of [["purchase-order", "order-approved"], ["bulk-quote", "quote-signed"]] as const) {
  test(`the retained ${model} model reserves one journey per writable name and the empty patch`, async () => {
    const program = await nestedScopeProgram(model);
    const retained: unknown = JSON.parse(await readFile(
      new URL(`../../../../scenarios/nested-embedded-scope-data/${scenario}.scenario.json`, import.meta.url), "utf8"));
    const start = (retained as { stimuli: [Parameters<typeof runStartCapacityJourney>[0]] }).stimuli[0];
    const first = runStartCapacityJourney(start, program);
    assert.ok(first.reservedTargets.length >= 1);
    assert.equal(startCapacityJourneys(start, program)?.length,
      first.reservedTargets.reduce((product, targets) => product * targets, 1));
  });
}
