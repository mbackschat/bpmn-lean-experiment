import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, ProcessStatus, StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { completeEffectCommandId, assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import { TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { businessTaskCompositionPipelineCases } from "./business-task-composition-pipeline-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import type { MutableScenarioResult } from "./pipeline-types.ts";

test("business pipeline candidates bind retained inputs without claiming public admission", async context => {
  const loaded = await loadAndCompileCases(businessTaskCompositionPipelineCases);
  assert.deepEqual(loaded.map(({ scenario }) => scenario.id), ["classification", "invoice-rework", "invoice-business-error-recovery"]);
  for (const { pipelineCase, scenario, semanticProcess, retainedEvidence } of loaded) {
    await context.test(scenario.id, () => {
      assert.equal(pipelineCase.id, scenario.id);
      assert.equal(pipelineCase.bpmnRelativePath, scenario.bpmn.relativePath);
      assert.equal(pipelineCase.executionSchedule, TemporalExecutionSchedule.StimulusOrder);
      assert.equal(pipelineCase.effectSchedules, null);
      assert.equal(pipelineCase.cib, null);
      assert.equal(retainedEvidence, null);
      assert.equal(semanticProcess.identity.sourceSha256, scenario.bpmn.sha256);
      assert.deepEqual(semanticProcess.identity.sourceOverlay, scenario.bpmn.sourceOverlay);
      assert.equal(assessTemporalHostCapability(semanticProcess).kind, TemporalHostCapabilityResultKind.Rejected);
      for (const stimulus of scenario.stimuli) {
        if (stimulus.kind === StimulusKind.CompleteEffect) {
          assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result));
        }
      }
      const result = runScenario(scenario, semanticProcess);
      const final = result.trace.at(-1);
      assert.equal(final?.kind, CanonicalObservationKind.State);
      if (final?.kind !== CanonicalObservationKind.State) throw new Error("Missing terminal state");
      assert.equal(final.status, ProcessStatus.Completed);
      for (const mutated of [mutableClone(result), parseStrictJson<MutableScenarioResult>(JSON.stringify(result), "wire result")]) {
        pipelineCase.injectMutation(mutated);
        const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
          [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
        assert.equal(comparison.kind, ComparisonKind.Disagreement);
        if (comparison.kind !== ComparisonKind.Disagreement) throw new Error("Business mutation escaped comparison");
        assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement);
        assert.throws(() => pipelineCase.injectMutation(mutated), /mutation requires/u);
      }
    });
  }
});
