/**
 * Locks the registered None Throw schedules against the specification's separating witnesses without Lean or Temporal: the
 * open work and Process variables after every command, each model's route, and every named seeded mutation, each of
 * which must move exactly the observation it names.
 *
 * Expected values are written here from the specification's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, concurrentStructuredScopeDataProgram, runScenario, scopeReentryProgram,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { noneIntermediateThrowPipelineCases } from "./none-intermediate-throw-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "none-intermediate-throw-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const device = bind("device", "DEV-7");
const employee = bind("employee", "EMP-4");
// *Set up account* declares `account` from `employee` and copies it out as `employeeAccount`.
const account = bind("employeeAccount", "EMP-4");
const laptop = bind("laptopOrder", "LAP-1");

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// NIT-PASS-01: *Fault diagnosed* and *Repair started* pass in *Diagnose fault*'s closure, so *Replace part* is open.
const firstRound: readonly Step[] = [
  { open: ["DiagnoseFault#1"], variables: [device] },
  { open: ["ReplacePart#1"], variables: [device] },
  { open: ["OrderSparePart#1"], variables: [device] },
  { open: ["TestDevice#1"], variables: [device] },
];

// The fork opens *Create account* in the declared body beside *Order laptop* behind *Welcome sent*.
const forked: readonly Step[] = [
  { open: ["ConfirmStartDate#1"], variables: [employee] },
  { open: ["CreateAccount#1", "OrderLaptop#1"], variables: [employee] },
];

const journeys = new Map<string, readonly Step[]>([
  ["warranty-passed", [...firstRound, { open: [], variables: [device, bind("testResult", "passed")] }]],
  // The rework closure throws *Rework requested* and re-enters *Repair device* with a fresh *Repair started*.
  ["warranty-rework", [...firstRound,
    { open: ["ReplacePart#2"], variables: [device, bind("testResult", "failed")] },
    { open: ["OrderSparePart#2"], variables: [device, bind("testResult", "failed")] },
    { open: ["TestDevice#2"], variables: [device, bind("testResult", "failed")] },
    { open: [], variables: [device, bind("testResult", "passed")] }]],
  ["onboarding-account-first", [...forked,
    { open: ["OrderLaptop#1"], variables: [employee, account] },
    { open: [], variables: [employee, account, laptop] }]],
  ["onboarding-laptop-first", [...forked,
    { open: ["CreateAccount#1"], variables: [employee, laptop] },
    { open: [], variables: [employee, account, laptop] }]],
]);

test("registers exactly the four schedules, standards-only, on each model's route and host-admitted", async () => {
  assert.deepEqual(noneIntermediateThrowPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(noneIntermediateThrowPipelineCases)) {
    const warranty = context.scenario.id.startsWith(`${prefix}warranty-`);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(scopeReentryProgram(context.semanticProcess), warranty, context.scenario.id);
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), !warranty, context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the specification derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(noneIntermediateThrowPipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(noneIntermediateThrowPipelineCases)) {
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
