/**
 * Locks the registered insurance claim intake schedules against the split proposal's separating witnesses without Lean
 * or Temporal: the open work and Process variables after every command, the concurrent route, the two splitting hosts,
 * and every named seeded mutation, each of which must move exactly the observation it names.
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
import { activityHostSplitPipelineCases } from "./activity-host-split-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "activity-host-split-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const summary = bind("claimSummary", "CLM-2026-0418: water damage in kitchen, EUR 3,150");
// *Intake* declares no data, so *Register claim*'s output reaches its nearest declaring frame, the Process (NSD-WRITE-01).
const registered = [bind("claimNumber", "CLM-2026-0418"), summary];
const assessed = [bind("assessmentReference", "ASM-7731"), ...registered];

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// ACSP-COMPLETE-01: a splitting host's completion opens every successor in its one step. A terminal branch of *Intake*
// ends in the step that completes its Task, and the Sub-Process completes with the step that ends its last branch.
const journeys = new Map<string, readonly Step[]>([
  ["intake-archive-first", [
    { open: ["RegisterClaim#1"], variables: [summary] },
    { open: ["ArchiveDocuments#1", "NotifyBroker#1"], variables: registered },
    { open: ["NotifyBroker#1"], variables: registered },
    { open: ["ReviewClaim#1"], variables: registered },
    { open: ["InformCustomer#1", "OrderAssessment#1"], variables: registered },
    { open: ["InformCustomer#1"], variables: assessed },
    { open: ["DecideClaim#1"], variables: assessed },
    { open: [], variables: assessed },
  ]],
  ["intake-broker-first", [
    { open: ["RegisterClaim#1"], variables: [summary] },
    { open: ["ArchiveDocuments#1", "NotifyBroker#1"], variables: registered },
    { open: ["ArchiveDocuments#1"], variables: registered },
    { open: ["ReviewClaim#1"], variables: registered },
    { open: ["InformCustomer#1", "OrderAssessment#1"], variables: registered },
    { open: ["OrderAssessment#1"], variables: registered },
    { open: ["DecideClaim#1"], variables: assessed },
    { open: [], variables: assessed },
  ]],
]);

test("registers exactly the two schedules, standards-only, on the concurrent route and host-admitted", async () => {
  assert.deepEqual(activityHostSplitPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(activityHostSplitPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), true, context.scenario.id);
    assert.equal(scopeReentryProgram(context.semanticProcess), false, context.scenario.id);
    assert.deepEqual(context.semanticProcess.operations.flatMap(operation => operation.kind === SemanticOperationKind.Activity
      ? [`${operation.origin.elementId}:${operation.inputs.length}:${operation.outputs.length}`] : []).sort(),
    ["RegisterClaim:1:2", "ReviewClaim:1:2"], context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(activityHostSplitPipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(activityHostSplitPipelineCases)) {
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
