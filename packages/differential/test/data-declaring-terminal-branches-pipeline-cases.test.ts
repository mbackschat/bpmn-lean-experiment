/**
 * Locks the registered expense-claim schedule against the data-declaring terminal branches proposal's separating witness
 * without Lean or Temporal: the open work and Process variables after every command, the concurrent route, and the seeded
 * mutation, which must move exactly the observation it names.
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
import { dataDeclaringTerminalBranchesPipelineCases } from "./data-declaring-terminal-branches-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const claim = text("claim", "Taxi to client, EUR 42");
const checked = [claim, text("policyLimit", "EUR 500")];
// DTB-COMMUTE-01: the policy result's closure ends both wait-free branches beside the entry of *Review claim*, whose
// `verdict` stays local; *Approve claim* completes it and its output `reviewVerdict` reaches the Process.
const steps: ReadonlyArray<Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>> = [
  { open: ["CheckClaimPolicy#1"], variables: [claim] },
  { open: ["ApproveClaim#1"], variables: checked },
  { open: [], variables: [claim, text("policyLimit", "EUR 500"), text("reviewVerdict", "pending")] },
];

test("registers exactly the expense-claim schedule, standards-only, concurrent and host-admitted", async () => {
  assert.deepEqual(dataDeclaringTerminalBranchesPipelineCases.map(({ id }) => id),
    ["data-declaring-terminal-branches-expense-claim"]);
  for (const context of await loadAndCompileCases(dataDeclaringTerminalBranchesPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), true);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("the journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(dataDeclaringTerminalBranchesPipelineCases)) {
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed });
    assert.equal(result.trace.length, 1 + 2 * steps.length, "the journey ends at the completed state");
    steps.forEach((step, position) => {
      const index = 2 + 2 * position;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `trace[${index}] follows a command`);
      assert.equal(command.outcome, CommandOutcome.Committed, `trace[${index - 1}]`);
      const state = result.trace[index];
      assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
      assert.deepEqual(openWork(state), step.open, `trace[${index}]`);
      assert.deepEqual(state.variables, step.variables, `trace[${index}]`);
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running);
    });
  }
});

test("the seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(dataDeclaringTerminalBranchesPipelineCases)) {
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
