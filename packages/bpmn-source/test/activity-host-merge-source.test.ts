/**
 * ACTH-ADMIT-01, ACTH-ONE-01 and ACTH-PROFILE-01 over the retained claim review model through the exact-bytes source
 * path, at the checked and Program levels. The oracle is the approved proposal's "Separating witnesses": the model and
 * its twins lower each merging Task to one Activity host whose inputs are its incoming flows, every single-flow Task
 * keeps its legacy operation, and each refused edit differs from the admitted model in its one named fact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, contractLinks } from "@bpmn-lean/bpmn-source";
import {
  ActivityWorkKind, SemanticOperationKind, SemanticProfileId, isWellFormedSemanticProcessProgram, scopeReentryChecked,
  scopeReentryProgram, structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/activity-host-merge/", import.meta.url);
const model = "claim-review";

const source = async (): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** The model's overlay, its profile relabelled to `semanticProfile` so another profile's refusal is its own gate. */
async function overlay(semanticProfile: string) {
  const retained = JSON.parse(await readFile(new URL(`${model}-overlay.json`, directory), "utf8"));
  const bytes = new TextEncoder().encode(JSON.stringify({ ...retained, semanticProfile }));
  return { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay: await overlay(semanticProfile), limits: semanticProcessTestLimits });
}

async function admitted(xml: string, label: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Both levels route to the re-entry account independently, so a widening at one level only cannot pass. The checked
  // analyses read the Link-free graph (LNK-CONT-01), which is the checked graph itself for a model without Links.
  const checked = contractLinks(result.checkedProcess);
  assert.ok(checked !== undefined, label);
  assert.equal(scopeReentryProgram(result.semanticProcess), true, `${label}: Program route`);
  assert.equal(scopeReentryChecked(checked), true, `${label}: checked route`);
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess), structuredScopeDataCheckedStartNames(checked),
    label);
  return result.semanticProcess;
}

