import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, StimulusKind, applyStimulus, initialState,
  projectEffectTransportMaterial, runScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { completeEffectCommandId, effectTransportKey } from "@bpmn-lean/temporal-protocol";
import { TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { businessTaskCompositionPipelineCases } from "./business-task-composition-pipeline-cases.ts";
import { pipelineCases } from "./pipeline-cases.ts";
import { readAndVerifyNormativeArtifactSets } from "../../../scripts/contract-artifacts.ts";
import { requireExecutableModelCorpusManifest } from "../../../scripts/executable-model-corpus.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";
import { createInvoiceEffectActivities, createInvoiceRecoveryEffectActivities } from "../../temporal-adapter/runner/examples/invoice-effect-activities.ts";

test("registered business journeys bind normative profiles, exact overlays and engine-only corpus entries", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const artifacts = await readAndVerifyNormativeArtifactSets(root);
  const manifest = requireExecutableModelCorpusManifest(JSON.parse(
    await readFile(new URL("../../../model-corpus/manifest.json", import.meta.url), "utf8")));
  const families = ["serial-business-task-composition", "mixed-task-control-flow", "mixed-task-business-error"];
  const originalFixtures = [
    { scenario: "serial-classification", bpmn: "serial-invoice-classification" },
    { scenario: "mixed-invoice-rework", bpmn: "mixed-task-invoice-rework" },
    { scenario: "business-error", bpmn: "mixed-task-invoice-business-error" },
  ];
  for (const [index, candidate] of businessTaskCompositionPipelineCases.entries()) {
    const registered: PipelineCase | undefined = pipelineCases.find(({ id }) => id === candidate.id);
    assert.ok(registered !== undefined, `missing registered business journey ${candidate.id}`);
    assert.equal(registered.scenarioRelativePath, `scenarios/${families[index]}/scenario.json`);
    assert.equal(registered.bpmnRelativePath, `scenarios/${families[index]}/process.bpmn`);
    assert.equal(registered.sourceOverlayRelativePath, `scenarios/${families[index]}/source-overlay.json`);
    assert.equal(registered.cib, null);
    const artifact = artifacts.find(({ scenario }) => scenario.id === candidate.id);
    assert.ok(artifact !== undefined, `missing normative business artifact ${candidate.id}`);
    assert.equal(artifact.profile.id, artifact.scenario.profile);
    assert.equal(artifact.profile.normativeAuthority.version, "2.0.2");
    assert.equal("oracle" in artifact.profile, false);
    assert.equal("environment" in artifact.profile, false);
    assert.ok(artifact.profile.bpmn.relationships.includes("CIB-EXT-0015"));
    if (candidate.id === "invoice-business-error-recovery") {
      assert.ok(artifact.profile.bpmn.relationships.includes("CIB-AGR-0012"));
      assert.ok(artifact.profile.bpmn.relationships.includes("CIB-EXT-0016"));
    }
    const model = manifest.models.find(({ pipelineCaseId }) => pipelineCaseId === candidate.id);
    assert.ok(model !== undefined, `missing retained whole model ${candidate.id}`);
    assert.equal(model.profile, artifact.profile.id);
    assert.equal(model.source.kind, "retainedScenario");
    if (model.source.kind !== "retainedScenario") throw new Error("Business model must retain project-owned source");
    assert.equal(model.source.bpmnRelativePath, registered.bpmnRelativePath);
    assert.equal(model.source.scenarioRelativePath, registered.scenarioRelativePath);
    assert.equal(model.source.sha256, artifact.scenario.bpmn.sha256);
    assert.equal(model.product2.kind, "notCatalogReady");
    const original = originalFixtures[index];
    assert.ok(original !== undefined);
    const originalScenario = JSON.parse(await readFile(new URL(
      `./fixtures/${original.scenario}.scenario.json`, import.meta.url), "utf8"));
    assert.deepEqual(artifact.scenario, { ...originalScenario,
      bpmn: { ...originalScenario.bpmn, relativePath: registered.bpmnRelativePath },
      provenance: { ...originalScenario.provenance,
        cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017" } });
    assert.deepEqual(artifact.bpmnBytes, await readFile(new URL(
      `../../bpmn-source/test/fixtures/${original.bpmn}.bpmn`, import.meta.url)));
    assert.deepEqual(await readFile(new URL(`../../../${registered.sourceOverlayRelativePath}`, import.meta.url)),
      await readFile(new URL(`./fixtures/${original.scenario}.overlay.json`, import.meta.url)));
  }
});

test("retained business journeys agree with their caller-supplied invoice handlers", async context => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(businessTaskCompositionPipelineCases)) {
    await context.test(scenario.id, async () => {
      const activities = scenario.id === "invoice-business-error-recovery"
        ? createInvoiceRecoveryEffectActivities() : createInvoiceEffectActivities();
      let state = initialState;
      const actual = [];
      const expected = [];
      for (const stimulus of scenario.stimuli) {
        if (stimulus.kind === StimulusKind.CompleteEffect) {
          const [wait] = state.effectWaits;
          assert.equal(state.effectWaits.length, 1);
          assert.ok(wait !== undefined);
          assert.deepEqual(wait.id, stimulus.effectId);
          const material = projectEffectTransportMaterial(program, wait);
          actual.push(await activities.executeBpmnEffect({ ...material.descriptor,
            arguments: material.arguments, idempotencyKey: effectTransportKey(material) }));
          expected.push(stimulus.result);
        }
        const step = applyStimulus(program, state, stimulus);
        assert.equal(step.outcome, CommandOutcome.Committed, stimulus.commandId);
        state = step.state;
      }
      assert.deepEqual(actual, expected);
    });
  }
});

test("registered business journeys preserve exact semantic comparisons without a CIB profile target", async context => {
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
