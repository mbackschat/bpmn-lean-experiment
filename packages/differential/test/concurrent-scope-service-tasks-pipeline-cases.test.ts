/**
 * Locks the registered supplier and claim intake schedules against the concurrent scope Service Tasks capsule's
 * separating witnesses without Lean or Temporal: the open User Tasks and effects, named by element and activation, and
 * Process status after every command (CSE-QUIESCE-01, CSE-ISOLATE-01), reversed orders that end in the same final
 * observation, and a seeded mutation per schedule that must move exactly the observation it names.
 *
 * Expected open sets are written here from the capsule's account of each journey, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { concurrentScopeServiceTasksPipelineCases, openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "concurrent-scope-effects-";

/** The open `Element#activation` names at trace index 2 + 2 * i, which follows the i-th command; the last set is empty. */
const journeys = new Map<string, ReadonlyArray<readonly string[]>>([
  ["supplier-review-first", [
    ["ReviewContract#1", "ScreenSanctions#1", "VerifyBankAccount#1"],
    ["ScreenSanctions#1", "VerifyBankAccount#1"],
    // The User Task and one effect have reached the join; it still waits for bank verification.
    ["VerifyBankAccount#1"],
    ["ApproveSupplier#1"],
    // Activate supplier is armed only after Onboard completes.
    ["ActivateSupplier#1"],
    [],
  ]],
  ["supplier-effects-first", [
    ["ReviewContract#1", "ScreenSanctions#1", "VerifyBankAccount#1"],
    ["ReviewContract#1", "ScreenSanctions#1"],
    ["ReviewContract#1"],
    ["ApproveSupplier#1"],
    ["ActivateSupplier#1"],
    [],
  ]],
  ["claim-price-two-first", [
    ["CollectPoliceReport#1", "FetchPolicy#1"],
    ["FetchPolicy#1", "PriceDamage#1"],
    // Both branches reached the merge, so two Assess occurrences hold Price damage at once.
    ["PriceDamage#1", "PriceDamage#2"],
    // Price damage 2 advances only the second occurrence, whose Confirm assessment is the element's first.
    ["ConfirmAssessment#1", "PriceDamage#1"],
    ["PriceDamage#1"],
    ["ConfirmAssessment#2"],
    ["SettleClaim#1"],
    [],
  ]],
  ["claim-fetch-first", [
    ["CollectPoliceReport#1", "FetchPolicy#1"],
    ["CollectPoliceReport#1", "PriceDamage#1"],
    ["PriceDamage#1", "PriceDamage#2"],
    ["ConfirmAssessment#1", "PriceDamage#2"],
    // The second Assess occurrence owns only its effect wait, so Intake and Settle claim wait for it.
    ["PriceDamage#2"],
    ["ConfirmAssessment#2"],
    ["SettleClaim#1"],
    [],
  ]],
]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the four schedules over the two retained models, standards-only and host-admitted", async () => {
  assert.deepEqual(concurrentScopeServiceTasksPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(concurrentScopeServiceTasksPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.EmbeddedSubProcessCompletion);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open User Tasks, open effects and Process status the capsule derives after every command", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentScopeServiceTasksPipelineCases)) {
    const journey = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * journey.length, `${scenario.id} ends at the completed state`);
    journey.forEach((names, position) => {
      const index = 2 + 2 * position;
      const state = stateAt(result.trace, index);
      assert.deepEqual(openWork(state), names, `${scenario.id} trace[${index}]`);
      assert.equal(state.status, position === journey.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running,
        `${scenario.id} trace[${index}]`);
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command && command.outcome === CommandOutcome.Committed,
        `${scenario.id} trace[${index - 1}] must be a committed command`);
    });
  }
});

test("reversed orders of each model end in the same final observation", async () => {
  const finals = new Map<string, CanonicalObservation[]>();
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(concurrentScopeServiceTasksPipelineCases)) {
    const trace = runScenario(scenario, program).trace;
    const final = trace.at(-1)!;
    finals.set(pipelineCase.bpmnRelativePath, [...finals.get(pipelineCase.bpmnRelativePath) ?? [], final]);
  }
  assert.equal(finals.size, 2);
  for (const [model, [first, second]] of finals) assert.deepEqual(second, first, model);
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(concurrentScopeServiceTasksPipelineCases)) {
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