async function refused(xml: string, label: string, semanticProfile?: string): Promise<void> {
  assert.equal((await compile(xml, semanticProfile)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

function only(program: SemanticProcessProgram, elementId: string) {
  const operations = program.operations.filter(({ origin }) => origin.elementId === elementId);
  assert.equal(operations.length, 1, elementId);
  return operations[0]!;
}

const placesOf = (program: SemanticProcessProgram, flows: readonly string[]): readonly string[] =>
  program.controlPlaces.filter(({ origin }) => flows.includes(origin.elementId)).map(({ id }) => id).sort();

test("ACTH-ADMIT-01: each merging Task lowers to one host over its incoming flows", async () => {
  const program = await admitted(await source(), model);
  const review = only(program, "ReviewClaim");
  assert.equal(review.kind, SemanticOperationKind.Activity);
  assert.ok(review.kind === SemanticOperationKind.Activity);
  assert.deepEqual(review.inputs, placesOf(program, ["Flow_Direct", "Flow_OpinionReceived"]));
  assert.deepEqual(review.outputs.map(({ place }) => place), placesOf(program, ["Flow_Reviewed"]));
  assert.equal(review.work.kind, ActivityWorkKind.UserTask);
  const expert = only(program, "ObtainExpertOpinion");
  assert.ok(expert.kind === SemanticOperationKind.Activity);
  assert.deepEqual(expert.inputs, placesOf(program, ["Flow_ToExpert", "Flow_Reopen"]));
  assert.equal(expert.work.kind, ActivityWorkKind.Effect);
});

test("ACTH-ONE-01: a Task with one incoming flow keeps its legacy operation", async () => {
  const program = await admitted(await source(), model);
  assert.equal(only(program, "TriageClaim").kind, SemanticOperationKind.AwaitEffect);
  assert.equal(only(program, "FetchReviewOutcome").kind, SemanticOperationKind.AwaitEffect);
});

test("ACTH-ADMIT-01: the Service and Send Task twins of Review claim merge as well", async () => {
  const xml = await source();
  const service = replaceOnce(xml, '<userTask id="ReviewClaim" name="Review claim" />',
    '<serviceTask id="ReviewClaim" name="Review claim" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
      'camunda:delegateExpression="${obtainExpertOpinion}" camunda:asyncBefore="true" />');
  assert.ok(only(await admitted(service, "Service twin"), "ReviewClaim").kind === SemanticOperationKind.Activity);
  const send = service.replace('<serviceTask id="ReviewClaim"', '<sendTask id="ReviewClaim"');
  assert.ok(only(await admitted(send, "Send twin"), "ReviewClaim").kind === SemanticOperationKind.Activity);
});

test("ACTH-PROFILE-01: the embedded completion profile refuses the merging Task", async () => {
  await refused(await source(), "embedded completion", SemanticProfileId.EmbeddedSubProcessCompletion);
});

test("ACTH-ADMIT-01: a merging Task with two outgoing flows stays refused", async () => {
  const xml = replaceOnce(await source(), '<sequenceFlow id="Flow_Close" sourceRef="Reopen" targetRef="ClaimDecided" />',
    '<sequenceFlow id="Flow_Close" sourceRef="Reopen" targetRef="ClaimDecided" />' +
      '<sequenceFlow id="Flow_Extra" sourceRef="ReviewClaim" targetRef="ClaimDecided" />');
  await refused(xml, "split");
});

test("ACTH-ADMIT-01: arrivals from two Parallel branches stay refused", async () => {
  const xml = replaceOnce(replaceOnce(await source(),
    '<exclusiveGateway id="ExpertNeeded" name="Expert needed?" gatewayDirection="Diverging" default="Flow_Direct" />',
    '<parallelGateway id="ExpertNeeded" name="Expert needed?" gatewayDirection="Diverging" />'),
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(triage,"expert")</conditionExpression>', "");
  await refused(xml, "fork");
});

test("ACTH-ADMIT-01: a merging Task inside a Sub-Process body stays refused", async () => {
  const xml = replaceOnce(await source(), '<userTask id="ReviewClaim" name="Review claim" />',
    '<subProcess id="ReviewClaim" name="Review claim"><startEvent id="ReviewStart" />' +
      '<exclusiveGateway id="Second" gatewayDirection="Diverging" default="Flow_Once" />' +
      '<userTask id="ReviewInner" name="Review inner" /><endEvent id="ReviewEnd" />' +
      '<sequenceFlow id="Flow_InnerStart" sourceRef="ReviewStart" targetRef="Second" />' +
      '<sequenceFlow id="Flow_Once" sourceRef="Second" targetRef="ReviewInner" />' +
      '<sequenceFlow id="Flow_Twice" sourceRef="Second" targetRef="ReviewInner">' +
      '<conditionExpression xsi:type="tFormalExpression">stringEquals(review,"twice")</conditionExpression></sequenceFlow>' +
      '<sequenceFlow id="Flow_InnerDone" sourceRef="ReviewInner" targetRef="ReviewEnd" /></subProcess>');
  // Retargeting the expert path leaves the Sub-Process one incoming flow, so only its body merges. A body merge needs a
  // body split, which the serial walk of each body already refuses; this locks that the host adds no body route.
  await refused(replaceOnce(xml, '<sequenceFlow id="Flow_OpinionReceived" sourceRef="ObtainExpertOpinion" targetRef="ReviewClaim" />',
    '<sequenceFlow id="Flow_OpinionReceived" sourceRef="ObtainExpertOpinion" targetRef="ClaimDecided" />'), "body merge");
});

test("SRE-AVAILABLE-01: a merging Service Task's input written on one incoming path only is a Start name", async () => {
  const xml = replaceOnce(await source(), '<userTask id="ReviewClaim" name="Review claim" />',
    '<serviceTask id="ReviewClaim" name="Review claim" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
      'camunda:delegateExpression="${obtainExpertOpinion}" camunda:asyncBefore="true"><extensionElements>' +
      '<camunda:inputOutput><camunda:inputParameter name="advice">${opinion}</camunda:inputParameter>' +
      '</camunda:inputOutput></extensionElements></serviceTask>');
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  // The direct path reaches Review claim without Obtain expert opinion's write, so `opinion` must be bound at Start.
  assert.ok(structuredScopeDataProgramStartNames(result.semanticProcess)?.required.includes("opinion"));
  assert.ok(structuredScopeDataCheckedStartNames(result.checkedProcess)?.required.includes("opinion"));
});

test("ACTH-ADMIT-01: several incoming flows at a Sub-Process or a Receive Task stay refused", async () => {
  const xml = await source();
  await refused(replaceOnce(xml, '<userTask id="ReviewClaim" name="Review claim" />',
    '<subProcess id="ReviewClaim" name="Review claim"><startEvent id="ReviewStart" />' +
      '<userTask id="ReviewInner" name="Review inner" /><endEvent id="ReviewEnd" />' +
      '<sequenceFlow id="Flow_InnerStart" sourceRef="ReviewStart" targetRef="ReviewInner" />' +
      '<sequenceFlow id="Flow_InnerDone" sourceRef="ReviewInner" targetRef="ReviewEnd" /></subProcess>'), "Sub-Process");
  await refused(replaceOnce(xml, '<userTask id="ReviewClaim" name="Review claim" />',
    '<receiveTask id="ReviewClaim" name="Review claim" />'), "Receive Task");
});

/** Both flows into *Obtain expert opinion* as throws of one Link name, whose one catch leads to `successor`. */
function linkTwin(xml: string, successor: string): string {
  const link = (id: string, kind: "intermediateThrowEvent" | "intermediateCatchEvent") =>
    `<${kind} id="${id}" name="To expert"><linkEventDefinition name="ToExpert" /></${kind}>`;
  return replaceOnce(replaceOnce(replaceOnce(xml,
    '<sequenceFlow id="Flow_ToExpert" sourceRef="ExpertNeeded" targetRef="ObtainExpertOpinion">',
    '<sequenceFlow id="Flow_ToExpert" sourceRef="ExpertNeeded" targetRef="ThrowToExpert">'),
    '<sequenceFlow id="Flow_Reopen" sourceRef="Reopen" targetRef="ObtainExpertOpinion">',
    '<sequenceFlow id="Flow_Reopen" sourceRef="Reopen" targetRef="ThrowReopenToExpert">'),
    '<endEvent id="ClaimDecided" name="Claim decided" />',
    '<endEvent id="ClaimDecided" name="Claim decided" />' + link("ThrowToExpert", "intermediateThrowEvent") +
      link("ThrowReopenToExpert", "intermediateThrowEvent") + link("CatchToExpert", "intermediateCatchEvent") +
      `<sequenceFlow id="Flow_ExpertCaught" sourceRef="CatchToExpert" targetRef="${successor}" />`);
}

test("ACTH-ADMIT-01: two Link throws of one name whose catch leads to a Task make it a merging Task", async () => {
  const xml = await source();
  const program = await admitted(linkTwin(xml, "ObtainExpertOpinion"), "Link twin");
  const expert = only(program, "ObtainExpertOpinion");
  assert.ok(expert.kind === SemanticOperationKind.Activity);
  assert.deepEqual(expert.inputs, placesOf(program, ["Flow_ToExpert", "Flow_Reopen"]));
  // The catch's successor is the Choice, an already admitted joint, so the repeated name stays refused.
  await refused(linkTwin(replaceOnce(xml, '<sequenceFlow id="Flow_Triaged" sourceRef="TriageClaim" targetRef="ExpertNeeded" />',
    '<sequenceFlow id="Flow_Triaged" sourceRef="TriageClaim" targetRef="ThrowTriaged" />' +
      '<intermediateThrowEvent id="ThrowTriaged" name="To expert"><linkEventDefinition name="ToExpert" /></intermediateThrowEvent>'),
    "ExpertNeeded"), "Link into a Choice");
});

test("ACTH-ADMIT-01: Link contraction admits repeated throws only into a merging Task", async () => {
  // Mirrors the Lean contraction check at the checked level: the admitted Link twin, its catch retargeted.
  const { checkedProcess } = await compile(linkTwin(await source(), "ObtainExpertOpinion"));
  assert.ok(checkedProcess !== undefined);
  assert.ok(contractLinks(checkedProcess) !== undefined, "into the merging Service Task");
  const into = (target: string) => ({ ...checkedProcess, sequenceFlows: checkedProcess.sequenceFlows.map(flow =>
    flow.id === "Flow_ExpertCaught" ? { ...flow, targetId: target } : flow) });
  for (const target of ["ExpertNeeded", "Reopen", "ClaimDecided"]) {
    assert.equal(contractLinks(into(target)), undefined, `into ${target}`);
  }
});

test("ACTH-ADMIT-01: two Link throws into a pass-through Manual Task stay refused", async () => {
  // A Manual Task merges as a pass-through node (PTSM-MERGE-01) with explicit flows, so this refusal is the Link rule's.
  const xml = replaceOnce(await source(),
    '<sequenceFlow id="Flow_OpinionReceived" sourceRef="ObtainExpertOpinion" targetRef="ReviewClaim" />',
    '<sequenceFlow id="Flow_OpinionReceived" sourceRef="ObtainExpertOpinion" targetRef="ReviewClaim" />' +
      '<manualTask id="PrepareQuestion" name="Prepare question" />' +
      '<sequenceFlow id="Flow_Prepared" sourceRef="PrepareQuestion" targetRef="ObtainExpertOpinion" />');
  // The explicit-flow twin, both flows retargeted to the Manual Task, is admitted, so the Link version's refusal can
  // only come from the repeated-throw rule.
  const explicit = replaceOnce(replaceOnce(xml,
    '<sequenceFlow id="Flow_ToExpert" sourceRef="ExpertNeeded" targetRef="ObtainExpertOpinion">',
    '<sequenceFlow id="Flow_ToExpert" sourceRef="ExpertNeeded" targetRef="PrepareQuestion">'),
    '<sequenceFlow id="Flow_Reopen" sourceRef="Reopen" targetRef="ObtainExpertOpinion">',
    '<sequenceFlow id="Flow_Reopen" sourceRef="Reopen" targetRef="PrepareQuestion">');
  await admitted(explicit, "explicit-flow twin");
  await refused(linkTwin(xml, "PrepareQuestion"), "Link throws into the Manual Task");
});

test("ACTH-PROFILE-01: every profile but the nested scope-data profile refuses the claim model", async () => {
  const xml = await source();
  for (const profile of Object.values(SemanticProfileId).filter(id => id !== SemanticProfileId.NestedEmbeddedScopeData)) {
    await refused(xml, profile, profile);
  }
});
