/**
 * Locks the registered Send Task schedules against the proposal's separating witnesses without Lean or Temporal: the open
 * work, the open effect's published arguments and the Process variables after every command, each model's route, and
 * every named seeded mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, concurrentStructuredScopeDataProgram, runScenario, scopeReentryProgram,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, DisagreementKind, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { argumentFrom, sendTaskPipelineCases } from "./send-task-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "send-task-";
const bind = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const order = [bind("customerEmail", "ada@example.org"), bind("order", "A-17")];
const claim = [bind("claim", "CL-31")];
// SEND-EFFECT-01: the arguments snapshot the committed inputs, in canonical name order; the channel is a literal.
const notice = [bind("channel", "email"), bind("correlationId", "A-17"), bind("recipient", "ada@example.org")];

/** One step per stimulus: the open work, the open effect's arguments, if any, and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; effect: readonly VariableBinding[] | null; variables: readonly VariableBinding[] }>;

// The Sub-Process fork opens *Assess claim* and the acknowledgement's effect at once.
const forked: Step = { open: ["AcknowledgeClaim#1", "AssessClaim#1"], effect: claim, variables: claim };
const settled: readonly Step[] = [
  { open: ["SettleClaim#1"], effect: null, variables: claim },
  { open: [], effect: null, variables: claim },
];

const journeys = new Map<string, readonly Step[]>([
  // An empty result completes the send; no output is written (SEND-DATA-01).
  ["shipping-notice", [
    { open: ["PackOrder#1"], effect: null, variables: order },
    { open: ["SendShippingNotice#1"], effect: notice, variables: order },
    { open: [], effect: null, variables: order }]],
  ["claim-assessed-first", [forked, { open: ["AcknowledgeClaim#1"], effect: claim, variables: claim }, ...settled]],
  ["claim-acknowledged-first", [forked, { open: ["AssessClaim#1"], effect: null, variables: claim }, ...settled]],
]);

test("registers exactly the three schedules, standards-only, on each model's route and host-admitted", async () => {
  assert.deepEqual(sendTaskPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(sendTaskPipelineCases)) {
    const forking = context.scenario.id.startsWith(`${prefix}claim-`);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.semanticProcess.definitionScopes.length, forking ? 2 : 1, context.scenario.id);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), forking, context.scenario.id);
    assert.equal(scopeReentryProgram(context.semanticProcess), false, context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work, the send's arguments and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(sendTaskPipelineCases)) {
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
      assert.deepEqual(state.openEffects.map(effect => effect.arguments), step.effect === null ? [] : [step.effect], label);
      assert.deepEqual(state.variables, step.variables, label);
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(sendTaskPipelineCases)) {
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

test("a correlation key bound from the wrong variable is named by the comparison as the recipient is", async () => {
  const [context] = await loadAndCompileCases(sendTaskPipelineCases.filter(({ id }) => id === `${prefix}shipping-notice`));
  assert.ok(context !== undefined);
  const result = runScenario(context.scenario, context.semanticProcess);
  const mutated = mutableClone(result);
  argumentFrom(4, "SendShippingNotice", "correlationId", "A-17", "ada@example.org")(mutated);
  const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
    [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
  assert.ok(comparison.kind === ComparisonKind.Disagreement);
  assert.deepEqual(comparison.disagreement, { kind: DisagreementKind.ObservationValue,
    path: "trace[4].openEffects[0].arguments[1].value.value", expected: "A-17", actual: "ada@example.org" });
});
