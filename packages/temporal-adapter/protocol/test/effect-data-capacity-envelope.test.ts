/**
 * Locks the effect-data capacity envelope of `PBV-EFF-05`: the journey completes each Service Task with a handler
 * result that reserves the full allowance for every local its output parameters read, the per-task Activity checks
 * refuse exactly at their reservation, and the aggregate budgets apply to the effect journey as to the handoff.
 *
 * Soundness against the Workflow encoders is settled by the Workflow package's effect-data envelope test; this file
 * settles the envelope's own contract at injected and production limits.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
  canonicalValueUtf8ByteLength,
  maximumCanonicalValueBytes,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";

import {
  StartCapacityEffectCheck,
  StartCapacityEnvelopeResultKind,
  WorkflowChainBudgetKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  productionStartCapacityEffectLimits,
  productionStartCapacityEnvelopeLimits,
  runStartCapacityJourney,
  startCapacityEffectChecks,
  startCapacityEffectEvidence,
  startCapacityEnvelopeBudgets,
  workflowChainCanonicalUtf8ByteLength as bytes,
} from "../dist/index.js";
import {
  creditDecisionProgram,
  creditStart,
  withExtraAssessOutputs,
  withFollowUpNotifications,
} from "./effect-data-capacity-fixture.ts";

const production = productionStartCapacityEnvelopeLimits();
const effectProduction = productionStartCapacityEffectLimits();

test("the journey returns the full allowance for each task's own output local and arms Notify with it", async () => {
  const program = await creditDecisionProgram();
  const start = creditStart("Credit_1");
  assert.ok(supportsSemanticProcessExecution(start, program));
  const { steps } = runStartCapacityJourney(start, program);
  assert.deepEqual(steps.map(({ stimulus }) => stimulus.kind),
    [StimulusKind.StartProcess, StimulusKind.CompleteEffect, StimulusKind.CompleteEffect]);
  assert.deepEqual(steps.map(({ effect }) => effect?.elementId ?? null), [null, "AssessCredit", "NotifyApplicant"]);
  assert.deepEqual(steps.map(({ effect }) => effect?.result), [undefined,
    { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "assessment", value: fullAllowanceValue() }] },
    { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "receipt", value: fullAllowanceValue() }] }]);
  assert.deepEqual(steps[1]?.effect?.request.arguments, [{ name: "applicant", value: start.initialVariables[0]?.value }]);
  const [notified] = steps[2]?.effect?.request.arguments ?? [];
  assert.equal(notified?.name, "assessment");
  assert.ok(notified !== undefined && notified.value.kind === VariableValueKind.Map);
  assert.equal(canonicalValueUtf8ByteLength(notified.value), maximumCanonicalValueBytes,
    "the reserved assessment is the Notify argument snapshot");
  assert.equal(steps.at(-1)?.committed.state.control.kind, "completed");
});

test("admits the maximal credit decision at production limits with an estimate for every budget", async () => {
  const result = assessStartCapacityEnvelope(creditStart("Credit_1"), await creditDecisionProgram());
  assert.ok(result.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(result.estimates[budget] > 0, budget);
    assert.ok(result.estimates[budget] <= production[budget], budget);
  }
});

test("refuses at every aggregate budget's estimate minus one and admits at the estimate", async () => {
  const program = await creditDecisionProgram();
  const start = creditStart("Credit_1");
  const baseline = assessStartCapacityEnvelope(start, program);
  assert.ok(baseline.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  for (const budget of startCapacityEnvelopeBudgets) {
    const estimate = baseline.estimates[budget];
    const over = assessStartCapacityEnvelope(start, program, { ...production, [budget]: estimate - 1 });
    assert.ok(over.kind === StartCapacityEnvelopeResultKind.Exceeded, budget);
    assert.deepEqual(over.failure, { budget, configuredBound: estimate - 1, estimatedValue: estimate });
    assert.equal(assessStartCapacityEnvelope(start, program, { ...production, [budget]: estimate }).kind,
      StartCapacityEnvelopeResultKind.WithinCapacity, budget);
  }
});

test("each per-task check refuses at its largest reservation minus one, naming the first task that holds it", async () => {
  const program = await creditDecisionProgram();
  const start = creditStart("Credit_1");
  const { steps } = runStartCapacityJourney(start, program);
  const [assess, notify] = steps.slice(1).map(({ effect }) => effect ?? assert.fail("an effect step"));
  assert.ok(assess !== undefined && notify !== undefined);
  // Assess's longer output name makes its reservation the larger one; Notify's request carries the reserved snapshot.
  const expected = [
    [StartCapacityEffectCheck.ActivityResultBytes, "AssessCredit", bytes(assess.result)],
    [StartCapacityEffectCheck.ActivityRequestBytes, "NotifyApplicant", bytes(notify.request)],
  ] as const;
  for (const [check, elementId, reservation] of expected) {
    const over = assessStartCapacityEnvelope(start, program, production, { ...effectProduction, [check]: reservation - 1 });
    assert.deepEqual(over, { kind: StartCapacityEnvelopeResultKind.EffectTaskExceeded,
      failure: { budget: check, elementId, configuredBound: reservation - 1, estimatedValue: reservation } });
    assert.match(startCapacityEffectEvidence(over.failure), new RegExp(`${elementId}.*${reservation}.*${check}`, "u"));
    assert.equal(assessStartCapacityEnvelope(start, program, production, { ...effectProduction, [check]: reservation }).kind,
      StartCapacityEnvelopeResultKind.WithinCapacity, check);
  }
  for (const check of [StartCapacityEffectCheck.BindingIdentityBytes, StartCapacityEffectCheck.PatchIdentityBytes]) {
    const over = assessStartCapacityEnvelope(start, program, production, { ...effectProduction, [check]: 1 });
    assert.ok(over.kind === StartCapacityEnvelopeResultKind.EffectTaskExceeded, check);
    assert.deepEqual([over.failure.budget, over.failure.elementId], [check, "AssessCredit"]);
  }
});

test("a task whose reserved result cannot fit the Activity result budget makes the Program unsupported", async () => {
  // Three reserved outputs fit one Activity result, but their copies already overflow committed state: the
  // aggregate budgets keep applying after every per-task check passes.
  const aggregate = assessStartCapacityEnvelope(creditStart("Credit_1", "a"),
    await creditDecisionProgram(withExtraAssessOutputs(2)));
  assert.ok(aggregate.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(aggregate.failure.budget, WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
  const unsupported = await creditDecisionProgram(withExtraAssessOutputs(3));
  const result = assessStartCapacityEnvelope(creditStart("Credit_1", "a"), unsupported);
  assert.ok(result.kind === StartCapacityEnvelopeResultKind.EffectTaskExceeded);
  assert.equal(result.failure.budget, StartCapacityEffectCheck.ActivityResultBytes);
  assert.equal(result.failure.elementId, "AssessCredit");
  assert.equal(result.failure.configuredBound, effectProduction[StartCapacityEffectCheck.ActivityResultBytes]);
});

test("the journey follows a longer serial chain to completion, one batch per task", async () => {
  const program = await creditDecisionProgram(withFollowUpNotifications(6));
  const { steps } = runStartCapacityJourney(creditStart("Credit_1"), program);
  assert.equal(steps.length, 1 + 2 + 6);
  assert.deepEqual(steps.slice(3).map(({ effect }) => effect?.result),
    Array.from({ length: 6 }, () => ({ kind: EffectExecutionResultKind.Success, localPatch: [] })));
  assert.equal(assessStartCapacityEnvelope(creditStart("Credit_1"), program).kind, StartCapacityEnvelopeResultKind.WithinCapacity);
});

test("rejects injected per-task limits that are not positive safe integers or that exceed production", async () => {
  const program = await creditDecisionProgram();
  const start = creditStart("Credit_1");
  for (const check of startCapacityEffectChecks) {
    assert.throws(() => assessStartCapacityEnvelope(start, program, production, { ...effectProduction, [check]: 0 }), TypeError);
    assert.throws(() => assessStartCapacityEnvelope(start, program, production,
      { ...effectProduction, [check]: effectProduction[check] + 1 }), RangeError);
  }
});
