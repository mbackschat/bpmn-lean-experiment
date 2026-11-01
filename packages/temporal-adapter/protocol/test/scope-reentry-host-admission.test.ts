/**
 * Hosting preflight of the scope re-entry proposal over its retained claim rework and contract revision models: the host
 * admits each re-entry Program on its serial path, and the Start capacity envelope gives it the Program-level
 * reserved-result checks and no journey, because a cyclic root graph offers no single one (the proposal's capacity
 * section). Serial Programs of the profile keep the full envelope, which the concurrent structured scope data test locks.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEffectCheck, StartCapacityEnvelopeResultKind, TemporalHostCapabilityResultKind, assessStartCapacityEnvelope,
  assessTemporalHostCapability, productionStartCapacityEffectLimits,
} from "../dist/index.js";

const directory = new URL("../../../../scenarios/scope-reentry/", import.meta.url);
type Model = "claim-rework" | "contract-revision";

async function program(model: Model): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL(`${model}-overlay.json`, directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`${model}.bpmn`, directory)), sourceId: `${model}-host`, expectedSha256: undefined,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

const start = (program: SemanticProcessProgram, name: string): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "I".repeat(257),
  initialVariables: [{ name, value: { kind: VariableValueKind.String, value: "draft" } }],
});

for (const [model, required] of [["claim-rework", "claimSummary"], ["contract-revision", "contractText"]] as const) {
  test(`the ${model} model is hosted and keeps only the Program-level reserved-result checks`, async () => {
    const admitted = await program(model);
    assert.deepEqual(assessTemporalHostCapability(admitted), { kind: TemporalHostCapabilityResultKind.Admitted });
    assert.deepEqual(assessStartCapacityEnvelope(start(admitted, required), admitted),
      { kind: StartCapacityEnvelopeResultKind.NotApplicable });
    const limits = { ...productionStartCapacityEffectLimits(), [StartCapacityEffectCheck.ActivityResultBytes]: 1 };
    assert.equal(assessStartCapacityEnvelope(start(admitted, required), admitted, undefined, limits).kind,
      StartCapacityEnvelopeResultKind.EffectTaskExceeded);
  });
}
