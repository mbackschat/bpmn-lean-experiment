import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { artifactCases, normativeArtifactCases } from "../../../scripts/contract-artifact-cases.ts";
import { verifyPipelineRegistration } from "../../../scripts/capsule-roundtrip.ts";
import { pipelineCases } from "./pipeline-cases.ts";
import { repeatableSubscriptionPipelineCases } from "./repeatable-subscriptions-pipeline-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { loadAndCompileCases, runCoreTargets } from "./pipeline-targets.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";

test("subscription catalog binds every scenario to ordered durable execution and replay", () => {
  assert.equal(repeatableSubscriptionPipelineCases.length, 14);
  assert.equal(new Set(repeatableSubscriptionPipelineCases.map(({ bpmnRelativePath }) => bpmnRelativePath)).size, 8);
  for (const entry of repeatableSubscriptionPipelineCases) {
    assert.ok(pipelineCases.includes(entry));
    assert.equal(entry.cib, null);
    assert.equal(entry.completionDelivery, TemporalCompletionDelivery.Ordered);
    assert.equal(entry.executionSchedule, TemporalExecutionSchedule.StimulusOrder);
    assert.equal(entry.temporalRelation, TemporalCaseRelation.ExactSemantic);
    assert.equal(entry.replaySelection, PipelineReplaySelection.Primary);
    assert.throws(() => verifyPipelineRegistration(artifactCases, normativeArtifactCases,
      pipelineCases.filter(({ id }) => id !== entry.id)));
  }
});

test("subscription mutations separate handler multiplicity, fresh identity, retention and withdrawal", async () => {
  const contexts = await loadAndCompileCases(repeatableSubscriptionPipelineCases);
  const results = runCoreTargets(contexts).results;
  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result);
    const final = result.trace.at(-1);
    assert.ok(final?.kind === CanonicalObservationKind.State);
    assert.equal(final.status, ProcessStatus.Completed, context.scenario.id);
    const mutated = mutableClone(result);
    context.pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement, context.scenario.id);
    if (comparison.kind !== ComparisonKind.Disagreement) throw new Error("subscription mutation was not detected");
    assert.deepEqual(comparison.disagreement, context.pipelineCase.expectedInjectedDisagreement, context.scenario.id);
  }
});
