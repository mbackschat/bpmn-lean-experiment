/**
 * Locks the registered claim rework and contract revision schedules against the scope re-entry specification's separating
 * witnesses without Lean or Temporal: the open work and its activation ordinals after every command (SRE-FRESH-01),
 * the Process variables each iteration's outputs leave (SRE-RETAIN-01, SRE-OUTPUT-01), the fresh frame's effect
 * argument (SRE-INIT-01), the refused stale completions (SRE-STALE-01), the second called instance, and every named
 * seeded mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, runScenario, scopeReentryProgram, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { scopeReentryPipelineCases } from "./scope-reentry-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "scope-reentry-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const firstReview = "call:10:Instance_1:11:LegalReview:1";
const secondReview = "call:10:Instance_1:11:LegalReview:2";

type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[]; rejected?: true;
  reviewInstance?: string }>;

const summary = [bind("claimSummary", "hail damage")];
const reworked = [bind("assessment", "rework"), ...summary, bind("repairQuote", "1200")];
const claimOpening: readonly Step[] = [
  { open: ["InspectDamage#1"], variables: summary },
  { open: ["PriceRepair#1"], variables: summary },
  // Iteration 1's outputs stay at the Process while iteration 2 opens with fresh ordinals.
  { open: ["InspectDamage#2"], variables: reworked },
];
const contractOpening: readonly Step[] = [
  { open: ["EditDraft#1"], variables: [bind("contractText", "v1")] },
  { open: ["ReviewClauses#1"], variables: [bind("contractText", "v2")], reviewInstance: firstReview },
  { open: ["EditDraft#2"], variables: [bind("contractText", "v2"), bind("legalVerdict", "revise")] },
  { open: ["ReviewClauses#2"], variables: [bind("contractText", "v3"), bind("legalVerdict", "revise")],
    reviewInstance: secondReview },
];

/** One step per stimulus; a refused step repeats its predecessor's observations. */
const journeys = new Map<string, readonly Step[]>([
  ["claim-rework-then-approve", [
    ...claimOpening,
    { open: ["InspectDamage#2"], variables: reworked, rejected: true },
    { open: ["PriceRepair#2"], variables: reworked },
    { open: ["ApproveSettlement#1"], variables: [bind("assessment", "approve"), ...summary, bind("repairQuote", "800")] },
    { open: [], variables: [bind("assessment", "approve"), ...summary, bind("repairQuote", "800")] },
  ]],
  ["claim-rework-then-reject", [
    ...claimOpening,
    { open: ["PriceRepair#2"], variables: reworked },
    { open: ["NotifyClaimant#1"], variables: [bind("assessment", "reject"), ...summary, bind("repairQuote", "0")] },
    { open: [], variables: [bind("assessment", "reject"), ...summary, bind("repairQuote", "0")] },
  ]],
  ["contract-revise-then-sign", [
    ...contractOpening,
    { open: ["ReviewClauses#2"], variables: [bind("contractText", "v3"), bind("legalVerdict", "revise")], rejected: true,
      reviewInstance: secondReview },
    { open: ["SignContract#1"], variables: [bind("contractText", "v3"), bind("legalVerdict", "sign")] },
    { open: ["FileContract#1"], variables: [bind("contractText", "v3"), bind("legalVerdict", "sign")] },
    { open: [], variables: [bind("contractText", "v3"), bind("legalVerdict", "sign")] },
  ]],
  ["contract-revise-then-withdraw", [
    ...contractOpening,
    { open: ["CloseNegotiation#1"], variables: [bind("contractText", "v3"), bind("legalVerdict", "withdraw")] },
    { open: [], variables: [bind("contractText", "v3"), bind("legalVerdict", "withdraw")] },
  ]],
]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the four schedules over the two retained models, standards-only, re-entering and host-admitted",
  async () => {
    assert.deepEqual(scopeReentryPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
    for (const context of await loadAndCompileCases(scopeReentryPipelineCases)) {
      assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
      assert.equal(context.pipelineCase.cib, null);
      assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
      assert.equal(scopeReentryProgram(context.semanticProcess), true, context.scenario.id);
      assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
      assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
      const start = context.scenario.stimuli[0];
      assert.ok(start?.kind === StimulusKind.StartProcess);
      assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
    }
  });

test("each journey exposes the open work, the command outcomes and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(scopeReentryPipelineCases)) {
    const steps = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * steps.length, `${scenario.id} ends at the completed state`);
    steps.forEach((step, position) => {
      const index = 2 + 2 * position;
      const label = `${scenario.id} trace[${index}]`;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `${label} follows a command`);
      assert.equal(command.outcome, step.rejected ? CommandOutcome.Rejected : CommandOutcome.Committed, label);
      const state = stateAt(result.trace, index);
      if (step.rejected) assert.deepEqual(state, stateAt(result.trace, index - 2), `${label} a refusal moves nothing`);
      assert.deepEqual(openWork(state), step.open, label);
      assert.deepEqual(state.variables, step.variables, label);
      if (step.reviewInstance !== undefined) {
        assert.equal(state.openUserTasks[0]?.id.processInstanceId, step.reviewInstance, label);
      }
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("each Price repair occurrence snapshots its own frame's notes, iteration 2 starting again from the summary", async () => {
  const [context] = await loadAndCompileCases(scopeReentryPipelineCases.filter(({ id }) =>
    id === `${prefix}claim-rework-then-approve`));
  const trace = runScenario(context!.scenario, context!.semanticProcess).trace;
  assert.deepEqual([4, 10].map(index => stateAt(trace, index).openEffects.map(({ arguments: values }) => values)),
    [[[bind("damage", "photos missing")]], [[bind("damage", "hail damage")]]]);
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(scopeReentryPipelineCases)) {
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
