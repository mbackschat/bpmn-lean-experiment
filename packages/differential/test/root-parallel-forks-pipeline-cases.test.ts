/**
 * Locks the registered employee onboarding schedules against the root Parallel forks proposal's separating witnesses
 * without Lean or Temporal: the open work and Process variables after every command, the concurrent route, and every
 * named seeded mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, concurrentStructuredScopeDataProgram, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { rootParallelForksPipelineCases } from "./root-parallel-forks-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "root-parallel-forks-onboarding-";
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const employee = (department: string): VariableBinding => ({ name: "employee", value: { kind: VariableValueKind.Map,
  value: [{ name: "department", value: text(department) }, { name: "name", value: text("Grace") }] } });
const stage = (value: string): VariableBinding => ({ name: "onboardingStage", value: text(value) });
const tag: VariableBinding = { name: "assetTag", value: text("LT-0042") };

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

const opened: Step = { open: ["ConfirmDocuments#1", "PrepareWorkstation#1"], variables: [employee("Sales")] };
const welcomed = (last: string): Step => ({ open: [], variables: [tag, employee("Finance"), stage(last)] });

const journeys = new Map<string, readonly Step[]>([
  // RPF-VALUE-01: the armed laptop order keeps the Sales snapshot after Collect documents writes Finance.
  ["documents-while-laptop-open", [opened,
    { open: ["ConfirmDocuments#1", "OrderLaptop#1"], variables: [employee("Sales")] },
    { open: ["OrderLaptop#1"], variables: [employee("Finance"), stage("documents-filed")] },
    // RPF-ROOT-01: the join continues once, when its second token arrives.
    { open: ["HoldWelcomeMeeting#1"], variables: [tag, employee("Finance"), stage("equipment-ordered")] },
    welcomed("equipment-ordered")]],
  ["documents-first", [opened,
    { open: ["PrepareWorkstation#1"], variables: [employee("Finance"), stage("documents-filed")] },
    { open: ["OrderLaptop#1"], variables: [employee("Finance"), stage("documents-filed")] },
    { open: ["HoldWelcomeMeeting#1"], variables: [tag, employee("Finance"), stage("equipment-ordered")] },
    welcomed("equipment-ordered")]],
  // RPF-WRITE-01: Collect documents commits last, so its stage wins.
  ["laptop-first", [opened,
    { open: ["ConfirmDocuments#1", "OrderLaptop#1"], variables: [employee("Sales")] },
    { open: ["ConfirmDocuments#1"], variables: [tag, employee("Sales"), stage("equipment-ordered")] },
    { open: ["HoldWelcomeMeeting#1"], variables: [tag, employee("Finance"), stage("documents-filed")] },
    welcomed("documents-filed")]],
]);

test("registers exactly the three onboarding schedules, standards-only, concurrent and host-admitted", async () => {
  assert.deepEqual(rootParallelForksPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(rootParallelForksPipelineCases)) {
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

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(rootParallelForksPipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(rootParallelForksPipelineCases)) {
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
