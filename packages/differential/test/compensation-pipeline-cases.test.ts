import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, EffectExecutionResultKind, ProcessStatus, StimulusKind, applyStimulusWithTrace, initialState, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { completeEffectCommandId } from "@bpmn-lean/temporal-protocol";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { compensationPipelineCases } from "./compensation-pipeline-cases.ts";
import { mutableClone, projectRoot } from "./pipeline-target-support.ts";
import { loadAndCompileCases } from "./pipeline-targets.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import { readAndVerifyNormativeArtifactSets } from "../../../scripts/contract-artifacts.ts";

const suffixes = ["success-b-c-a", "success-b-a-c", "success-c-b-a", "failure-a", "failure-b", "failure-c"];
const A = "Task_ReserveHotel", B = "Task_ArrangeGroundTravel", C = "Task_IssueInsurance";
const undoA = "Task_UndoReserveHotel", undoB = "Task_UndoGroundTravel", undoC = "Task_UndoInsurance";
const schedules = [
  { forward: [A, B, C], undo: [undoB, undoC, undoA], failed: null },
  { forward: [C, A, B], undo: [undoB, undoA, undoC], failed: null },
  { forward: [A, C, B], undo: [undoC, undoB, undoA], failed: null },
  { forward: [A, B, C], undo: [undoB, undoA], failed: undoA },
  { forward: [A, B, C], undo: [undoB], failed: undoB },
  { forward: [A, B, C], undo: [undoC], failed: undoC },
];

function assertContentBoundEffects(scenario: Scenario): void {
  for (const stimulus of scenario.stimuli) {
    if (stimulus.kind !== StimulusKind.CompleteEffect) continue;
    assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result), "effect completion must use production content-bound identity");
    assert.deepEqual(stimulus.result.localPatch, []);
  }
}

test("public Compensation registration retains its normative profile and six neutral scenarios", async () => {
  const profile = JSON.parse(await readFile(new URL("../../../profiles/bpmn-2.0.2-compensation-source-checkpoint-draft/profile.json", import.meta.url), "utf8"));
  assert.equal(profile.id, "bpmn-2.0.2-compensation-source-checkpoint-draft");
  assert.equal(profile.normativeAuthority.version, "2.0.2");
  assert.equal("oracle" in profile, false);
  assert.deepEqual(profile.bpmn.relationships, ["CIB-AGR-0002", "CIB-OP-0001"]);
  assert.ok(profile.bpmn.features.includes("process-start-string-variable"));
  for (const suffix of suffixes) {
    const scenario = JSON.parse(await readFile(new URL(`../../../scenarios/compensation/${suffix}.scenario.json`, import.meta.url), "utf8"));
    assert.equal(scenario.id, `compensation-${suffix}`);
  }
});

test("travel cancellation changes only display names in the admitted source checkpoint", async () => {
  const [fixture, source] = await Promise.all([
    readFile(new URL("../../bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn", import.meta.url), "utf8"),
    readFile(new URL("../../../scenarios/compensation/travel-cancellation.bpmn", import.meta.url), "utf8"),
  ]);
  const eraseNames = (xml: string) => xml.replace(/\bname="[^"]*"/gu, 'name="display"');
  assert.deepEqual(eraseNames(source), eraseNames(fixture));
  assert.equal(source.includes("Same display name"), false);
  const sha256 = createHash("sha256").update(source).digest("hex");
  for (const { scenario } of await loadAndCompileCases(compensationPipelineCases)) assert.equal(scenario.bpmn.sha256, sha256);
});

test("the normative artifact guard validates all six exact scenario bindings", async () => {
  const artifacts = await readAndVerifyNormativeArtifactSets(projectRoot);
  const selected = artifacts.filter(({ scenario }) => scenario.profile === "bpmn-2.0.2-compensation-source-checkpoint-draft");
  assert.deepEqual(selected.map(({ scenario }) => scenario.id).sort(), suffixes.map((suffix) => `compensation-${suffix}`).sort());
});

