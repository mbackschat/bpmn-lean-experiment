/**
 * ACSP-ADMIT-01, ACSP-ONE-01, ACSP-SINGLE-01 and ACSP-PROFILE-01 over the retained insurance claim intake model through
 * the exact-bytes source path, at the checked and Program levels. The oracle is the approved proposal's "Separating
 * witnesses": *Register claim* and *Review claim* lower to Activity hosts with one input and every outgoing flow as an
 * output, both levels route the model to the concurrent account, and each refused edit differs from an admitted control
 * in its one named fact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  ActivityWorkKind, SemanticOperationKind, SemanticProfileId, concurrentStructuredScopeDataProgram,
  isWellFormedSemanticProcessProgram, scopeReentryProgram, structuredScopeDataCheckedAnalysis,
  structuredScopeDataCheckedStartNames, structuredScopeDataProgramAnalysis, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/activity-host-split/", import.meta.url);
const model = "insurance-claim-intake";

const source = async (): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** The model's overlay, relabelled to `semanticProfile` and without the bindings `dropped` names. */
async function overlay(semanticProfile: string, dropped: readonly string[] = []) {
  const retained = JSON.parse(await readFile(new URL(`${model}-overlay.json`, directory), "utf8"));
  const effectBindings = retained.effectBindings.filter(({ descriptor }: { descriptor: { operation: string } }) =>
    !dropped.includes(descriptor.operation));
  const bytes = new TextEncoder().encode(JSON.stringify({ ...retained, semanticProfile, effectBindings }));
  return { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData,
  dropped: readonly string[] = []) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay: await overlay(semanticProfile, dropped), limits: semanticProcessTestLimits });
}

async function admitted(xml: string, label: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Each level admits the model independently, so a widening at one level only cannot pass (wrong algorithm 1).
  assert.notEqual(structuredScopeDataProgramAnalysis(result.semanticProcess), null, `${label}: Program analysis`);
  assert.notEqual(structuredScopeDataCheckedAnalysis(result.checkedProcess), null, `${label}: checked analysis`);
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result.semanticProcess;
}

