/**
 * Settles the effect-data capacity envelope of `PBV-EFF-05` against the real Workflow encoders.
 *
 * The oracle is the encoders themselves: the credit decision, its Start applicant at the 1,024-byte String bound and
 * every Service Task result at the full allowance are driven through the same candidate preflight, publication,
 * successor, Query, terminal, recovery and retention owners as the handoff, and every measured budget must stay
 * within the envelope's estimate and the production limit. The completing stimuli are built here from the model's
 * element IDs, not taken from the envelope's journey, and a longer chain checks that per-batch allowances grow with
 * the batch count rather than only fitting the three-batch journey they were sized on.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EffectExecutionResultKind, isSingletonBusinessItem } from "@bpmn-lean/semantic-core";
import type { BusinessValue, SemanticProcessProgram, StartProcessStimulus, Stimulus } from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  completeEffectStimulus,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  runStartCapacityJourney,
  startCapacityEnvelopeBudgets,
} from "@bpmn-lean/temporal-protocol";
import type { StartCapacityEstimates } from "@bpmn-lean/temporal-protocol";

import {
  creditDecisionProgram,
  creditStart,
  withFollowUpNotifications,
} from "../../protocol/test/effect-data-capacity-fixture.ts";
import {
  escapeHeavyAllowanceValue,
  measureWithWorkflowEncoders,
  nodeHeavyValue,
} from "./start-capacity-encoder-measurement.ts";
import type { MeasuredStartCapacity } from "./start-capacity-encoder-measurement.ts";

const production = productionStartCapacityEnvelopeLimits();

/** Assess returns the assessment, Notify the receipt, and each follow-up nothing, as conforming handlers must. */
function creditCompletions(start: StartProcessStimulus, followUps: number, output: BusinessValue = fullAllowanceValue()): Stimulus[] {
  const complete = (elementId: string, localPatch: ReadonlyArray<{ name: string; value: BusinessValue }>) =>
    completeEffectStimulus({ processInstanceId: start.instanceId, elementId, activation: 1 },
      { kind: EffectExecutionResultKind.Success, localPatch: [...localPatch] });
  return [
    complete("AssessCredit", [{ name: "assessment", value: output }]),
    complete("NotifyApplicant", [{ name: "receipt", value: output }]),
    ...Array.from({ length: followUps }, (_, index) => complete(`FollowUp${index}`, [])),
  ];
}

function assertWithinEstimates(actual: MeasuredStartCapacity, estimates: StartCapacityEstimates, label: string): void {
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(actual[budget] > 0, `${label}, ${budget} was exercised`);
    assert.ok(actual[budget] <= estimates[budget], `${label}, ${budget}: actual ${actual[budget]} exceeds estimate ${estimates[budget]}`);
    assert.ok(actual[budget] <= production[budget], `${label}, ${budget}: actual ${actual[budget]} exceeds production`);
  }
}

function admitted(start: StartProcessStimulus, program: SemanticProcessProgram): StartCapacityEstimates {
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
  return envelope.estimates;
}

test("the envelope's journey submits exactly the completions an independent drive of the model uses", async () => {
  const start = creditStart("Credit_1");
  const { steps } = runStartCapacityJourney(start, await creditDecisionProgram(withFollowUpNotifications(2)));
  assert.deepEqual(steps.map(({ stimulus }) => stimulus), [start, ...creditCompletions(start, 2)]);
});

for (const [label, instanceId, startCommandId] of [
  ["short identifiers", "Credit_1", "start-credit"],
  ["long instance ID", "I".repeat(512), "start-credit"],
  ["long Start command ID", "Credit_1", "S".repeat(2_048)],
] as const) {
  test(`the envelope bounds every Workflow encoder for the maximal credit decision, ${label}`, async (context) => {
    const program = await creditDecisionProgram();
    const start = creditStart(instanceId, undefined, startCommandId);
    const estimates = admitted(start, program);
    const actual = measureWithWorkflowEncoders(program, start, creditCompletions(start, 0));
    for (const budget of startCapacityEnvelopeBudgets) {
      context.diagnostic(`${budget}: actual ${actual[budget]}, estimate ${estimates[budget]}, limit ${production[budget]}`);
    }
    assertWithinEstimates(actual, estimates, label);
  });
}

test("results of other shapes within the allowance stay inside the envelope reserved by the sentinel", async () => {
  const program = await creditDecisionProgram();
  const start = creditStart("Credit_1");
  const estimates = admitted(start, program);
  for (const output of [escapeHeavyAllowanceValue("\""), escapeHeavyAllowanceValue("\u0001"), nodeHeavyValue()]) {
    assert.ok(isSingletonBusinessItem(output));
    assertWithinEstimates(measureWithWorkflowEncoders(program, start, creditCompletions(start, 0, output)), estimates, "shape");
  }
});

/**
 * Allowances sized on three batches can hide a per-batch copy behind `fixedBytes`, so one more Service Task must add
 * at least as many bytes to every estimate as to its encoder, at a short and a long instance ID. Both chains already
 * end in identical follow-ups, so a budget that takes its largest batch compares copy counts, not a changed maximum.
 */
test("every estimate grows at least as fast as its encoder when the chain gains a task", async () => {
  for (const instanceId of ["Credit_1", "I".repeat(512)]) {
    const measure = async (followUps: number) => {
      const program = await creditDecisionProgram(withFollowUpNotifications(followUps));
      const start = creditStart(instanceId);
      const estimates = admitted(start, program);
      const actual = measureWithWorkflowEncoders(program, start, creditCompletions(start, followUps));
      assertWithinEstimates(actual, estimates, `${followUps} follow-ups`);
      return { estimates, actual };
    };
    for (const followUps of [6, 8]) {
      const shorter = await measure(followUps);
      const longer = await measure(followUps + 1);
      for (const budget of startCapacityEnvelopeBudgets) {
        const actualGrowth = longer.actual[budget] - shorter.actual[budget];
        const estimateGrowth = longer.estimates[budget] - shorter.estimates[budget];
        assert.ok(actualGrowth <= estimateGrowth,
          `${instanceId.length}-byte instance ID, ${followUps} follow-ups, ${budget}: encoder grows ${actualGrowth}, estimate ${estimateGrowth}`);
      }
    }
  }
});