test("registered Compensation schedules retain chronology, provenance, content identities and terminal outcomes", async () => {
  const contexts = await loadAndCompileCases(compensationPipelineCases);
  assert.equal(contexts.length, schedules.length);
  for (const [index, { pipelineCase, scenario, semanticProcess }] of contexts.entries()) {
    const schedule = schedules[index];
    assert.ok(schedule);
    assert.equal(pipelineCase.id, `compensation-${suffixes[index]}`);
    assert.equal(pipelineCase.cib, null);
    assert.equal(pipelineCase.completionDelivery, TemporalCompletionDelivery.Ordered);
    assert.equal(pipelineCase.executionSchedule, TemporalExecutionSchedule.StimulusOrder);
    assert.equal(pipelineCase.temporalRelation, TemporalCaseRelation.ExactSemantic);
    assert.equal(pipelineCase.replaySelection, PipelineReplaySelection.Primary);
    assert.equal(pipelineCase.effectSchedules, null);
    assert.equal(pipelineCase.expectedWaitTraceLength, 3);
    assert.equal(scenario.provenance.cibRevision, "834a9874760de8a0107f7c1b32806e37f17fb017");
    assert.deepEqual(scenario.provenance.cibRefs, ["engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/UserTaskActivityBehavior.java"]);
    assertContentBoundEffects(scenario);
    const tasks = scenario.stimuli.filter((stimulus) => stimulus.kind === StimulusKind.CompleteUserTaskInstance);
    assert.deepEqual(tasks.map(({ taskId }) => taskId.elementId), [schedule.forward[0], ...schedule.forward]);
    assert.deepEqual(scenario.stimuli[2], { ...scenario.stimuli[1], commandId: "stale-task" });
    const effects = scenario.stimuli.filter((stimulus) => stimulus.kind === StimulusKind.CompleteEffect);
    assert.deepEqual(effects.map(({ effectId }) => effectId.elementId), schedule.undo);
    assert.deepEqual(effects.filter(({ result }) => result.kind === EffectExecutionResultKind.BpmnError).map(({ effectId }) => effectId.elementId), schedule.failed === null ? [] : [schedule.failed]);
    const result = runScenario(scenario, semanticProcess);
    const commands = result.trace.filter((entry) => entry.kind === CanonicalObservationKind.Command);
    assert.deepEqual(commands.map(({ commandId, outcome }) => [commandId, outcome]), scenario.stimuli.map(({ commandId }) => [commandId, commandId === "stale-task" ? CommandOutcome.Rejected : CommandOutcome.Committed]));
    assert.deepEqual(result.trace[4], result.trace[6], "stale task result changes no public state");
    const frontier = result.trace[10];
    assert.ok(frontier?.kind === CanonicalObservationKind.State);
    assert.deepEqual(frontier.openEffects.map(({ id }) => id.elementId), [undoB, undoC]);
    if (schedule.failed === undoA) {
      const beforeFailure = result.trace[12];
      assert.ok(beforeFailure?.kind === CanonicalObservationKind.State);
      assert.deepEqual(beforeFailure.openEffects.map(({ id }) => id.elementId), [undoC, undoA]);
    }
    const final = result.trace.at(-1);
    assert.ok(final?.kind === CanonicalObservationKind.State);
    assert.equal(final.status, schedule.failed === null ? ProcessStatus.Completed : ProcessStatus.Failed);
    assert.deepEqual(final.openEffects, []);
    assert.deepEqual(final.activeWaits, []);
    if (final.status === ProcessStatus.Failed) assert.equal(final.failure.effectId.elementId, schedule.failed);
  }
});

test("artifact identity guard rejects private effect command IDs even when core semantics would execute them", async () => {
  const [context] = await loadAndCompileCases(compensationPipelineCases.slice(0, 1));
  assert.ok(context);
  const changed = mutableClone(context.scenario);
  const effect = changed.stimuli.find((stimulus) => stimulus.kind === StimulusKind.CompleteEffect);
  assert.ok(effect);
  effect.commandId = `undo:${effect.effectId.elementId}`;
  assert.throws(() => assertContentBoundEffects(changed), /production content-bound identity/u);
  const final = runScenario(changed, context.semanticProcess).trace.at(-1);
  assert.ok(final?.kind === CanonicalObservationKind.State);
  assert.equal(final.status, ProcessStatus.Completed);
  effect.commandId = completeEffectCommandId(effect.effectId, effect.result);
  effect.result = { kind: EffectExecutionResultKind.BpmnError, code: "altered", message: null, localPatch: [] };
  assert.throws(() => assertContentBoundEffects(changed), /production content-bound identity/u);
});

test("the actual comparator separates premature activation, missing concurrency, restored input, failure and stale-result mutation", async () => {
  for (const { pipelineCase, scenario, semanticProcess } of await loadAndCompileCases(compensationPipelineCases)) {
    const result = runScenario(scenario, semanticProcess);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result }, [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind !== ComparisonKind.Disagreement) throw new Error("Compensation mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    if (pipelineCase.id === "compensation-success-c-b-a") {
      const expected = result.trace[10], actual = mutated.trace[10];
      assert.ok(expected?.kind === CanonicalObservationKind.State && actual?.kind === CanonicalObservationKind.State);
      assert.deepEqual(actual.openEffects[0]?.id, expected.openEffects[0]?.id);
      assert.deepEqual(actual.openEffects[0]?.descriptor, expected.openEffects[0]?.descriptor);
    }
  }
});

test("a new command carrying a stale handler result refuses atomically", async () => {
  const [context] = await loadAndCompileCases(compensationPipelineCases.slice(0, 1));
  assert.ok(context);
  let state = initialState;
  for (const stimulus of context.scenario.stimuli.slice(0, 6)) state = applyStimulusWithTrace(context.semanticProcess, state, stimulus).result.state;
  const completed = context.scenario.stimuli[5];
  assert.ok(completed?.kind === StimulusKind.CompleteEffect);
  const stale = applyStimulusWithTrace(context.semanticProcess, state, { ...completed, commandId: "new-command-stale-effect" });
  assert.equal(stale.result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.result.state, state);
  assert.deepEqual(stale.committedTransitions, []);
  assert.deepEqual(stale.flowNodeOccurrenceLifecycles, []);
});
