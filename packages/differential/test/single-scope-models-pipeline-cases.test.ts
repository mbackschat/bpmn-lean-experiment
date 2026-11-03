/**
 * Locks the registered single-scope schedules against the proposal's separating witnesses without Lean or Temporal: the
 * open work and Process variables after every command, each model's route with its one scope, and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
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
import { singleScopeModelsPipelineCases } from "./single-scope-models-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "single-scope-models-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const request = bind("request", "PR-17");
// *Check budget* copies its result's `code` out as `budgetCode`.
const budget = bind("budgetCode", "BC-9");
const invoice = bind("invoice", "INV-204");
// *Validate invoice* copies its result's `result` out as `verdict`.
const verdict = (value: string) => bind("verdict", value);

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// The root fork opens *Check budget* and, past the Manual *Collect signature*, *Approve purchase*.
const forked: readonly Step[] = [
  { open: ["ReviewRequest#1"], variables: [request] },
  { open: ["ApprovePurchase#1", "CheckBudget#1"], variables: [request] },
];

// *Log budget check*, the join and *Purchase approved* pass in the closure of the later branch completion.
const ordered: readonly Step[] = [
  { open: ["PlaceOrder#1"], variables: [budget, request] },
  { open: [], variables: [budget, request] },
];

const firstReview: readonly Step[] = [
  { open: ["ReviewInvoice#1"], variables: [invoice] },
  { open: ["ValidateInvoice#1"], variables: [invoice] },
];

const journeys = new Map<string, readonly Step[]>([
  ["purchase-approval-first", [...forked, { open: ["CheckBudget#1"], variables: [request] }, ...ordered]],
  ["purchase-budget-first", [...forked, { open: ["ApprovePurchase#1"], variables: [budget, request] }, ...ordered]],
  // The default flow throws *Invoice cleared* before *Pay invoice*.
  ["invoice-valid", [...firstReview,
    { open: ["PayInvoice#1"], variables: [invoice, verdict("valid")] },
    { open: [], variables: [invoice, verdict("valid")] }]],
  // An invalid verdict passes *Contact supplier* and re-enters the Merge with fresh occurrences.
  ["invoice-corrected", [...firstReview,
    { open: ["ReviewInvoice#2"], variables: [invoice, verdict("invalid")] },
    { open: ["ValidateInvoice#2"], variables: [invoice, verdict("invalid")] },
    { open: ["PayInvoice#1"], variables: [invoice, verdict("valid")] },
    { open: [], variables: [invoice, verdict("valid")] }]],
]);

test("registers exactly the four schedules, standards-only, with one scope on each model's route and host-admitted", async () => {
  assert.deepEqual(singleScopeModelsPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(singleScopeModelsPipelineCases)) {
    const purchase = context.scenario.id.startsWith(`${prefix}purchase-`);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.semanticProcess.definitionScopes.length, 1, context.scenario.id);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), purchase, context.scenario.id);
    assert.equal(scopeReentryProgram(context.semanticProcess), !purchase, context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(singleScopeModelsPipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(singleScopeModelsPipelineCases)) {
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, scenario.id);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    assert.throws(() => pipelineCase.injectMutation(mutated), /calibration requires/u, scenario.id);
  }
});