async function refused(xml: string, label: string, semanticProfile?: string, dropped?: readonly string[]): Promise<void> {
  assert.equal((await compile(xml, semanticProfile, dropped)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

function only(program: SemanticProcessProgram, elementId: string, kind: SemanticOperationKind) {
  const operations = program.operations.filter((operation) => operation.origin.elementId === elementId &&
    operation.kind === kind);
  assert.equal(operations.length, 1, `${elementId} ${kind}`);
  return operations[0]!;
}

const placesOf = (program: SemanticProcessProgram, flows: readonly string[]): readonly string[] =>
  program.controlPlaces.filter(({ origin }) => flows.includes(origin.elementId)).map(({ id }) => id).sort();

const flow = (id: string, from: string, to: string): string =>
  `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />`;

test("ACSP-ADMIT-01: a splitting Service Task and User Task lower to hosts over every outgoing flow", async () => {
  const program = await admitted(await source(), model);
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(register.kind === SemanticOperationKind.Activity && register.work.kind === ActivityWorkKind.Effect);
  assert.deepEqual(register.inputs, placesOf(program, ["Flow_ToRegister"]));
  assert.deepEqual(register.outputs.map(({ place }) => place), placesOf(program, ["Flow_ToArchive", "Flow_ToBroker"]));
  const review = only(program, "ReviewClaim", SemanticOperationKind.Activity);
  assert.ok(review.kind === SemanticOperationKind.Activity && review.work.kind === ActivityWorkKind.UserTask);
  assert.deepEqual(review.inputs, placesOf(program, ["Flow_ToReview"]));
  assert.deepEqual(review.outputs.map(({ place }) => place), placesOf(program, ["Flow_ToAssessment", "Flow_ToCustomer"]));
  // Wrong algorithm 4: the split is the host's own step, never a separate `duplicate`.
  assert.equal(program.operations.some(({ kind }) => kind === SemanticOperationKind.Duplicate), false);
  // Wrong algorithm 9: the Program alone routes the splitting hosts to the concurrent account.
  assert.equal(concurrentStructuredScopeDataProgram(program), true);
  assert.equal(scopeReentryProgram(program), false);
});

test("ACSP-ONE-01: one-flow Tasks keep their legacy operations", async () => {
  const program = await admitted(await source(), model);
  only(program, "ArchiveDocuments", SemanticOperationKind.AwaitUserTask);
  only(program, "NotifyBroker", SemanticOperationKind.AwaitEffect);
  only(program, "OrderAssessment", SemanticOperationKind.AwaitEffect);
  only(program, "DecideClaim", SemanticOperationKind.AwaitUserTask);
});

test("ACSP-ADMIT-01: a splitting Send Task lowers to a host like a Service Task", async () => {
  const xml = (await source()).replace(/<serviceTask id="RegisterClaim"([\s\S]*?)<\/serviceTask>/u,
    (_, body: string) => `<sendTask id="RegisterClaim"${body.replace(
      /\s*<camunda:outputParameter[^>]*>[^<]*<\/camunda:outputParameter>/u, "")}</sendTask>`);
  const program = await admitted(xml, "Send Task twin");
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(register.kind === SemanticOperationKind.Activity && register.work.kind === ActivityWorkKind.Effect);
  assert.equal(register.outputs.length, 2);
});

test("ACSP-SINGLE-01: a split on a branch of another split, or below one, is refused", async () => {
  const xml = await source();
  // *Order assessment* feeds two checks that rejoin before *Review done*: through an explicit fork (admitted) or by
  // splitting itself on the branch of *Review claim*'s split (wrong algorithm 5), which differs in that fact alone.
  const nested = (explicit: boolean) => replaceOnce(replaceOnce(xml, flow("Flow_Assessed", "OrderAssessment", "ReviewDone"),
    (explicit ? `${flow("Flow_ToAssessFork", "OrderAssessment", "AssessFork")}${flow("Flow_ToCheckA", "AssessFork", "CheckA")}` +
      flow("Flow_ToCheckB", "AssessFork", "CheckB")
      : `${flow("Flow_ToCheckA", "OrderAssessment", "CheckA")}${flow("Flow_ToCheckB", "OrderAssessment", "CheckB")}`) +
    `${flow("Flow_CheckedA", "CheckA", "ChecksDone")}${flow("Flow_CheckedB", "CheckB", "ChecksDone")}` +
    flow("Flow_Assessed", "ChecksDone", "ReviewDone")),
  '<endEvent id="ClaimDecided" name="Claim decided" />', '<endEvent id="ClaimDecided" name="Claim decided" />' +
    '<userTask id="CheckA" /><userTask id="CheckB" /><parallelGateway id="ChecksDone" gatewayDirection="Converging" />' +
    (explicit ? '<parallelGateway id="AssessFork" gatewayDirection="Diverging" />' : ""));
  await admitted(nested(true), "explicit fork on a split's branch");
  await refused(nested(false), "split on a split's branch");
  // The ancestor-scope part: *Intake* on a branch of a root Parallel fork, admitted with a serial body and refused while
  // *Register claim* splits in it.
  const serialIntake = replaceOnce(replaceOnce(replaceOnce(xml, flow("Flow_ToBroker", "RegisterClaim", "NotifyBroker"),
    flow("Flow_ToBroker", "ArchiveDocuments", "NotifyBroker")), flow("Flow_Archived", "ArchiveDocuments", "DocumentsArchived"), ""),
  '<endEvent id="DocumentsArchived" name="Documents archived" />', "");
  // The root fork rejoins before *Review claim*, so only *Intake*'s body differs.
  const belowRootFork = (text: string) => replaceOnce(replaceOnce(replaceOnce(text,
    flow("Flow_ToIntake", "ClaimReported", "Intake"),
    `${flow("Flow_ToFork", "ClaimReported", "RootFork")}${flow("Flow_ToIntake", "RootFork", "Intake")}` +
    `${flow("Flow_ToTriage", "RootFork", "TriageClaim")}${flow("Flow_Triaged", "TriageClaim", "RootJoin")}`),
  flow("Flow_ToReview", "Intake", "ReviewClaim"),
  `${flow("Flow_IntakeDone", "Intake", "RootJoin")}${flow("Flow_ToReview", "RootJoin", "ReviewClaim")}`),
  '<userTask id="ReviewClaim" name="Review claim" />',
  '<userTask id="ReviewClaim" name="Review claim" /><parallelGateway id="RootFork" gatewayDirection="Diverging" />' +
    '<userTask id="TriageClaim" /><parallelGateway id="RootJoin" gatewayDirection="Converging" />');
  await admitted(belowRootFork(serialIntake), "serial Intake below a root fork");
  await refused(belowRootFork(xml), "split below a root fork's branch");
});

test("ACSP-ADMIT-01: conditioned, default, merging, Error-routed and boundary forms stay refused", async () => {
  const xml = await source();
  const conditioned = replaceOnce(replaceOnce(xml, "<definitions ",
    '<definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '),
  flow("Flow_ToCustomer", "ReviewClaim", "InformCustomer"),
  '<sequenceFlow id="Flow_ToCustomer" sourceRef="ReviewClaim" targetRef="InformCustomer">' +
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(claimSummary,"x")</conditionExpression></sequenceFlow>');
  await refused(conditioned, "conditioned outgoing flow");
  await refused(replaceOnce(xml, '<userTask id="ReviewClaim" name="Review claim" />',
    '<userTask id="ReviewClaim" name="Review claim" default="Flow_ToCustomer" />'), "default outgoing flow");
  await refused(replaceOnce(xml, flow("Flow_Decided", "DecideClaim", "ClaimDecided"),
    `${flow("Flow_Decided", "DecideClaim", "ClaimDecided")}${flow("Flow_Again", "ArchiveDocuments", "ReviewClaim")}`),
  "second incoming flow while splitting");
  await refused(replaceOnce(xml, '<userTask id="DecideClaim" name="Decide claim" />',
    '<userTask id="DecideClaim" name="Decide claim" /><boundaryEvent id="BrokerReplied" attachedToRef="ReviewClaim">' +
      '<messageEventDefinition /></boundaryEvent><endEvent id="Replied" />' +
      flow("Flow_Replied", "BrokerReplied", "Replied")), "Message boundary on a splitting Task");
  await refused(replaceOnce(xml, '<endEvent id="BrokerNotified" name="Broker notified" />',
    '<endEvent id="BrokerNotified" name="Broker notified" /><boundaryEvent id="RegistrationFailed" ' +
      'attachedToRef="RegisterClaim"><errorEventDefinition /></boundaryEvent><endEvent id="Failed" />' +
      flow("Flow_Failed", "RegistrationFailed", "Failed")), "BPMN Error route on a splitting Service Task");
});

test("ACSP-ADMIT-01: the overlay must bind the splitting Service Task's handler", async () => {
  await refused(await source(), "overlay without registerClaim", undefined, ["registerClaim"]);
});

test("ACSP-PROFILE-01: the embedded completion profile refuses the model", async () => {
  await refused(await source(), "embedded completion profile", SemanticProfileId.EmbeddedSubProcessCompletion);
});
