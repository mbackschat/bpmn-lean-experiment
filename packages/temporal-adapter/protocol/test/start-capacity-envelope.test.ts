/**
 * Locks the pre-start capacity envelope of the portable handoff: it runs the real semantic-core journey with every
 * future output at its full per-value allowance, refuses exactly when an estimate passes its bound, and leaves every
 * other profile alone.
 *
 * The oracle for soundness against the Workflow encoders lives in the Workflow package's test; this file settles the
 * envelope's own contract and its nearest-over-bound behavior at injected and at production limits.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  canonicalValueUtf8ByteLength,
  isSingletonBusinessItem,
  maximumCanonicalValueBytes,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  runStartCapacityJourney,
  startCapacityEnvelopeBudgets,
  startCapacityEnvelopeEvidence,
} from "../dist/index.js";
import {
  portableHandoffProgram,
  portableHandoffStart,
} from "./portable-handoff-capacity-fixture.ts";

const production = productionStartCapacityEnvelopeLimits();

test("the full-allowance value is exactly the per-value allowance and an admitted port item", () => {
  const value = fullAllowanceValue();
  assert.equal(canonicalValueUtf8ByteLength(value), maximumCanonicalValueBytes);
  assert.ok(isSingletonBusinessItem(value));
});

test("the journey submits the full allowance under the Program's own output names, from committed waits", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  assert.ok(supportsSemanticProcessExecution(start, program));
  const { steps } = runStartCapacityJourney(start, program);
  const submitted = steps.slice(1).flatMap(({ stimulus }) =>
    stimulus.kind === StimulusKind.CompleteUserTaskInstance ? [stimulus] : assert.fail("not a completion"));
  assert.deepEqual(submitted.map(({ taskId }) => taskId.elementId), ["ReviewOrder", "ArchiveOrder"]);
  assert.deepEqual(submitted.map(({ submittedValues }) => submittedValues.map(({ name }) => name)),
    [["ReviewOrder_out"], ["ArchiveOrder_out"]]);
  for (const { submittedValues } of submitted) {
    const [binding] = submittedValues;
    assert.ok(binding !== undefined && binding.value.kind === VariableValueKind.Map);
    assert.equal(canonicalValueUtf8ByteLength(binding.value), maximumCanonicalValueBytes);
  }
});

test("admits the maximal order at production limits and reports an estimate for every budget", async () => {
  const program = await portableHandoffProgram();
  const result = assessStartCapacityEnvelope(portableHandoffStart("Order_1", fullAllowanceValue()), program);
  assert.ok(result.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  assert.deepEqual(Object.keys(result.estimates).sort(), [...startCapacityEnvelopeBudgets].sort());
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(result.estimates[budget] > 0, budget);
    assert.ok(result.estimates[budget] <= production[budget], budget);
  }
});

test("leaves a profile outside the envelope unchanged", async () => {
  const program = await portableHandoffProgram();
  const older: SemanticProcessProgram = { ...program, identity: { ...program.identity,
    semanticProfile: SemanticProfileId.StructuredProcessComposition } };
  assert.deepEqual(
    assessStartCapacityEnvelope(portableHandoffStart("Order_1", fullAllowanceValue()), older),
    { kind: StartCapacityEnvelopeResultKind.NotApplicable },
  );
});

test("refuses at the exact estimate minus one for every budget and admits at the estimate", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const baseline = assessStartCapacityEnvelope(start, program);
  assert.ok(baseline.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  for (const budget of startCapacityEnvelopeBudgets) {
    const estimate = baseline.estimates[budget];
    const over = assessStartCapacityEnvelope(start, program, { ...production, [budget]: estimate - 1 });
    assert.ok(over.kind === StartCapacityEnvelopeResultKind.Exceeded, budget);
    assert.deepEqual(over.failure, { budget, configuredBound: estimate - 1, estimatedValue: estimate });
    assert.match(startCapacityEnvelopeEvidence(over.failure), new RegExp(`${estimate}.*${budget}.*${estimate - 1}`, "u"));
    const exact = assessStartCapacityEnvelope(start, program, { ...production, [budget]: estimate });
    assert.equal(exact.kind, StartCapacityEnvelopeResultKind.WithinCapacity, budget);
  }
});

test("names the first exceeded budget in declaration order when several are over", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const lowest = Object.fromEntries(startCapacityEnvelopeBudgets.map((budget) => [budget, 1])) as typeof production;
  const result = assessStartCapacityEnvelope(start, program, lowest);
  assert.ok(result.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(result.failure.budget, startCapacityEnvelopeBudgets[0]);
});

test("rejects injected limits that are not positive safe integers or that exceed production", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const budget = startCapacityEnvelopeBudgets[3];
  assert.throws(() => assessStartCapacityEnvelope(start, program, { ...production, [budget]: 0 }), TypeError);
  assert.throws(() => assessStartCapacityEnvelope(start, program, { ...production, [budget]: 1.5 }), TypeError);
  assert.throws(() => assessStartCapacityEnvelope(start, program, { ...production, [budget]: production[budget] + 1 }), RangeError);
});

test("at production limits the longest admitted instance ID is separated from the shortest refused one by one byte", async () => {
  const program = await portableHandoffProgram();
  const value = fullAllowanceValue();
  const admitted = (length: number) => {
    const start = portableHandoffStart("I".repeat(length), value);
    assert.ok(supportsSemanticProcessExecution(start, program), `Start of ${length} bytes is admitted by the semantic core`);
    return assessStartCapacityEnvelope(start, program);
  };
  let fits = 1;
  let over = 64 * 1024;
  assert.equal(admitted(fits).kind, StartCapacityEnvelopeResultKind.WithinCapacity);
  assert.equal(admitted(over).kind, StartCapacityEnvelopeResultKind.Exceeded);
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (admitted(middle).kind === StartCapacityEnvelopeResultKind.WithinCapacity) fits = middle;
    else over = middle;
  }
  const refused = admitted(over);
  assert.ok(refused.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(over, fits + 1);
  assert.ok(refused.failure.estimatedValue > refused.failure.configuredBound);
  assert.ok(refused.failure.estimatedValue - refused.failure.configuredBound <= 64,
    "one more identifier byte crosses the bound by at most the per-byte copy count");
});

test("a Start whose own value is small is never refused: the allowance is reserved for future outputs only", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", { kind: VariableValueKind.String, value: "x" });
  const result = assessStartCapacityEnvelope(start, program);
  assert.equal(result.kind, StartCapacityEnvelopeResultKind.WithinCapacity);
});
