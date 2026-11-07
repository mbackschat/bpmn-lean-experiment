/**
 * Locks the registered claim review schedules against the Activity host proposal's separating witnesses without Lean
 * or Temporal: the open work and Process variables after every command, the re-entry route, and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticOperationKind,
  SemanticProfileId, SemanticTransitionKind, StimulusKind, VariableValueKind, applyStimulusWithTrace,
  concurrentStructuredScopeDataProgram, initialState, runScenario,
  scopeReentryProgram, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { activityHostMergePipelineCases } from "./activity-host-merge-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "activity-host-merge-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const summary = bind("claimSummary", "CLM-12: storm damage to roof, EUR 6,400");
const opinion = bind("opinion", "covered: storm exclusion does not apply");
const triage = (route: string) => bind("triage", route);
const review = (outcome: string) => bind("review", outcome);

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

// ACTH-MERGE-01: each arrival at a merging Task starts one fresh occurrence in one step, with no step for the merge.
const journeys = new Map<string, readonly Step[]>([
  ["claim-direct", [
    { open: ["TriageClaim#1"], variables: [summary] },
    { open: ["ReviewClaim#1"], variables: [summary, triage("direct")] },
    { open: ["FetchReviewOutcome#1"], variables: [summary, triage("direct")] },
    { open: [], variables: [summary, review("accept"), triage("direct")] },
  ]],
  ["claim-expert", [
    { open: ["TriageClaim#1"], variables: [summary] },
    { open: ["ObtainExpertOpinion#1"], variables: [summary, triage("expert")] },
    { open: ["ReviewClaim#1"], variables: [summary, opinion, triage("expert")] },
    { open: ["FetchReviewOutcome#1"], variables: [summary, opinion, triage("expert")] },
    { open: [], variables: [summary, opinion, review("accept"), triage("expert")] },
  ]],
  // The reopened review is a second occurrence of *Review claim*, arriving on its other incoming flow.
  ["claim-direct-reopened", [
    { open: ["TriageClaim#1"], variables: [summary] },
    { open: ["ReviewClaim#1"], variables: [summary, triage("direct")] },
    { open: ["FetchReviewOutcome#1"], variables: [summary, triage("direct")] },
    { open: ["ObtainExpertOpinion#1"], variables: [summary, review("reopen"), triage("direct")] },
    { open: ["ReviewClaim#2"], variables: [summary, opinion, review("reopen"), triage("direct")] },
    { open: ["FetchReviewOutcome#2"], variables: [summary, opinion, review("reopen"), triage("direct")] },
    { open: [], variables: [summary, opinion, review("accept"), triage("direct")] },
  ]],
]);

test("registers exactly the three schedules, standards-only, on the re-entry route and host-admitted", async () => {
  assert.deepEqual(activityHostMergePipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(activityHostMergePipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(scopeReentryProgram(context.semanticProcess), true, context.scenario.id);
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), false, context.scenario.id);
    assert.deepEqual(context.semanticProcess.operations.filter(({ kind }) => kind === SemanticOperationKind.Activity)
      .map(({ origin }) => origin.elementId).sort(), ["ObtainExpertOpinion", "ReviewClaim"], context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(activityHostMergePipelineCases)) {
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
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(activityHostMergePipelineCases)) {
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

// ACTH-MERGE-01 and ACTH-HOST-01 at the publication boundary: each command's committed internal records, written from
// the account. A merge arrival is exactly one record under its work's legacy kind; no record has the host discriminant
// and none stands for the merge (wrong algorithms 5 and 8).
const opening = ["initiate:ClaimSubmitted", "awaitEffect:TriageClaim"];
const closing = ["choose:Reopen", "reachNoneEnd:ClaimDecided", "completeScope:Process_ClaimReview"];
const records = new Map<string, readonly (readonly string[])[]>([
  ["claim-direct", [opening, ["choose:ExpertNeeded", "awaitUserTask:ReviewClaim"], ["awaitEffect:FetchReviewOutcome"], closing]],
  ["claim-expert", [opening, ["choose:ExpertNeeded", "awaitEffect:ObtainExpertOpinion"], ["awaitUserTask:ReviewClaim"],
    ["awaitEffect:FetchReviewOutcome"], closing]],
  ["claim-direct-reopened", [opening, ["choose:ExpertNeeded", "awaitUserTask:ReviewClaim"], ["awaitEffect:FetchReviewOutcome"],
    ["choose:Reopen", "awaitEffect:ObtainExpertOpinion"], ["awaitUserTask:ReviewClaim"], ["awaitEffect:FetchReviewOutcome"], closing]],
]);

test("each arrival publishes one internal record under its work's legacy kind and the merge publishes none", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(activityHostMergePipelineCases)) {
    const expected = records.get(scenario.id.slice(prefix.length))!;
    let state = structuredClone(initialState);
    assert.equal(scenario.stimuli.length, expected.length, scenario.id);
    scenario.stimuli.forEach((stimulus, position) => {
      const trace = applyStimulusWithTrace(program, state, stimulus, 64);
      assert.equal(trace.result.outcome, CommandOutcome.Committed, `${scenario.id} command ${position}`);
      assert.deepEqual(trace.committedTransitions.flatMap(({ transition }) =>
        transition.kind === SemanticTransitionKind.InternalOperation
          ? [`${transition.operationKind}:${transition.origin.elementId}`] : []), expected[position],
        `${scenario.id} command ${position}`);
      state = trace.result.state;
    });
  }
});
