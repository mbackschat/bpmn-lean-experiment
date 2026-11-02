/**
 * RPF-ADMIT-01 witnesses through the exact-bytes source path and the core's checked-graph and Program gates. The oracle
 * is the root Parallel forks proposal's "Separating witnesses": every refused edit differs from an admitted control in
 * one fact, so a gate that refused everything, or kept refusing root forks, could not pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId, concurrentStructuredScopeDataProgram, structuredScopeDataCheckedAnalysis,
  structuredScopeDataProgramAnalysis,
} from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/root-parallel-forks/", import.meta.url);
const onboarding = await readFile(new URL("employee-onboarding.bpmn", directory), "utf8");
const onboardingOverlay = new Uint8Array(await readFile(new URL("employee-onboarding-overlay.json", directory)));
const emptyOverlay = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "loan-intake-handlers",
  semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, effectBindings: [], inertAttributes: [] }));

async function compile(xml: string, overlay: Uint8Array = onboardingOverlay) {
  const id = overlay === onboardingOverlay ? "employee-onboarding-handlers" : "loan-intake-handlers";
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "root-parallel-forks", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
}

async function admitted(label: string, xml: string, overlay?: Uint8Array) {
  const result = await compile(xml, overlay);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

async function refused(label: string, xml: string, overlay?: Uint8Array): Promise<void> {
  const result = await compile(xml, overlay);
  assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [BpmnSourceDiagnosticCode.UnsupportedModel], label);
}

/** `xml` with each `[from, to]` replaced exactly once. */
function edited(xml: string, ...replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => {
    assert.equal(current.split(from).length, 2, from);
    return current.replace(from, to);
  }, xml);
}

const flow = (id: string, from: string, to: string) => `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />`;
const reviewProcess = `<process id="Process_ExpertReview" isExecutable="true"><startEvent id="ReviewRequested" />` +
  `<userTask id="GiveOpinion" /><endEvent id="ReviewCompleted" />${flow("Flow_ReviewRequested", "ReviewRequested",
    "GiveOpinion")}${flow("Flow_OpinionGiven", "GiveOpinion", "ReviewCompleted")}</process>`;
const mappedCall = (id: string) => `<callActivity id="${id}" calledElement="Process_ExpertReview"><extensionElements>` +
  `<camunda:in source="employee" target="case" /><camunda:out source="opinion" target="${id}Opinion" />` +
  `</extensionElements></callActivity>`;

test("RPF-ADMIT-01 admits the onboarding model's root fork as a concurrent Program requiring employee", async () => {
  const { checkedProcess, semanticProcess } = await admitted("onboarding", onboarding);
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), true);
  assert.deepEqual(structuredScopeDataCheckedAnalysis(checkedProcess), ["employee"]);
  assert.deepEqual(structuredScopeDataProgramAnalysis(semanticProcess), ["employee"]);
});

test("the onboarding branches run in sequence stay on the serial route", async () => {
  const serial = edited(onboarding,
    [flow("Flow_HireRecorded", "HireRecorded", "StartOnboarding"), flow("Flow_HireRecorded", "HireRecorded", "PrepareWorkstation")],
    [flow("Flow_ToWorkstation", "StartOnboarding", "PrepareWorkstation"), ""],
    [flow("Flow_ToDocuments", "StartOnboarding", "CollectDocuments"), ""],
    [flow("Flow_LaptopOrdered", "OrderLaptop", "OnboardingReady"), flow("Flow_LaptopOrdered", "OrderLaptop", "CollectDocuments")],
    [flow("Flow_DocumentsCollected", "CollectDocuments", "OnboardingReady"),
      flow("Flow_DocumentsCollected", "CollectDocuments", "HoldWelcomeMeeting")],
    [flow("Flow_Ready", "OnboardingReady", "HoldWelcomeMeeting"), ""],
    [`<parallelGateway id="StartOnboarding" name="Start onboarding" />`, ""],
    [`<parallelGateway id="OnboardingReady" name="Onboarding ready" />`, ""]);
  const { semanticProcess } = await admitted("serial onboarding", serial);
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), false);
});

