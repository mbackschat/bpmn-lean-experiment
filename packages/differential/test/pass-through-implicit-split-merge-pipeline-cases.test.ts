/**
 * Locks the registered implicit split and merge schedules against the proposal's separating witnesses without Lean or
 * Temporal: the open work and Process variables after every command, each model's route, and every named seeded
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
import { passThroughImplicitSplitMergePipelineCases } from "./pass-through-implicit-split-merge-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "pass-through-implicit-split-merge-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const claim = bind("claim", "CLM-7: water damage, EUR 1,800");
const order = bind("order", "ORD-31: two survey drones, 3 days");
const reserved = [order, bind("reservation", "RES-31")];

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// PTSM-MERGE-01: the taken branch's User Task passes *Archive claim file* once and completes the Process.
const decided = (decision: string, task: string): readonly Step[] => [
  { open: ["AssessClaim#1"], variables: [claim] },
  { open: [`${task}#1`], variables: [claim, bind("decision", decision)] },
  { open: [], variables: [claim, bind("decision", decision)] },
];

// PTSM-SPLIT-01: the reservation's closure passes *Print dispatch note* once and opens both User Tasks.
const reservedAndSplit: readonly Step[] = [
  { open: ["ReserveEquipment#1"], variables: [order] },
  { open: ["BookCourier#1", "PackEquipment#1"], variables: reserved },
];

const journeys = new Map<string, readonly Step[]>([
  ["claim-approved", decided("approve", "ApprovePayout")],
  ["claim-rejected", decided("reject", "WriteRejectionLetter")],
  ["dispatch-packed-first", [...reservedAndSplit, { open: ["BookCourier#1"], variables: reserved },
    { open: [], variables: reserved }]],
  ["dispatch-courier-first", [...reservedAndSplit, { open: ["PackEquipment#1"], variables: reserved },
    { open: [], variables: reserved }]],
]);

test("registers exactly the four schedules, standards-only, on each model's route and host-admitted", async () => {
  assert.deepEqual(passThroughImplicitSplitMergePipelineCases.map(({ id }) => id),
    [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(passThroughImplicitSplitMergePipelineCases)) {
    const claimModel = context.scenario.id.startsWith(`${prefix}claim-`);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(scopeReentryProgram(context.semanticProcess), claimModel, context.scenario.id);
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), !claimModel, context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(passThroughImplicitSplitMergePipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of
    await loadAndCompileCases(passThroughImplicitSplitMergePipelineCases)) {
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
