/**
 * Hosting preflight of the concurrent structured scope data specification (CSSD-ROUTE-01, CSSD-CAPACITY-01) over the retained
 * order fulfilment and loan assessment models: the host admits a concurrent Program of the nested scope-data profile only
 * while its routed analysis admits it, and the Start capacity envelope gives it the Program-level checks alone, the
 * 256-byte hosting identity bound and the reserved-result checks, and no journey. The serial expense claim model is the
 * control that keeps every envelope result of the serial account. Each refusal is a one-fact change of an admitted case.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind, TemporalHostCapabilityResultKind, assessStartCapacityEnvelope, assessTemporalHostCapability,
  StartCapacityEffectCheck, productionStartCapacityEffectLimits,
} from "../dist/index.js";
import { claimStart, claimValue, nestedScopeProgram } from "./nested-scope-data-capacity-fixture.ts";

const directory = new URL("../../../../scenarios/concurrent-structured-scope-data/", import.meta.url);
type Model = "order-fulfilment" | "loan-assessment";

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

/** The Start of a retained model with a small business object; the envelope never reads its value for these Programs. */
const start = (program: SemanticProcessProgram, instanceId: string, name: string): StartProcessStimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
  initialVariables: [{ name, value: { kind: VariableValueKind.Map, value: [] } }],
});

const models = [["order-fulfilment", "order"], ["loan-assessment", "application"]] as const;

for (const [model, businessObject] of models) {
  test(`the ${model} model is hosted and gets only the Program-level envelope checks`, async () => {
    const admitted = await program(model);
    assert.deepEqual(assessTemporalHostCapability(admitted), { kind: TemporalHostCapabilityResultKind.Admitted });
    assert.deepEqual(assessStartCapacityEnvelope(start(admitted, "I".repeat(256), businessObject), admitted),
      { kind: StartCapacityEnvelopeResultKind.NotApplicable });
    assert.deepEqual(assessStartCapacityEnvelope(start(admitted, "I".repeat(257), businessObject), admitted), {
      kind: StartCapacityEnvelopeResultKind.HostingIdentityExceeded, failure: { configuredBound: 256, identityBytes: 257 } });
  });

}

// Loan assessment has no host-driven wait, so only order fulfilment's concurrent effect waits reach the routed gate.
test("the order fulfilment model without its source overlay is refused hosting, as its routed analysis refuses it", async () => {
  const admitted = await program("order-fulfilment");
  const unrouted = { ...admitted, identity: { ...admitted.identity, sourceOverlay: null } };
  assert.notEqual(assessTemporalHostCapability(unrouted).kind, TemporalHostCapabilityResultKind.Admitted);
});

test("the order fulfilment model keeps the Program-level reserved-result checks of PBV-EFF-05", async () => {
  const admitted = await program("order-fulfilment");
  const production = productionStartCapacityEffectLimits();
  for (const check of [StartCapacityEffectCheck.ActivityResultBytes, StartCapacityEffectCheck.BindingIdentityBytes,
    StartCapacityEffectCheck.PatchIdentityBytes]) {
    const result = assessStartCapacityEnvelope(start(admitted, "Order_1", "order"), admitted, undefined,
      { ...production, [check]: 1 });
    assert.equal(result.kind, StartCapacityEnvelopeResultKind.EffectTaskExceeded, check);
  }
});

test("a serial Program of the profile keeps the serial envelope and no hosting identity bound", async () => {
  const serial = await nestedScopeProgram("expense-claim");
  for (const instanceId of ["Claim_1", "I".repeat(257)]) {
    assert.equal(assessStartCapacityEnvelope(claimStart(serial, instanceId, claimValue(1)), serial).kind,
      StartCapacityEnvelopeResultKind.WithinCapacity, `${instanceId.length}-byte instance`);
  }
});