test("RPF-ADMIT-01 refuses each one-fact edit of the onboarding model that leaves the class", async () => {
  await refused("terminal root fork with a second root End", edited(onboarding,
    [flow("Flow_LaptopOrdered", "OrderLaptop", "OnboardingReady"), flow("Flow_LaptopOrdered", "OrderLaptop", "LaptopOrdered")],
    [flow("Flow_DocumentsCollected", "CollectDocuments", "OnboardingReady"),
      flow("Flow_DocumentsCollected", "CollectDocuments", "HoldWelcomeMeeting")],
    [flow("Flow_Ready", "OnboardingReady", "HoldWelcomeMeeting"), ""],
    [`<parallelGateway id="OnboardingReady" name="Onboarding ready" />`, `<endEvent id="LaptopOrdered" />`]));
  await refused("mapped Call at the forking root", edited(onboarding,
    [flow("Flow_HireRecorded", "HireRecorded", "StartOnboarding"),
      `${mappedCall("CheckReferences")}${flow("Flow_HireRecorded", "HireRecorded", "CheckReferences")}${
        flow("Flow_ReferencesChecked", "CheckReferences", "StartOnboarding")}`],
    ["</definitions>", `${reviewProcess}</definitions>`]));
  await refused("pass-through Manual Task on a root branch", edited(onboarding,
    [flow("Flow_ToWorkstation", "StartOnboarding", "PrepareWorkstation"),
      `<manualTask id="HandOverBadge" />${flow("Flow_ToWorkstation", "StartOnboarding", "HandOverBadge")}${
        flow("Flow_BadgeHandedOver", "HandOverBadge", "PrepareWorkstation")}`]));
  await refused("root Exclusive merge closing the root branches", edited(onboarding,
    [`<parallelGateway id="OnboardingReady" name="Onboarding ready" />`, `<exclusiveGateway id="OnboardingReady" />`]));
});

/** Loan intake: a mapped root Call, then a Sub-Process whose body forks into two User Tasks; `rootFork` forks the root. */
function loanIntake(rootFork: boolean): string {
  const body = `<subProcess id="AssessApplication"><startEvent id="AssessmentOpened" /><parallelGateway id="SplitAssessment" />` +
    `<userTask id="CheckCredit" /><userTask id="ValueCollateral" /><parallelGateway id="JoinAssessment" />` +
    `<endEvent id="AssessmentClosed" />${flow("Flow_A1", "AssessmentOpened", "SplitAssessment")}${
      flow("Flow_A2", "SplitAssessment", "CheckCredit")}${flow("Flow_A3", "SplitAssessment", "ValueCollateral")}${
      flow("Flow_A4", "CheckCredit", "JoinAssessment")}${flow("Flow_A5", "ValueCollateral", "JoinAssessment")}${
      flow("Flow_A6", "JoinAssessment", "AssessmentClosed")}</subProcess>`;
  const root = rootFork
    ? `<parallelGateway id="RootSplit" /><parallelGateway id="RootJoin" />${flow("Flow_R1", "ApplicationReceived", "RootSplit")}${
      flow("Flow_R2", "RootSplit", "Triage")}${flow("Flow_R3", "RootSplit", "AssessApplication")}${
      flow("Flow_R4", "Triage", "RootJoin")}${flow("Flow_R5", "AssessApplication", "RootJoin")}${
      flow("Flow_R6", "RootJoin", "LoanTaken")}`
    : `${flow("Flow_R1", "ApplicationReceived", "Triage")}${flow("Flow_R2", "Triage", "AssessApplication")}${
      flow("Flow_R3", "AssessApplication", "LoanTaken")}`;
  return `<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
    `xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_LoanIntake" targetNamespace="urn:loan-intake">` +
    `<process id="Process_LoanIntake" isExecutable="true"><startEvent id="ApplicationReceived" />${mappedCall("Triage")}${
      body}<endEvent id="LoanTaken" />${root}</process>${reviewProcess}</definitions>`;
}

// Only the root-Call clause refuses the forking variant: the shared analysis admits it once that clause is removed,
// which was checked by mutation on 2026-11-02, so the pair separates both wrong placements of the clause.
test("RPF-ADMIT-01 keeps a root Call before a body fork admitted and refuses it beside a root fork", async () => {
  const { semanticProcess } = await admitted("root Call before a body fork", loanIntake(false), emptyOverlay);
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), true);
  await refused("root Call on a root branch", loanIntake(true), emptyOverlay);
});
