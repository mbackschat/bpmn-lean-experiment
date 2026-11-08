/**
 * Locks the registered Link schedules without Lean or Temporal. The oracle is each schedule's explicit-flow twin among
 * the registered None Throw cases: a Link journey's observation trace must equal the twin journey's exactly, so every
 * open-work and variable expectation the twin's own test derives holds here too, and each seeded mutation must move
 * exactly the observation it names.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CommandOutcome, ScenarioOutcomeKind, SemanticProfileId, StimulusKind, runScenario,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { linkEventsPipelineCases } from "./link-events-pipeline-cases.ts";
import { noneIntermediateThrowPipelineCases } from "./none-intermediate-throw-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const names = ["warranty-passed", "warranty-rework", "onboarding-account-first", "onboarding-laptop-first"];

test("registers exactly the four schedules, standards-only and host-admitted", async () => {
  assert.deepEqual(linkEventsPipelineCases.map(({ id }) => id), names.map(name => `link-events-${name}`));
  for (const context of await loadAndCompileCases(linkEventsPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each Link journey's observation trace equals its explicit-flow twin's", async () => {
  const twins = new Map((await loadAndCompileCases(noneIntermediateThrowPipelineCases))
    .map(context => [context.scenario.id.replace("none-intermediate-throw-", ""), context] as const));
  for (const { scenario, semanticProcess } of await loadAndCompileCases(linkEventsPipelineCases)) {
    const twin = twins.get(scenario.id.replace("link-events-", ""))!;
    const result = runScenario(scenario, semanticProcess);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.deepEqual(result, runScenario(twin.scenario, twin.semanticProcess), scenario.id);
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess } of await loadAndCompileCases(linkEventsPipelineCases)) {
    const result = runScenario(scenario, semanticProcess);
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
