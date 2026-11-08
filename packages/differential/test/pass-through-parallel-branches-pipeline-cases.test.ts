/**
 * Locks the registered pass-through branch schedules against the specification's separating witnesses without Lean or
 * Temporal: the open work and Process variables after every command, the concurrent route, and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the specification's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, concurrentStructuredScopeDataProgram, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { passThroughParallelBranchesPipelineCases } from "./pass-through-parallel-branches-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "pass-through-parallel-branches-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const employee = bind("employee", "Ada");
// *Pack workplace* declares `boxes` from `employee` and copies it out as `packedBoxes`.
const packed = bind("packedBoxes", "Ada");
const booked = bind("moversBooking", "MV-7");
const invoice = bind("invoice", "INV-1");
const verdict = bind("reviewVerdict", "pending");

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

const approval: readonly Step[] = [
  { open: ["ApproveRelocation#1"], variables: [employee] },
  // PTPB-COMMUTE-01: the fork closure commits the entry beside *Hand over keys* and *Notify facilities*.
  { open: ["BookMovers#1", "PackBoxes#1"], variables: [employee] },
];

const journeys = new Map<string, readonly Step[]>([
  ["relocation-packing-first", [...approval,
    { open: ["BookMovers#1"], variables: [employee, packed] },
    { open: [], variables: [employee, booked, packed] }]],
  ["relocation-movers-first", [...approval,
    { open: ["PackBoxes#1"], variables: [employee, booked] },
    { open: [], variables: [employee, booked, packed] }]],
  // PTPB-WORK-01: the body's fork of two pass-through Tasks joins inside *Check invoice*'s closure.
  ["invoice-settled", [
    { open: ["CheckInvoice#1"], variables: [invoice] },
    { open: ["PayInvoice#1"], variables: [invoice, verdict] },
    { open: [], variables: [invoice, bind("paymentReference", "PAY-3"), verdict] }]],
]);

test("registers exactly the three schedules, standards-only, concurrent and host-admitted", async () => {
  assert.deepEqual(passThroughParallelBranchesPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(passThroughParallelBranchesPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), true, context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the specification derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(passThroughParallelBranchesPipelineCases)) {
    const steps = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * steps.length, `${scenario.id} ends at the completed state`);
    steps.forEach((step, position) => {
      const index = 2 + 2 * position;
      const label = `${scenario.id} trace[${index}]`;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `${label} follows a command`);
      assert.equal(command.outcome, CommandOutcome.Committed, label);
      const state = result.trace[index];
      assert.ok(state?.kind === CanonicalObservationKind.State, `${label} must be a state`);
      assert.deepEqual(openWork(state), step.open, label);
      assert.deepEqual(state.variables, step.variables, label);
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(passThroughParallelBranchesPipelineCases)) {
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.KernelTs, result },
      [{ target: DifferentialTarget.KernelTs, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, scenario.id);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    assert.throws(() => pipelineCase.injectMutation(mutated), /calibration requires/u, scenario.id);
  }
});
