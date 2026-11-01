/**
 * CSSD-ADMIT-01 and CSSD-ROUTE-01 over the retained Order fulfilment and Loan assessment models through the exact-bytes
 * source path. The oracle is the proposal's witness-model account: both compile under the nested scope-data profile, are
 * routed to the concurrent account, and require exactly their Start-bound business object. Every refusal is a one-fact
 * mutation of an admitted retained model, so a gate that refused every concurrent model could not pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  concurrentStructuredScopeDataProgram, isWellFormedSemanticProcessProgram, structuredScopeDataCheckedAnalysis,
  structuredScopeDataProgramAnalysis,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-nested-embedded-scope-data-draft";
const directory = new URL("../../../scenarios/concurrent-structured-scope-data/", import.meta.url);

type Model = "order-fulfilment" | "loan-assessment";

const source = async (model: Model): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** Which overlay a compilation carries: the model's retained one, none, or one binding exactly the named handlers. */
type OverlayChoice = "retained" | "none" | readonly string[];

const effectProtocol = "urn:bpmn-lean:effect-protocol:activity-v1";

async function overlayBytes(model: Model, choice: Exclude<OverlayChoice, "none">): Promise<Uint8Array> {
  if (choice === "retained") return readFile(new URL(`${model}-overlay.json`, directory));
  return new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: `${model}-handlers`, semanticProfile,
    effectBindings: choice.map(operation => ({ source: { implementation: effectProtocol, delegateExpression: `\${${operation}}` },
      descriptor: { protocol: effectProtocol, operation } })), inertAttributes: [] }));
}

