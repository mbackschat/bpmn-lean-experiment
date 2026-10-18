/**
 * Settles the nested scope-data capacity reservation against the real Workflow encoders.
 *
 * The oracle is the encoders themselves: the expense claim is driven through the candidate preflight, publication,
 * successor, Query, terminal, recovery and retention owners with a Review Claim completion filling the whole
 * `NSD-TASK-01` allowance under claim, under ticket, or carrying nothing, and every measured budget must stay within
 * the envelope's estimate and the production limit. The stimuli are built here from the model's element IDs, not
 * taken from the envelope's journeys. Record Claim copies both locals onward, so the ticket completion holds more
 * than the claim completion and a single reserved target would not bound it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EffectExecutionResultKind, StimulusKind, VariableValueKind, canonicalNamedValueArrayUtf8ByteLength,
  nestedScopePatchByteLimit } from "@bpmn-lean/semantic-core";
import type { BusinessValue, SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  WorkflowChainBudgetKind,
  assessStartCapacityEnvelope,
  completeEffectStimulus,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  startCapacityEnvelopeBudgets,
} from "@bpmn-lean/temporal-protocol";
import type { StartCapacityEstimates } from "@bpmn-lean/temporal-protocol";

import { claimStart, claimValue, nestedScopeProgram } from "../../protocol/test/nested-scope-data-capacity-fixture.ts";
import { escapeHeavyAllowanceValue, measureWithWorkflowEncoders } from "./start-capacity-encoder-measurement.ts";
import type { MeasuredStartCapacity } from "./start-capacity-encoder-measurement.ts";

const production = productionStartCapacityEnvelopeLimits();
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

/** A Map of 1,000-character Strings whose patch under `name` measures exactly the allowance. */
function fillingPatch(name: string): VariableBinding[] {
  const text = (length: number): BusinessValue => ({ kind: VariableValueKind.String, value: "p".repeat(length) });
  const value = (lengths: number[]): BusinessValue => ({ kind: VariableValueKind.Map,
    value: lengths.map((length, index) => ({ name: `k${String(index).padStart(2, "0")}`, value: text(length) })) });
  const lengths = Array.from({ length: 17 }, () => 1_000);
  for (let index = lengths.length - 1; index >= 0; index -= 1) {
    const excess = canonicalNamedValueArrayUtf8ByteLength([{ name, value: value(lengths) }]) - nestedScopePatchByteLimit;
    if (excess <= 0) break;
    lengths[index] = Math.max(0, lengths[index]! - excess);
  }
  const patch = [{ name, value: value(lengths) }];
  assert.equal(canonicalNamedValueArrayUtf8ByteLength(patch), nestedScopePatchByteLimit);
  return patch;
}

function claimCompletions(start: StartProcessStimulus, patch: VariableBinding[], result: BusinessValue = fullAllowanceValue()): Stimulus[] {
  const occurrence = (elementId: string) => ({ processInstanceId: start.instanceId, elementId, activation: 1 });
  return [
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(1), taskId: occurrence("ReviewClaim"), submittedValues: patch },
    completeEffectStimulus(occurrence("RecordClaim"),
      { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "recordRef", value: result }] }),
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

for (const [label, instanceId, startCommandId] of [
  ["short identifiers", "Claim_1", "start-claim"],
  ["long instance ID", "I".repeat(512), "start-claim"],
  ["long Start command ID", "Claim_1", "S".repeat(2_048)],
] as const) {
  test(`the envelope bounds every Workflow encoder for each admitted Review Claim target, ${label}`, async (context) => {
    const program = await nestedScopeProgram("expense-claim");
    const start = claimStart(program, instanceId, claimValue(1), startCommandId);
    const estimates = admitted(start, program);
    for (const [target, patch] of [["claim", fillingPatch("claim")], ["ticket", fillingPatch("ticket")], ["empty", []]] as const) {
      const actual = measureWithWorkflowEncoders(program, start, claimCompletions(start, [...patch]));
      for (const budget of startCapacityEnvelopeBudgets) {
        context.diagnostic(`${target} ${budget}: actual ${actual[budget]}, estimate ${estimates[budget]}`);
      }
      assertWithinEstimates(actual, estimates, `${label}, ${target}`);
    }
  });
}

test("the ticket completion holds more committed state than the claim completion", async () => {
  const program = await nestedScopeProgram("expense-claim");
  const start = claimStart(program, "Claim_1", claimValue(1));
  const committed = (patch: VariableBinding[]) =>
    measureWithWorkflowEncoders(program, start, claimCompletions(start, patch))[WorkflowChainBudgetKind.CommittedRuntimeStateBytes];
  assert.ok(committed(fillingPatch("ticket")) > committed(fillingPatch("claim")));
});

test("an effect result of another shape within the allowance stays inside the reserved envelope", async () => {
  const program = await nestedScopeProgram("expense-claim");
  const start = claimStart(program, "Claim_1", claimValue(1));
  const estimates = admitted(start, program);
  for (const result of [escapeHeavyAllowanceValue("\""), escapeHeavyAllowanceValue("\u0001")]) {
    assertWithinEstimates(measureWithWorkflowEncoders(program, start, claimCompletions(start, fillingPatch("ticket"), result)),
      estimates, "shape");
  }
});
