/**
 * Locks the registered credit-decision schedules against the effect-data amendment's decisive witnesses without Lean or
 * Temporal: a structured assessment with repeated equal checks, a negative scale-two Decimal, a nested Map, a Boolean
 * and a present Null reaches the Notify snapshot and Process data whole, and a present-Null assessment with an empty-Map
 * receipt keeps Null, absence and the empty Map apart.
 *
 * Expected values are rebuilt here from the capsule's definition of the assessment, never read from a produced trace,
 * and every named seeded mutation must move a compared observation.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind, runScenario,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { effectDataPipelineCases } from "./effect-data-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { domainCases } from "./scenario-value-domain-cases.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
const check = (code: string) => map(["code", text(code)]);
const assessment = map(
  ["amount", { kind: VariableValueKind.Decimal, coefficient: "-123455", scale: 2 }],
  ["approved", { kind: VariableValueKind.Boolean, value: true }],
  ["checks", { kind: VariableValueKind.List, value: [check("ID"), check("ID"), check("INCOME")] }],
  ["contact", map(["city", text("Berlin")], ["line2", nothing])],
  ["note", nothing],
);
const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });

/** Per scenario: the applicant, what Assess returned and what Notify returned. */
const journeys = new Map<string, readonly [string, BusinessValue, BusinessValue]>([
  ["effect-data-credit-assessed", ["A-17", assessment, text("sent")]],
  ["effect-data-credit-null", ["A-18", nothing, map()]],
]);

test("registers exactly the two decisive schedules over one retained model", async () => {
  assert.deepEqual(effectDataPipelineCases.map(({ id }) => id), [...journeys.keys()]);
  const bytes = await readFile(new URL("../../../scenarios/portable-business-effect-data/credit-decision.bpmn", import.meta.url));
  for (const context of await loadAndCompileCases(effectDataPipelineCases)) {
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(context.scenario.profile, SemanticProfileId.PortableBusinessEffectData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("the assessment reaches the Notify snapshot whole and every Process value survives to completion", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(effectDataPipelineCases)) {
    const [applicant, assessed, receipt] = journeys.get(scenario.id)!;
    const states = runScenario(scenario, program).trace.filter((observation) => observation.kind === CanonicalObservationKind.State);
    const notify = states.find((state) => state.openEffects[0]?.id.elementId === "NotifyApplicant");
    assert.deepEqual(notify?.openEffects[0]?.arguments, [bind("assessment", assessed)], scenario.id);
    assert.deepEqual(notify?.variables, [bind("applicantRef", text(applicant)), bind("assessment", assessed)], scenario.id);
    const final = states.at(-1);
    assert.equal(final?.status, ProcessStatus.Completed, scenario.id);
    assert.deepEqual(final?.variables,
      [bind("applicantRef", text(applicant)), bind("assessment", assessed), bind("receipt", receipt)], scenario.id);
    assert.deepEqual(final?.openEffects, [], "the retired locals are not published");
  }
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(effectDataPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(effectDataPipelineCases)) {
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

test("the cross-target value matrix expects the effect-data domain from the retained schedules", async () => {
  const cases = (await domainCases()).filter(({ context }) => context.scenario.profile === SemanticProfileId.PortableBusinessEffectData);
  assert.ok(cases.length > 10, "the profile must contribute its own matrix cases");
  for (const input of cases) {
    assert.equal(supportsSemanticProcessScenario(input.scenario, input.context.semanticProcess), input.supported, input.scenario.id);
  }
  const supportedByLabel = new Map(cases.map(({ scenario, supported }) => [scenario.id.replace(/^effect-data-credit-assessed-/u, ""), supported]));
  for (const [label, supported] of [["start-string-exact-bound", true], ["start-string-over-bound", false],
    ["effect-string-exact-bound", true], ["effect-string-over-bound", false]] as const) {
    assert.equal(supportedByLabel.get(label), supported, label);
  }
});
