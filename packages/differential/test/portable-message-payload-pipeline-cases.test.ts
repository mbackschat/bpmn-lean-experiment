/**
 * Locks the registered shipment-manifest schedules against the structured Message-payload amendment's decisive witnesses
 * without Lean or Temporal: a manifest with two equal parcels, a negative scale-two Decimal, a nested consignee Map with a
 * present Null and a Boolean reaches the Review wait and termination whole, and a payload-free delivery is refused with
 * the subscription live before the same manifest is accepted.
 *
 * Expected values are rebuilt here from the capsule's definition of the manifest, never read from a produced trace, and
 * every named seeded mutation must move a compared observation. A root List payload is a typed refusal outside the
 * scenario domain, so the cross-target value matrix owns it rather than a retained schedule.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind, runScenario,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { portableMessagePayloadPipelineCases } from "./portable-message-payload-pipeline-cases.ts";
import { domainCases } from "./scenario-value-domain-cases.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
const parcel = (reference: string, kilograms: number) => map(["reference", text(reference)], ["weightKg", integer(kilograms)]);
const manifest = map(
  ["consignee", map(["line1", text("Harbour Road 4")], ["line2", nothing])],
  ["declaredValue", { kind: VariableValueKind.Decimal, coefficient: "-123455", scale: 2 }],
  ["hazardous", { kind: VariableValueKind.Boolean, value: false }],
  ["parcels", list(parcel("P-1", 12), parcel("P-1", 12), parcel("P-2", 3))],
);
const received: VariableBinding = { name: "Property_ShipmentManifest", value: manifest };
const reviewTask = "UserTask_ReviewManifest";

test("registers exactly the two decisive schedules over one retained model", async () => {
  assert.deepEqual(portableMessagePayloadPipelineCases.map(({ id }) => id),
    ["portable-message-payload-manifest-delivered", "portable-message-payload-manifest-payload-free-refused"]);
  const bytes = await readFile(new URL("../../../scenarios/portable-business-message-payload/process.bpmn", import.meta.url));
  for (const context of await loadAndCompileCases(portableMessagePayloadPipelineCases)) {
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(context.scenario.profile, SemanticProfileId.PortableBusinessMessagePayload);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("the manifest reaches the Review wait whole, survives to completion and releases the subscription", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(portableMessagePayloadPipelineCases)) {
    const result = runScenario(scenario, program);
    const states = result.trace.filter((observation) => observation.kind === CanonicalObservationKind.State);
    const reviewing = states.find((state) => state.openUserTasks[0]?.id.elementId === reviewTask);
    assert.deepEqual(reviewing?.variables, [received], scenario.id);
    assert.deepEqual(reviewing?.openMessageSubscriptions, [], scenario.id);
    const final = states.at(-1);
    assert.equal(final?.status, ProcessStatus.Completed, scenario.id);
    assert.deepEqual(final?.variables, [received], scenario.id);
  }
});

test("a payload-free delivery is refused with the subscription live and no Process data written", async () => {
  const context = (await loadAndCompileCases(portableMessagePayloadPipelineCases))
    .find(({ scenario }) => scenario.id.endsWith("payload-free-refused"))!;
  const result = runScenario(context.scenario, context.semanticProcess);
  const refusalIndex = result.trace.findIndex((observation) =>
    observation.kind === CanonicalObservationKind.Command && observation.commandId === "refuse-payload-free");
  const refusal = result.trace[refusalIndex];
  assert.ok(refusal?.kind === CanonicalObservationKind.Command);
  assert.equal(refusal.outcome, CommandOutcome.Rejected);
  const after = result.trace[refusalIndex + 1];
  assert.ok(after?.kind === CanonicalObservationKind.State);
  assert.equal(after.openMessageSubscriptions.length, 1);
  assert.deepEqual(after.variables, []);
  const delivery = result.trace.find((observation) =>
    observation.kind === CanonicalObservationKind.Command && observation.commandId === "deliver-manifest");
  assert.ok(delivery?.kind === CanonicalObservationKind.Command);
  assert.equal(delivery.outcome, CommandOutcome.Committed);
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(portableMessagePayloadPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(portableMessagePayloadPipelineCases)) {
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

test("the cross-target value matrix expects the SingletonBusinessItem payload domain from the retained schedules", async () => {
  const cases = (await domainCases()).filter(({ context }) => context.scenario.profile === SemanticProfileId.PortableBusinessMessagePayload);
  assert.ok(cases.length > 10, "the profile must contribute its own matrix cases");
  for (const input of cases) {
    assert.equal(supportsSemanticProcessScenario(input.scenario, input.context.semanticProcess), input.supported, input.scenario.id);
  }
  const supportedByLabel = new Map(cases.map(({ scenario, supported }) =>
    [scenario.id.replace(/^portable-message-payload-manifest-delivered-/u, ""), supported]));
  for (const [label, supported] of [["payload-map", true], ["payload-decimal", true], ["payload-null", true], ["payload-list", false],
    ["payload-stringList", false], ["payload-string-exact-bound", true], ["payload-string-over-bound", false],
    ["start-map", false], ["human-map", false]] as const) {
    assert.equal(supportedByLabel.get(label), supported, label);
  }
});
