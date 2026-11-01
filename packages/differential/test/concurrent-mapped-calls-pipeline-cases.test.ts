/**
 * Locks the registered supplier onboarding and travel request schedules against the concurrent mapped Calls proposal's
 * separating witnesses without Lean or Temporal: the open work after every command, the Process variables each return
 * and Sub-Process output publishes (CMCALL-OWN-01, CMCALL-OUT-01, CMCALL-ISOLATE-01), the refused called-task patches and
 * addresses (CMCALL-TASK-01, CMCALL-REFUSE-01), the single Start batch (CMCALL-PREPARE-01, CMCALL-START-01), and every
 * named seeded mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's separating-witness table, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { concurrentMappedCallsMutations, concurrentMappedCallsPipelineCases } from "./concurrent-mapped-calls-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "concurrent-mapped-calls-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const acme = bind("supplierName", "Acme");
const financialVerdict = bind("financialVerdict", "solvent");
const complianceVerdict = bind("complianceVerdict", "clear");

type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[]; rejected?: true }>;

const bothExpertsOpen: readonly Step[] = [
  { open: ["PrepareComplianceFile#1", "PrepareFinancialFile#1"], variables: [acme] },
  // The financial review prepares first, so its expert's task takes activation 1.
  { open: ["GiveExpertOpinion#1", "PrepareComplianceFile#1"], variables: [acme] },
  { open: ["GiveExpertOpinion#1", "GiveExpertOpinion#2"], variables: [acme] },
];
const refused = (step: Step): Step => ({ ...step, rejected: true });

/** One step per stimulus; a refused step repeats its predecessor's observations. */
const journeys = new Map<string, readonly Step[]>([
  ["supplier-compliance-first", [
    ...bothExpertsOpen,
    refused(bothExpertsOpen[2]!), refused(bothExpertsOpen[2]!), refused(bothExpertsOpen[2]!),
    // The compliance return lands in the compliance review's `verdict`, which its output publishes.
    { open: ["GiveExpertOpinion#1"], variables: [complianceVerdict, acme] },
    refused({ open: ["GiveExpertOpinion#1"], variables: [complianceVerdict, acme] }),
    { open: ["ApproveSupplier#1"], variables: [complianceVerdict, financialVerdict, acme] },
    { open: [], variables: [complianceVerdict, financialVerdict, acme] },
  ]],
  ["supplier-financial-first", [
    ...bothExpertsOpen,
    // The financial expert's revised `dossier` stays in its own called frame; only the published verdict reaches the Process.
    { open: ["GiveExpertOpinion#2"], variables: [financialVerdict, acme] },
    refused({ open: ["GiveExpertOpinion#2"], variables: [financialVerdict, acme] }),
    { open: ["ApproveSupplier#1"], variables: [complianceVerdict, financialVerdict, acme] },
    { open: [], variables: [complianceVerdict, financialVerdict, acme] },
  ]],
  ["travel-request", [
    // One Start batch invokes both checks and enters Booking; the absent traveller is a present null in the called frames.
    { open: ["BookTravel#1", "CheckBudget#1", "CheckVisa#1"], variables: [bind("approvedBudget", "1200")] },
    { open: ["BookTravel#1", "CheckVisa#1"], variables: [bind("approvedBudget", "1100")] },
    { open: ["BookTravel#1"], variables: [bind("approvedBudget", "1100"), bind("visaStatus", "granted")] },
    { open: [], variables: [bind("approvedBudget", "1100"), bind("visaStatus", "granted")] },
  ]],
]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the three schedules over the two retained models, standards-only and host-admitted", async () => {
  assert.deepEqual(concurrentMappedCallsPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(concurrentMappedCallsPipelineCases)) {
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

test("each journey exposes the open work, the command outcomes and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentMappedCallsPipelineCases)) {
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
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("each named seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  const contexts = await loadAndCompileCases(concurrentMappedCallsPipelineCases);
  assert.deepEqual([...new Set(Object.values(concurrentMappedCallsMutations).map(({ rule }) => rule))].sort(),
    ["CMCALL-OUT-01", "CMCALL-OWN-01", "CMCALL-PREPARE-01", "CMCALL-REFUSE-01", "CMCALL-TASK-01"]);
  for (const [name, mutation] of Object.entries(concurrentMappedCallsMutations)) {
    const { scenario, semanticProcess: program } = contexts.find(({ scenario: { id } }) => id === `${prefix}${mutation.scenario}`)!;
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    mutation.inject(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, name);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, mutation.expected, name);
    assert.throws(() => mutation.inject(mutated), /calibration requires/u, name);
  }
});

test("each registered case carries exactly one named mutation of its own journey", async () => {
  for (const { pipelineCase, scenario } of await loadAndCompileCases(concurrentMappedCallsPipelineCases)) {
    const carried = Object.values(concurrentMappedCallsMutations).filter(({ scenario: target, inject, expected }) =>
      scenario.id === `${prefix}${target}` && inject === pipelineCase.injectMutation &&
      expected === pipelineCase.expectedInjectedDisagreement);
    assert.equal(carried.length, 1, scenario.id);
  }
});
