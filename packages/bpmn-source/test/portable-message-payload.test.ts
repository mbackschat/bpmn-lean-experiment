/**
 * Locks the structured Message-payload amendment (PBV-MSG-01, PBV-MSG-02) through public commands on the compiled
 * shipment-manifest intake: one SingletonBusinessItem payload is written by value to the associated Property while the
 * subscription is withdrawn atomically; every out-of-domain payload is a semantic rejection with the state unchanged and
 * the subscription live; the closed payload-catch profile keeps its scalar domain; and restoration rechecks every
 * carried value. The oracle is the accepted amendment in the portable business values capsule.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ProcessStatus, SemanticOperationKind, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus,
  initialState, isWellFormedStimulus, observeStableState, runtimeStateCarriesOnlyProfilePortableValues,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableValue } from "@bpmn-lean/semantic-core";
import {
  compilePayloadSource, deliveryFor, integer, list, manifest, map, messagePayloadProfile, payloadSourceXml, renamedIds, shipmentIds, startFor,
  text,
} from "./portable-message-payload-fixture.ts";
import type { PayloadSourceIds } from "./portable-message-payload-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

async function program(ids: PayloadSourceIds = shipmentIds, profile: string = messagePayloadProfile): Promise<SemanticProcessProgram> {
  const compiled = await compilePayloadSource(ids, profile);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.semanticProcess;
}

function committed(p: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(p, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, stimulus.commandId);
  return result.state;
}

function refusedWithSubscriptionLive(p: SemanticProcessProgram, waiting: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(p, waiting, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, waiting, label);
  assert.equal(result.state.messageWaits.length, 1, label);
}

const utf8Text = (bytes: number, unit = "a") => text(unit.repeat(bytes / new TextEncoder().encode(unit).length));

test("admits the shipment-manifest source and its renamed variant with the payload-catch lowering", async () => {
  for (const ids of [shipmentIds, renamedIds]) {
    const p = await program(ids);
    assert.equal(p.identity.semanticProfile, messagePayloadProfile);
    const operation = p.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitPayloadMessage);
    assert.deepEqual(operation?.kind === SemanticOperationKind.AwaitPayloadMessage ? operation.directOutput : undefined, {
      associationId: ids.association, sourceDataOutputId: ids.dataOutput, sourceDataOutputName: ids.dataOutputName,
      targetPropertyId: ids.property,
    });
  }
});

test("the retained shipment-manifest model is byte-identical to the fixture source", async () => {
  const retained = await readFile(new URL("../../../scenarios/portable-business-message-payload/process.bpmn", import.meta.url), "utf8");
  assert.equal(retained, payloadSourceXml(shipmentIds));
});

test("the closed payload-catch profile keeps its pinned settlement identifiers", async () => {
  for (const ids of [shipmentIds, renamedIds]) {
    assert.equal((await compilePayloadSource(ids, SemanticProfileId.MessagePayloadCatch)).status, BpmnCompilationStatus.Rejected);
  }
  const settlement = await readFile(new URL("../../../scenarios/message-payload-catch/process.bpmn", import.meta.url));
  const compile = (semanticProfile: string) => compileBpmnToSemanticProcess({
    bytes: settlement, sourceId: "settlement", expectedSha256: undefined, semanticProfile, sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
  assert.equal((await compile(SemanticProfileId.MessagePayloadCatch)).status, BpmnCompilationStatus.Accepted);
  assert.equal((await compile(messagePayloadProfile)).status, BpmnCompilationStatus.Accepted);
});

test("PBV-MSG-01: delivers the structured manifest atomically and keeps it exact through Review to termination", async () => {
  for (const ids of [shipmentIds, renamedIds]) {
    const p = await program(ids);
    const waiting = committed(p, initialState, startFor(ids, "manifest-1"));
    assert.equal(waiting.messageWaits.length, 1);
    const reviewing = committed(p, waiting, deliveryFor(ids, "manifest-1", manifest()));
    assert.deepEqual(reviewing.messageWaits, []);
    assert.deepEqual(reviewing.variables.process.bindings, [{ name: ids.property, value: manifest() }]);
    assert.deepEqual(reviewing.userTaskWaits.map(({ id }) => id.elementId), [ids.task]);
    assert.deepEqual(observeStableState(p, reviewing)?.variables, [{ name: ids.property, value: manifest() }]);
    const done = committed(p, reviewing, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: reviewing.userTaskWaits[0]!.id, submittedValues: [],
    });
    const observed = observeStableState(p, done);
    assert.equal(observed?.status, ProcessStatus.Completed);
    assert.deepEqual(observed?.variables, [{ name: ids.property, value: manifest() }]);
  }
});

test("PBV-MSG-01: the root String bound counts UTF-8 bytes and an over-long String is a semantic rejection", async () => {
  const p = await program();
  for (const [index, unit] of ["a", "é"].entries()) {
    const instance = `bound-${index}`;
    const waiting = committed(p, initialState, startFor(shipmentIds, instance));
    const exact = deliveryFor(shipmentIds, instance, utf8Text(1024, unit));
    const over = deliveryFor(shipmentIds, instance, text(`${unit.repeat(1024 / new TextEncoder().encode(unit).length)}a`));
    assert.equal(isWellFormedStimulus(over), true, "within the wire bounds, so only the profile domain refuses it");
    refusedWithSubscriptionLive(p, waiting, over, `1,025 bytes of ${unit}`);
    assert.deepEqual(committed(p, waiting, exact).variables.process.bindings, [{ name: shipmentIds.property, value: exact.payload }]);
  }
});

test("PBV-MSG-01: a root List, a root stringList and a payload-free delivery are refused with the subscription live", async () => {
  const p = await program();
  const waiting = committed(p, initialState, startFor(shipmentIds, "refusals"));
  const payloads: ReadonlyArray<VariableValue> = [list(text("P-1")), { kind: VariableValueKind.StringList, value: ["P-1"] }];
  for (const payload of payloads) {
    const stimulus = deliveryFor(shipmentIds, "refusals", payload);
    assert.equal(isWellFormedStimulus(stimulus), true, payload.kind);
    refusedWithSubscriptionLive(p, waiting, stimulus, payload.kind);
  }
  const { payload: _payload, ...rest } = deliveryFor(shipmentIds, "refusals", manifest());
  refusedWithSubscriptionLive(p, waiting, { ...rest, kind: StimulusKind.DeliverMessage }, "payload-free delivery");
});

test("a Map holding a stringList member and an over-bound Map are malformed at the wire boundary", () => {
  const stringListMember = { kind: VariableValueKind.Map, value: [{ name: "refs", value: { kind: VariableValueKind.StringList, value: ["a"] } }] };
  assert.equal(isWellFormedStimulus(deliveryFor(shipmentIds, "wire", stringListMember as unknown as VariableValue)), false);
  const members = (count: number) => map(...Array.from({ length: count }, (_, index) => [`k${String(index).padStart(2, "0")}`, integer(index)] as const));
  assert.equal(isWellFormedStimulus(deliveryFor(shipmentIds, "wire", members(32))), true, "exactly 32 members");
  assert.equal(isWellFormedStimulus(deliveryFor(shipmentIds, "wire", members(33))), false, "one over 32 members");
});

test("the closed payload-catch profile refuses the structured manifest with the subscription live", async () => {
  const settlement = await readFile(new URL("../../../scenarios/message-payload-catch/process.bpmn", import.meta.url));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: settlement, sourceId: "settlement", expectedSha256: undefined, semanticProfile: SemanticProfileId.MessagePayloadCatch,
    sourceOverlay: null, limits: semanticProcessTestLimits,
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("unreachable");
  const p = compiled.semanticProcess;
  const settlementIds = {
    ...shipmentIds, process: "Process_MessagePayloadSettlement", catchEvent: "MessageCatch_SettlementConfirmed",
    interface: "Interface_ClearingHouse", operation: "Operation_ConfirmSettlement", message: "Message_SettlementConfirmed",
  };
  const waiting = committed(p, initialState, startFor(settlementIds, "closed"));
  refusedWithSubscriptionLive(p, waiting, deliveryFor(settlementIds, "closed", manifest()), "closed profile");
  assert.equal(committed(p, waiting, deliveryFor(settlementIds, "closed", text("ref"))).messageWaits.length, 0);
});

test("Process Start and User Task completion keep empty value domains", async () => {
  const p = await program();
  const start = startFor(shipmentIds, "domains");
  const structuredStart = applyStimulus(p, initialState, { ...start, initialVariables: [{ name: shipmentIds.property, value: manifest() }] });
  assert.equal(structuredStart.outcome, CommandOutcome.Rejected);
  const reviewing = committed(p, committed(p, initialState, start), deliveryFor(shipmentIds, "domains", manifest()));
  const result = applyStimulus(p, reviewing, {
    kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: reviewing.userTaskWaits[0]!.id,
    submittedValues: [{ name: "note", value: text("ok") }],
  });
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, reviewing);
});

test("restoration requires every carried value to be a SingletonBusinessItem, and the closed profile refuses structure", async () => {
  const p = await program();
  const reviewing = committed(p, committed(p, initialState, startFor(shipmentIds, "restore")), deliveryFor(shipmentIds, "restore", manifest()));
  const withProperty = (value: VariableValue): RuntimeState => ({
    ...reviewing, variables: { ...reviewing.variables, process: { bindings: [{ name: shipmentIds.property, value }] } },
  });
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(messagePayloadProfile, reviewing), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(messagePayloadProfile, withProperty(utf8Text(1024))), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(messagePayloadProfile, withProperty(list(text("P-1")))), false, "root List");
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(messagePayloadProfile, withProperty(utf8Text(1025))), false, "over-long root String");
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(messagePayloadProfile,
    withProperty({ kind: VariableValueKind.StringList, value: ["a"] })), false, "root stringList");
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(SemanticProfileId.MessagePayloadCatch, reviewing), false, "closed profile");
});

type Tamperable = { kind: string; value?: unknown };

function tamper(value: VariableValue): void {
  const node = value as unknown as Tamperable;
  switch (node.kind) {
    case VariableValueKind.List:
      (node.value as VariableValue[]).forEach(tamper);
      (node.value as VariableValue[]).push({ kind: VariableValueKind.Null });
      return;
    case VariableValueKind.Map:
      (node.value as Array<{ name: string; value: VariableValue }>).forEach((entry) => tamper(entry.value));
      return;
    case VariableValueKind.Decimal:
      (node as unknown as { coefficient: string }).coefficient = "999";
      return;
    default:
      node.kind = VariableValueKind.String;
      node.value = "tampered";
  }
}

test("PBV-MSG-02: mutating the caller-owned payload after commit changes no committed value or publication", async () => {
  const p = await program();
  const waiting = committed(p, initialState, startFor(shipmentIds, "alias"));
  const callerOwned = manifest();
  const reviewing = committed(p, waiting, deliveryFor(shipmentIds, "alias", callerOwned));
  const before = structuredClone(reviewing);
  const observedBefore = structuredClone(observeStableState(p, reviewing));
  tamper(callerOwned);
  assert.deepEqual(reviewing, before);
  assert.deepEqual(observeStableState(p, reviewing), observedBefore);
  assert.deepEqual(reviewing.variables.process.bindings, [{ name: shipmentIds.property, value: manifest() }]);
});
