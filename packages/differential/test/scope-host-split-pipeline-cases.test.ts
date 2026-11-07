/**
 * Locks the registered employee onboarding schedules against the scope host proposal's separating witnesses without Lean
 * or Temporal: the open work and Process variables after every command, the concurrent route, and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticOperationKind,
  SemanticProfileId, StimulusKind, VariableValueKind, concurrentStructuredScopeDataProgram, runScenario,
  scopeReentryProgram, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { scopeHostSplitPipelineCases } from "./scope-host-split-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "scope-host-split-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const hire = bind("hireSummary", "Dana Ruiz, data engineer, starts 2026-12-01");
const registered = [bind("employeeNumber", "E-20417"), hire];

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// SCPH-START-01 and SCPH-EXIT-01: each split opens both successors in the step that reaches it, and the body Start of
// *Issue equipment* is that step, never one of its own.
const journeys = new Map<string, readonly Step[]>([
  ["onboarding-register-first", [
    { open: ["PrepareWorkstation#1", "RegisterHire#1"], variables: [hire] },
    { open: ["PrepareWorkstation#1"], variables: registered },
    { open: ["IssueBadge#1", "IssueLaptop#1"], variables: registered },
    { open: ["IssueLaptop#1"], variables: registered },
    // *Notify facilities* ends its branch in the step that opens *Confirm IT access*.
    { open: ["ConfirmItAccess#1"], variables: registered },
    { open: [], variables: registered },
  ]],
  ["onboarding-workstation-first", [
    { open: ["PrepareWorkstation#1", "RegisterHire#1"], variables: [hire] },
    { open: ["RegisterHire#1"], variables: [hire] },
    { open: ["IssueBadge#1", "IssueLaptop#1"], variables: registered },
    { open: ["IssueBadge#1"], variables: registered },
    { open: ["ConfirmItAccess#1"], variables: registered },
    { open: [], variables: registered },
  ]],
]);

test("registers exactly the two schedules, standards-only, on the concurrent route and host-admitted", async () => {
  assert.deepEqual(scopeHostSplitPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(scopeHostSplitPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), true, context.scenario.id);
    assert.equal(scopeReentryProgram(context.semanticProcess), false, context.scenario.id);
    assert.deepEqual(context.semanticProcess.operations.filter(({ kind }) => kind === SemanticOperationKind.Scope ||
      kind === SemanticOperationKind.ScopeExit).map(({ kind, origin }) => `${kind}:${origin.elementId}`).sort(),
    ["scope:HireConfirmed", "scope:IssueEquipment", "scopeExit:IssueEquipment"], context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(scopeHostSplitPipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(scopeHostSplitPipelineCases)) {
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
