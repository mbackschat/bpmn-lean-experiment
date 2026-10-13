import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind, BpmnProcessAdmissionFailureCode } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { structuredCompositionPipelineCases } from "./structured-composition-pipeline-cases.ts";
import { binding, invoiceSource, serialSource } from "./structured-composition-fixtures.ts";
import { mutableClone } from "./pipeline-target-support.ts";

test("registered composition retains the exact reviewed invoice and serial source bytes", async () => {
  for (const [name, expected] of [["invoice", invoiceSource()], ["serial", serialSource]] as const) {
    assert.equal(await readFile(new URL(`../../../scenarios/structured-process-composition/${name}.bpmn`, import.meta.url), "utf8"), expected);
  }
});

test("composition scenarios bind public admission, mapped handoff and an input discriminator", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(structuredCompositionPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
    for (const malformed of [{ ...program, operations: [] }, { ...program, controlPlaces: [] },
      { ...program, identity: { ...program.identity, semanticProfile: "bpmn-2.0.2-activity-data-input-output-user-task-draft" } }]) {
      const refusal = assessBpmnProcessAdmission(start, malformed);
      assert.equal(refusal.kind, BpmnProcessAdmissionResultKind.Rejected);
      if (refusal.kind !== BpmnProcessAdmissionResultKind.Rejected) assert.fail("Invalid composition admitted");
      assert.equal(refusal.failure.code, BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported);
    }
    const result = runScenario(scenario, program);
    const final = result.trace.at(-1);
    assert.ok(final?.kind === CanonicalObservationKind.State);
    assert.equal(final.status, ProcessStatus.Completed);
    const decision = scenario.id.endsWith("-null") || scenario.id.endsWith("-manual") ? null :
      scenario.id.endsWith("-reject") ? "rejected" : "approved";
    assert.deepEqual(final.variables, [binding("decision", decision), binding("receipt", "saved"), binding("summary", "Invoice 4711")]);
    const states = result.trace.filter(observation => observation.kind === CanonicalObservationKind.State);
    const branch = scenario.id.startsWith("structured-composition-invoice-") ? scenario.id.split("-").at(-1)! : null;
    assert.deepEqual([...new Set(states.flatMap(state => state.openUserTasks.map(task => task.id.elementId)))],
      branch === null ? ["assess", "archive"] : ["assess", branch, "archive"]);
    const archive = states.find(state => state.openUserTasks[0]?.id.elementId === "archive");
    assert.deepEqual(archive?.openUserTasks[0]?.inputs, [binding("archive_in", decision)]);
    for (const observation of result.trace) {
      if (observation.kind === CanonicalObservationKind.Command && observation.commandId.startsWith("refuse-")) {
        assert.equal(observation.outcome, CommandOutcome.Rejected);
      }
    }
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Copied-input mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement);
    assert.throws(() => pipelineCase.injectMutation(mutated), /requires the exact copied invoice input/u);
  }
});