async function compile(model: Model, xml: string, choice: OverlayChoice = "retained") {
  const bytes = choice === "none" ? null : await overlayBytes(model, choice);
  const sourceOverlay = bytes === null
    ? null : { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

async function admitted(model: Model, xml: string): Promise<SemanticProcessProgram> {
  const result = await compile(model, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.deepEqual(structuredScopeDataCheckedAnalysis(result.checkedProcess),
    structuredScopeDataProgramAnalysis(result.semanticProcess));
  return result.semanticProcess;
}

async function refused(model: Model, xml: string, label: string, choice: OverlayChoice = "retained"): Promise<void> {
  assert.equal((await compile(model, xml, choice)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

for (const [model, required] of [["order-fulfilment", ["order"]], ["loan-assessment", ["application"]]] as const) {
  test(`the retained ${model} model is a concurrent Program of the profile requiring only its business object`, async () => {
    const program = await admitted(model, await source(model));
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(concurrentStructuredScopeDataProgram(program), true);
    assert.deepEqual(structuredScopeDataProgramAnalysis(program), required);
  });
}

test("Pick items reading Rate shipment's Process output makes it a required Start name", async () => {
  const xml = replaceOnce(await source("order-fulfilment"),
    '<camunda:inputParameter name="items">${pickList}</camunda:inputParameter>',
    '<camunda:inputParameter name="items">${pickList}</camunda:inputParameter>' +
      '<camunda:inputParameter name="quote">${carrierQuote}</camunda:inputParameter>');
  assert.deepEqual(structuredScopeDataProgramAnalysis(await admitted("order-fulfilment", xml)), ["carrierQuote", "order"]);
});

test("the Loan assessment model is refused without its source overlay, and a Service Task with an empty one", async () => {
  await refused("loan-assessment", await source("loan-assessment"), "no overlay", "none");
  await refused("order-fulfilment", await source("order-fulfilment"), "unbound Service Tasks", []);
});

/** Loan assessment with its two checks in sequence instead of on Parallel branches: a serial model of the profile. */
function withSequentialChecks(xml: string): string {
  let serial = replaceOnce(xml, '<parallelGateway id="SplitAssessment" name="Check credit and value collateral" />', "");
  serial = replaceOnce(serial, '<parallelGateway id="JoinAssessment" name="Credit and collateral assessed" />', "");
  serial = replaceOnce(serial, '<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="SplitAssessment" />',
    '<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="CreditCheck" />');
  serial = replaceOnce(serial, '<sequenceFlow id="Flow_ToCreditCheck" sourceRef="SplitAssessment" targetRef="CreditCheck" />', "");
  serial = replaceOnce(serial,
    '<sequenceFlow id="Flow_ToCollateralValuation" sourceRef="SplitAssessment" targetRef="CollateralValuation" />', "");
  serial = replaceOnce(serial, '<sequenceFlow id="Flow_CreditChecked" sourceRef="CreditCheck" targetRef="JoinAssessment" />',
    '<sequenceFlow id="Flow_CreditChecked" sourceRef="CreditCheck" targetRef="CollateralValuation" />');
  serial = replaceOnce(serial, '<sequenceFlow id="Flow_CollateralValued" sourceRef="CollateralValuation" targetRef="JoinAssessment" />',
    '<sequenceFlow id="Flow_CollateralValued" sourceRef="CollateralValuation" targetRef="AssessmentClosed" />');
  return replaceOnce(serial, '<sequenceFlow id="Flow_Assessed" sourceRef="JoinAssessment" targetRef="AssessmentClosed" />', "");
}

// CSSD-ADMIT-01 leaves serial admission unchanged: an overlay that binds no handler stays refused on a serial model.
test("the empty Loan assessment overlay is refused once its checks run in sequence instead of on Parallel branches", async () => {
  const serial = withSequentialChecks(await source("loan-assessment"));
  await admitted("loan-assessment", await source("loan-assessment"));
  await refused("loan-assessment", serial, "serial model, empty overlay");
  // Control: the same serial model with a binding it does not use is admitted, so only the empty list is refused.
  assert.equal((await compile("loan-assessment", serial, ["recordAssessment"])).status, BpmnCompilationStatus.Accepted);
});

/** Record assessment, a bound Service Task on the Loan assessment root path between Assess application and Decide loan. */
function withRecordAssessment(xml: string): string {
  return replaceOnce(xml,
    '<sequenceFlow id="Flow_ApplicationAssessed" sourceRef="AssessApplication" targetRef="DecideLoan" />',
    `<serviceTask id="RecordAssessment" implementation="${effectProtocol}" camunda:delegateExpression="\${recordAssessment}" ` +
      'camunda:asyncBefore="true" />' +
      '<sequenceFlow id="Flow_ApplicationAssessed" sourceRef="AssessApplication" targetRef="RecordAssessment" />' +
      '<sequenceFlow id="Flow_AssessmentRecorded" sourceRef="RecordAssessment" targetRef="DecideLoan" />');
}

test("a Service Task beside the Calls is refused while the same task without Calls is admitted", async () => {
  const xml = withRecordAssessment(await source("loan-assessment"));
  await refused("loan-assessment", xml, "Service Task beside a Call", ["recordAssessment"]);
  // The control replaces each Call by a User Task of the same id and drops the then uncalled Process.
  const withoutCalls = xml.replace(/<callActivity id="(\w+)"[^]*?<\/callActivity>/gu, '<userTask id="$1" />')
    .replace(/<process id="Process_ExpertReview"[^]*?<\/process>/u, "");
  assert.equal((await compile("loan-assessment", withoutCalls, ["recordAssessment"])).status,
    BpmnCompilationStatus.Accepted, "Service Task without Calls");
});

test("a Call in a forking body and a Call leading a branch body are each refused", async () => {
  const xml = await source("loan-assessment");
  const leading = replaceOnce(replaceOnce(xml,
    '<sequenceFlow id="Flow_CreditCheckOpened" sourceRef="CreditCheckOpened" targetRef="PrepareCreditFile" />', ""),
  '<sequenceFlow id="Flow_CreditFilePrepared" sourceRef="PrepareCreditFile" targetRef="CreditExpertReview" />',
  '<sequenceFlow id="Flow_CreditCheckOpened" sourceRef="CreditCheckOpened" targetRef="CreditExpertReview" />')
    .replace('<userTask id="PrepareCreditFile" name="Prepare credit file" />', "");
  await refused("loan-assessment", leading, "Call leading a branch body");
  // The control drops the valuation Call, so the refused model adds one Call after the join and stays within the
  // profile's two-Call bound: placement alone separates the two.
  const oneCall = replaceOnce(xml.replace(/<callActivity id="ValuationExpertReview"[^]*?<\/callActivity>/u, ""),
    '<sequenceFlow id="Flow_ValuationPrepared" sourceRef="PrepareValuation" targetRef="ValuationExpertReview" />' +
      '\n        <sequenceFlow id="Flow_ValuationReviewed" sourceRef="ValuationExpertReview" targetRef="ValuationClosed" />',
    '<sequenceFlow id="Flow_ValuationPrepared" sourceRef="PrepareValuation" targetRef="ValuationClosed" />');
  assert.equal((await compile("loan-assessment", oneCall)).status, BpmnCompilationStatus.Accepted, "one-Call control");
  const inForkingBody = replaceOnce(replaceOnce(oneCall,
    '<sequenceFlow id="Flow_Assessed" sourceRef="JoinAssessment" targetRef="AssessmentClosed" />',
    '<sequenceFlow id="Flow_Assessed" sourceRef="JoinAssessment" targetRef="FinalReview" />' +
      '<sequenceFlow id="Flow_FinalReviewed" sourceRef="FinalReview" targetRef="AssessmentClosed" />'),
  '<endEvent id="AssessmentClosed" name="Assessment closed" />',
  '<callActivity id="FinalReview" calledElement="Process_ExpertReview"><extensionElements>' +
    '<camunda:in source="file" target="case" /></extensionElements></callActivity>' +
    '<endEvent id="AssessmentClosed" name="Assessment closed" />');
  await refused("loan-assessment", inForkingBody, "Call in a forking body");
});

test("a third Call and a Call to a second called Process are each refused", async () => {
  const xml = await source("loan-assessment");
  const thirdCall = replaceOnce(replaceOnce(xml,
    '<sequenceFlow id="Flow_CreditReviewed" sourceRef="CreditExpertReview" targetRef="CreditCheckClosed" />',
    '<sequenceFlow id="Flow_CreditReviewed" sourceRef="CreditExpertReview" targetRef="CreditRecheck" />' +
      '<sequenceFlow id="Flow_CreditRechecked" sourceRef="CreditRecheck" targetRef="CreditCheckClosed" />'),
  '<endEvent id="CreditCheckClosed" name="Credit check closed" />',
  '<callActivity id="CreditRecheck" calledElement="Process_ExpertReview"><extensionElements>' +
    '<camunda:in source="dossier" target="case" /><camunda:out source="opinion" target="creditOpinion" />' +
    '</extensionElements></callActivity><endEvent id="CreditCheckClosed" name="Credit check closed" />');
  await refused("loan-assessment", thirdCall, "third Call");
  const secondCalled = replaceOnce(replaceOnce(xml,
    'id="ValuationExpertReview" name="Valuation expert review" calledElement="Process_ExpertReview"',
    'id="ValuationExpertReview" name="Valuation expert review" calledElement="Process_ValuerReview"'),
  "</definitions>",
  '<process id="Process_ValuerReview" isExecutable="true"><startEvent id="VS" /><userTask id="VT" />' +
    '<endEvent id="VE" /><sequenceFlow id="VF1" sourceRef="VS" targetRef="VT" />' +
    '<sequenceFlow id="VF2" sourceRef="VT" targetRef="VE" /></process></definitions>');
  await refused("loan-assessment", secondCalled, "second called Process");
});
