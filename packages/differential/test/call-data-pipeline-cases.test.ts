import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, ProcessStatus, StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind, BpmnProcessAdmissionFailureCode } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { callDataPipelineCases } from "./call-data-pipeline-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";

test("supplier Call scenarios bind public admission, normal return and an ownership discriminator", async t => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(callDataPipelineCases)) {
    await t.test(scenario.id, () => {
      const start = scenario.stimuli[0];
      assert.ok(start?.kind === StimulusKind.StartProcess);
      assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
      const malformed = assessBpmnProcessAdmission(start, { ...program, operations: [] });
      assert.equal(malformed.kind, BpmnProcessAdmissionResultKind.Rejected);
      if (malformed.kind !== BpmnProcessAdmissionResultKind.Rejected) assert.fail("Missing Call operations admitted");
      assert.equal(malformed.failure.code, BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported);
      const result = runScenario(scenario, program);
      const final = result.trace.at(-1);
      assert.ok(final?.kind === CanonicalObservationKind.State);
      assert.equal(final.status, ProcessStatus.Completed);
      const mutated = mutableClone(result);
      pipelineCase.injectMutation(mutated);
      const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
        [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
      assert.equal(comparison.kind, ComparisonKind.Disagreement);
      if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Call ownership mutation escaped comparison");
      assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement);
      assert.throws(() => pipelineCase.injectMutation(mutated), /requires the called-owned/u);
    });
  }
});
