/**
 * Locks the registered equipment return and document intake schedules against the pass-through Task proposal's separating
 * witnesses without Lean or Temporal: the open work and Process variables after every command, the amended SRE-ROUTE-01
 * route of each model, the Task occurrences each command publishes (PTT-PASS-01, PTT-FRESH-01), and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, applyStimulusWithTrace, initialState, runScenario, scopeReentryProgram,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { passThroughTaskPipelineCases } from "./pass-through-task-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "pass-through-task-";
const format = (value: string): VariableBinding[] => [{ name: "documentFormat", value: { kind: VariableValueKind.String, value } }];

/** One step per stimulus: the open work, the Process variables and the pass-through Tasks the command passes. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[]; passed: readonly string[] }>;

const journeys = new Map<string, readonly Step[]>([
  ["equipment-return", [
    { open: ["SchedulePickup#1"], variables: [], passed: [] },
    // The Manual Task inside the inspection passes on entry, leaving its User Task open.
    { open: ["RecordCondition#1"], variables: [], passed: ["UnpackEquipment"] },
    { open: ["RefundDeposit#1"], variables: [], passed: [] },
    { open: [], variables: [], passed: ["CloseReturnTicket"] },
  ]],
  ["intake-illegible-twice-then-paper", [
    { open: ["RecordDocumentFormat#1"], variables: [], passed: [] },
    { open: ["RecordDocumentFormat#2"], variables: format("illegible"), passed: ["PhoneSender"] },
    { open: ["RecordDocumentFormat#3"], variables: format("illegible"), passed: ["PhoneSender"] },
    { open: ["IndexArchiveLocation#1"], variables: format("paper"), passed: ["FilePaperOriginal"] },
    { open: [], variables: format("paper"), passed: [] },
  ]],
  ["intake-digital", [
    { open: ["RecordDocumentFormat#1"], variables: [], passed: [] },
    { open: [], variables: format("digital"), passed: ["RegisterDigitalCopy"] },
  ]],
]);

const passThroughTasks = new Set(["UnpackEquipment", "CloseReturnTicket", "PhoneSender", "FilePaperOriginal",
  "RegisterDigitalCopy"]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the three schedules over the two retained models, standards-only and host-admitted", async () => {
  assert.deepEqual(passThroughTaskPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(passThroughTaskPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    // SRE-ROUTE-01 as amended: the equipment return's one-input merges keep it serial; the intake chooses and re-enters.
    assert.equal(scopeReentryProgram(context.semanticProcess), context.scenario.id !== `${prefix}equipment-return`,
      context.scenario.id);
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives, never a pass-through Task",
  async () => {
    for (const { scenario, semanticProcess: program } of await loadAndCompileCases(passThroughTaskPipelineCases)) {
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
        const state = stateAt(result.trace, index);
        assert.deepEqual(openWork(state), step.open, label);
        assert.deepEqual(state.variables, step.variables, label);
        assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
      });
    }
  });

test("each command publishes one occurrence per Task it passes, started and ended in one step, fresh on re-entry",
  async () => {
    for (const { scenario, semanticProcess: program } of await loadAndCompileCases(passThroughTaskPipelineCases)) {
      const steps = journeys.get(scenario.id.slice(prefix.length))!;
      let state = initialState;
      const anchors: string[] = [];
      scenario.stimuli.forEach((stimulus, position) => {
        const traced = applyStimulusWithTrace(program, state, stimulus);
        state = traced.result.state;
        const passed = traced.flowNodeOccurrenceLifecycles.flatMap(({ started, ended }) => {
          const tasks = started.filter(({ elementId }) => passThroughTasks.has(elementId));
          // PTT-PASS-01: the occurrence ends at the very anchor that started it.
          for (const { anchor } of tasks) assert.ok(ended.some(end => JSON.stringify(end.anchor) === JSON.stringify(anchor)));
          anchors.push(...tasks.map(({ anchor }) => JSON.stringify(anchor)));
          return tasks.map(({ elementId }) => elementId);
        });
        assert.deepEqual(passed, steps[position]!.passed, `${scenario.id} ${stimulus.commandId}`);
      });
      // PTT-FRESH-01: the re-entered Phone sender's two occurrences have distinct identities.
      assert.equal(new Set(anchors).size, anchors.length, scenario.id);
    }
  });

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(passThroughTaskPipelineCases)) {
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
