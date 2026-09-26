import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CanonicalObservationKind, CommandOutcome, EffectExecutionResultKind, ProcessStatus,
  StimulusKind, applyStimulusWithTrace, initialState, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { completeEffectCommandId } from "@bpmn-lean/temporal-protocol";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { readAndVerifyNormativeArtifactSets, verifyNormativeArtifactSet } from "../../../scripts/contract-artifacts.ts";
import { mutableClone, projectRoot } from "./pipeline-target-support.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";

const profileId = "bpmn-2.0.2-transaction-cancellation-checkpoint-draft";
const names = ["empty", "retained-active", "retained-ended", "handler-failed"] as const;

function stateAt(result: ScenarioResult, index: number) {
  const state = result.trace[index];
  assert.equal(state?.kind, CanonicalObservationKind.State);
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Missing state at ${index}`);
  return state;
}

function requireContentBoundEffects(scenario: Scenario): void {
  for (const stimulus of scenario.stimuli) {
    if (stimulus.kind !== StimulusKind.CompleteEffect) continue;
    assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result));
    assert.deepEqual(stimulus.result.localPatch, []);
  }
}

test("Transaction cancellation registers exact neutral schedules and separating semantic mutations", { timeout: 60_000 }, async (t) => {
  for (const relativePath of [
    `profiles/${profileId}/profile.json`,
    "scenarios/transaction-cancellation/reservation-withdrawal.bpmn",
    ...names.map((name) => `scenarios/transaction-cancellation/${name}.scenario.json`),
    "packages/differential/test/transaction-cancellation-pipeline-cases.ts",
  ]) {
    assert.ok(existsSync(`${projectRoot}/${relativePath}`), `Transaction registration is missing ${relativePath}`);
  }
  const { transactionCancellationPipelineCases: cases } = await import("./transaction-cancellation-pipeline-cases.ts");
  const contexts = await loadAndCompileCases(cases);

  await t.test("exact XML, normative profile and answer-free schema bind all four schedules without CIB", async () => {
    const profile = JSON.parse(await readFile(`${projectRoot}/profiles/${profileId}/profile.json`, "utf8"));
    assert.equal(profile.id, profileId);
    assert.equal(profile.normativeAuthority.version, "2.0.2");
    assert.equal("oracle" in profile, false);
    const bytes = await readFile(`${projectRoot}/scenarios/transaction-cancellation/reservation-withdrawal.bpmn`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, "1286fe6dd67bcf788f7626297a123ebd8c3d4d403f84a0ea9dcc67abc8edc4d4");
    assert.deepEqual(cases.map(({ id }) => id), names.map((name) => `transaction-cancellation-${name}`));
    const artifacts = (await readAndVerifyNormativeArtifactSets(projectRoot))
      .filter(({ scenario }) => scenario.profile === profileId);
    assert.equal(artifacts.length, 4);
    for (const { pipelineCase, scenario, semanticProcess, retainedEvidence } of contexts) {
      assert.equal(scenario.id, pipelineCase.id);
      assert.equal(scenario.profile, profileId);
      assert.equal(scenario.bpmn.sha256, digest);
      assert.equal(scenario.bpmn.relativePath, pipelineCase.bpmnRelativePath);
      assert.equal(scenario.bpmn.sourceOverlay, null);
      assert.equal(semanticProcess.identity.sourceSha256, digest);
      assert.equal(semanticProcess.identity.semanticProfile, profileId);
      assert.deepEqual(scenario.observations, profile.observations);
      assert.equal(pipelineCase.cib, null);
      assert.equal(retainedEvidence, null);
      assert.equal(scenario.provenance.cibRevision, "not-applicable");
      assert.deepEqual(scenario.provenance.cibRefs, []);
      assert.equal(pipelineCase.completionDelivery, TemporalCompletionDelivery.Ordered);
      assert.equal(pipelineCase.executionSchedule, TemporalExecutionSchedule.StimulusOrder);
      assert.equal(pipelineCase.temporalRelation, TemporalCaseRelation.ExactSemantic);
      assert.equal(pipelineCase.replaySelection, PipelineReplaySelection.Primary);
      assert.equal(pipelineCase.effectSchedules, null);
      assert.equal(pipelineCase.expectedWaitTraceLength, 3);
      requireContentBoundEffects(scenario);
    }
    for (const artifact of artifacts) {
      const scenario = { ...artifact.scenario, expectedOutcome: "completed" };
      assert.throws(() => verifyNormativeArtifactSet({ ...artifact, scenario }), /schema/iu);
    }
  });

  await t.test("explicit task and handler schedules preserve content-bound result identity", () => {
    for (const { scenario } of contexts) {
      const start = scenario.stimuli[0];
      assert.equal(start?.kind, StimulusKind.StartProcess);
      if (start?.kind !== StimulusKind.StartProcess) throw new Error("Missing Start");
      assert.ok(start.instanceId.length > 0);
      assert.deepEqual(start.initialVariables, []);
      const taskIds = scenario.stimuli.flatMap((stimulus) => {
        if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) return [];
        assert.deepEqual(stimulus.submittedValues, []);
        assert.equal(stimulus.taskId.processInstanceId, start.instanceId);
        assert.equal(stimulus.taskId.activation, 1);
        return [stimulus.taskId.elementId];
      });
      const empty = scenario.id.endsWith("-empty");
      const ended = scenario.id.endsWith("-retained-ended");
      const failed = scenario.id.endsWith("-handler-failed");
      assert.deepEqual(taskIds, [
        ...empty ? [] : ["Task_Reserve"], ...ended ? ["Task_Prepare"] : [],
        "Task_Withdraw", "Task_Reserve", ...failed ? [] : ["Task_Acknowledge"],
      ]);
      const effects = scenario.stimuli.filter((stimulus) => stimulus.kind === StimulusKind.CompleteEffect);
      assert.equal(effects.length, empty ? 0 : 1);
      for (const effect of effects) {
        assert.deepEqual(effect.effectId, { processInstanceId: start.instanceId, elementId: "Task_Release", activation: 1 });
        assert.equal(effect.result.kind, failed ? EffectExecutionResultKind.BpmnError : EffectExecutionResultKind.Success);
      }
      if (!empty) {
        const changedId = mutableClone(scenario);
        const effect = changedId.stimuli.find((stimulus) => stimulus.kind === StimulusKind.CompleteEffect);
        if (effect?.kind !== StimulusKind.CompleteEffect) throw new Error("Missing effect");
        effect.commandId = "unbound-effect-result";
        assert.throws(() => requireContentBoundEffects(changedId));
        const changedContent = mutableClone(scenario);
        const content = changedContent.stimuli.find((stimulus) => stimulus.kind === StimulusKind.CompleteEffect);
        if (content?.kind !== StimulusKind.CompleteEffect) throw new Error("Missing effect");
        content.effectId.activation = 2;
        assert.throws(() => requireContentBoundEffects(changedContent));
      }
    }
  });

  await t.test("cancellation interrupts ordinary work, preserves eligibility and releases only after handler success", () => {
    for (const { scenario, semanticProcess } of contexts) {
      const result = runScenario(scenario, semanticProcess);
      const empty = scenario.id.endsWith("-empty");
      const ended = scenario.id.endsWith("-retained-ended");
      const failed = scenario.id.endsWith("-handler-failed");
      const cancelIndex = empty ? 4 : ended ? 8 : 6;
      assert.deepEqual(result.trace.filter((observation) => observation.kind === CanonicalObservationKind.Command)
        .map(({ outcome }) => outcome), scenario.stimuli.map(({ commandId }) =>
          commandId === "stale-task" ? CommandOutcome.Rejected : CommandOutcome.Committed));
      assert.deepEqual(stateAt(result, 2).openUserTasks.map(({ id }) => id.elementId), ["Task_Reserve", "Task_Withdraw"]);
      if (!empty) {
        assert.deepEqual(stateAt(result, 4).openUserTasks.map(({ id }) => id.elementId), ["Task_Prepare", "Task_Withdraw"]);
        if (ended) assert.deepEqual(stateAt(result, 6).openUserTasks.map(({ id }) => id.elementId), ["Task_Withdraw"]);
      }
      const cancelled = stateAt(result, cancelIndex);
      assert.equal(cancelled.status, ProcessStatus.Running);
      assert.deepEqual(cancelled.openUserTasks.map(({ id }) => id.elementId), empty ? ["Task_Acknowledge"] : []);
      assert.deepEqual(cancelled.openEffects.map(({ id }) => id.elementId), empty ? [] : ["Task_Release"]);
      assert.deepEqual(stateAt(result, cancelIndex + 2), cancelled, "stale task must preserve the complete public state");
      if (!empty && !failed) {
        const joined = stateAt(result, cancelIndex + 4);
        assert.deepEqual(joined.openEffects, []);
        assert.deepEqual(joined.openUserTasks.map(({ id }) => id.elementId), ["Task_Acknowledge"]);
      }
      const terminal = stateAt(result, result.trace.length - 1);
      assert.equal(terminal.status, failed ? ProcessStatus.Failed : ProcessStatus.Completed);
      assert.deepEqual(terminal.activeWaits, []);
      assert.deepEqual(terminal.openUserTasks, []);
      assert.deepEqual(terminal.openEffects, []);
      assert.deepEqual(terminal.openTimers, []);
      assert.deepEqual(terminal.openMessageSubscriptions, []);
      assert.deepEqual(terminal.openIncidents, []);
      assert.deepEqual(terminal.enabledInteractions, []);
      if (terminal.status === ProcessStatus.Failed) {
        assert.equal(terminal.failure.effectId.elementId, "Task_Release");
      }
      let runtime = initialState;
      for (const stimulus of scenario.stimuli) {
        const execution = applyStimulusWithTrace(semanticProcess, runtime, stimulus);
        if (stimulus.commandId === "stale-task") {
          assert.equal(execution.result.outcome, CommandOutcome.Rejected);
          assert.deepEqual(execution.result.state, runtime);
          assert.deepEqual(execution.committedTransitions, []);
          assert.deepEqual(execution.flowNodeOccurrenceLifecycles, []);
        }
        runtime = execution.result.state;
      }
    }
  });

  await t.test("actual canonical comparator rejects missing continuation, early release, lost eligibility and completed failure", () => {
    for (const { pipelineCase, scenario, semanticProcess } of contexts) {
      const result = runScenario(scenario, semanticProcess);
      const mutated = mutableClone(result);
      pipelineCase.injectMutation(mutated);
      assert.notDeepEqual(mutated, result);
      const comparison = compareTargetResults(
        { target: DifferentialTarget.SemanticCore, result },
        [{ target: DifferentialTarget.SemanticCore, result: mutated }],
      );
      assert.equal(comparison.kind, ComparisonKind.Disagreement);
      if (comparison.kind !== ComparisonKind.Disagreement) throw new Error("Mutation escaped semantic comparison");
      assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    }
  });
});
