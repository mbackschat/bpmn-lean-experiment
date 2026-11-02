/**
 * SRE-ADMIT-01, SRE-CYCLE-01, SRE-AVAILABLE-01 and SRE-BURST-01 over the retained scope re-entry models through the
 * exact-bytes source path. The oracle is the approved proposal's witness account: each retained model compiles under
 * the nested scope-data profile with the Start names and burst read off its topology, and each refusal is an edit of an
 * admitted model, so a gate that refused every cyclic model could not pass. Burst figures count the operations the
 * scheduler fires, as `SRE-BURST-01` states; the runtime test checks them against actual closure.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, lowerCheckedProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, isWellFormedSemanticProcessProgram, nestedScopeProgramModel, scopeDataStructureAdmitted, scopeReentryProgram, structuredScopeDataCheckedStartNames, scopeReentryCheckedAnalysis, scopeReentryProgramAnalysis,
  structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { ScopeReentryAnalysis } from "@bpmn-lean/semantic-core";
import { edit, editDraft, inspectDamage, nest, passThroughOnBackEdge, reviseFlow, reworkFlow } from "./scope-reentry-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-nested-embedded-scope-data-draft";
const directory = new URL("../../../scenarios/scope-reentry/", import.meta.url);

type Model = "claim-rework" | "contract-revision";

const source = async (model: Model): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

async function compile(model: Model, xml: string) {
  const bytes = await readFile(new URL(`${model}-overlay.json`, directory));
  const sourceOverlay = { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

/** Admits the model, checks both analysis levels agree and the Program is routed to the re-entry account. */
async function admitted(model: Model, xml: string): Promise<ScopeReentryAnalysis> {
  const result = await compile(model, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const analysis = scopeReentryProgramAnalysis(result.semanticProcess);
  assert.ok(analysis !== null);
  assert.deepEqual(scopeReentryCheckedAnalysis(result.checkedProcess), analysis);
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess), analysis);
  return analysis;
}

async function refused(model: Model, xml: string, label: string): Promise<void> {
  assert.equal((await compile(model, xml)).status, BpmnCompilationStatus.Rejected, label);
}

test("the claim rework model requires only its summary and bursts at most six steps", async () => {
  assert.deepEqual(await admitted("claim-rework", await source("claim-rework")),
    { required: ["claimSummary"], optional: null, burst: 6 });
});

test("the contract revision model requires its text, admits the returned verdict and bursts six steps after review", async () => {
  assert.deepEqual(await admitted("contract-revision", await source("contract-revision")),
    { required: ["contractText"], optional: ["legalVerdict"], burst: 6 });
});

test("a caller-side burst of exactly eight is admitted and one of nine is refused at admission", async () => {
  const claim = await source("claim-rework");
  assert.equal((await admitted("claim-rework", nest(claim, inspectDamage, "InspectDamage", 2))).burst, 8);
  await refused("claim-rework", passThroughOnBackEdge(claim, reworkFlow, "AssessmentRequested", '<endEvent id="ClaimClosed"'),
    "nine-step rework burst");
});

test("a burst critical inside the called Process is bounded through the Call's return", async () => {
  const contract = await source("contract-revision");
  assert.equal((await admitted("contract-revision", nest(contract, editDraft, "EditDraft", 2))).burst, 8);
  await refused("contract-revision", passThroughOnBackEdge(contract, reviseFlow, "RevisionRequested", '<endEvent id="ContractClosed"'),
    "nine-step burst after Review clauses");
});

test("a read whose only writer lies on the back-edge stays a required Start name", async () => {
  const claim = await source("claim-rework");
  const reader = edit(claim, ['<camunda:inputParameter name="damage">${notes}</camunda:inputParameter>',
    '<camunda:inputParameter name="damage">${notes}</camunda:inputParameter>' +
    '<camunda:inputParameter name="previous">${assessment}</camunda:inputParameter>']);
  assert.deepEqual((await admitted("claim-rework", reader)).required, ["assessment", "claimSummary"]);
  // A writer of `assessment` before the Merge supplies first entry too.
  const written = edit(reader, ['<sequenceFlow id="Flow_Received" sourceRef="ClaimReceived" targetRef="AssessmentRequested" />',
    '<sequenceFlow id="Flow_Received" sourceRef="ClaimReceived" targetRef="Triage" />' +
    '<serviceTask id="Triage" name="Triage claim" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
    'camunda:delegateExpression="${priceRepair}" camunda:asyncBefore="true"><extensionElements><camunda:inputOutput>' +
    '<camunda:inputParameter name="damage">${claimSummary}</camunda:inputParameter>' +
    '<camunda:outputParameter name="assessment">${quote}</camunda:outputParameter>' +
    '</camunda:inputOutput></extensionElements></serviceTask>' +
    '<sequenceFlow id="Flow_Triaged" sourceRef="Triage" targetRef="AssessmentRequested" />']);
  assert.deepEqual((await admitted("claim-rework", written)).required, ["claimSummary"]);
});

test("an internal-only cycle is refused although a User Task lies on the exit path", async () => {
  await refused("claim-rework", edit(await source("claim-rework"),
    ['<sequenceFlow id="Flow_Received" sourceRef="ClaimReceived" targetRef="AssessmentRequested" />',
      '<sequenceFlow id="Flow_Received" sourceRef="ClaimReceived" targetRef="AssessClaim" />'],
    ['<sequenceFlow id="Flow_Assess" sourceRef="AssessmentRequested" targetRef="AssessClaim" />',
      '<sequenceFlow id="Flow_Assess" sourceRef="AssessmentRequested" targetRef="AssessmentOutcome" />'],
    ['<sequenceFlow id="Flow_Assessed" sourceRef="AssessClaim" targetRef="AssessmentOutcome" />',
      '<sequenceFlow id="Flow_Assessed" sourceRef="AssessClaim" targetRef="AssessmentRequested" />']), "internal-only cycle");
});

test("a cycle whose only resumption is inside the called Process is refused", async () => {
  await refused("contract-revision", edit(await source("contract-revision"), [editDraft, ""],
    ['<sequenceFlow id="Flow_DraftOpened" sourceRef="DraftOpened" targetRef="EditDraft" />',
      '<sequenceFlow id="Flow_DraftOpened" sourceRef="DraftOpened" targetRef="DraftReady" />'],
    ['<sequenceFlow id="Flow_Edited" sourceRef="EditDraft" targetRef="DraftReady" />', ""]), "called-only resumption");
});

test("a cycle whose Sub-Process body holds no task is refused", async () => {
  await refused("claim-rework", edit(await source("claim-rework"), [inspectDamage, ""],
    ['<camunda:inputParameter name="notes">${claimSummary}</camunda:inputParameter>', ""],
    [/<serviceTask id="PriceRepair"[\s\S]*?<\/serviceTask>/.exec(await source("claim-rework"))![0], ""],
    ['<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="InspectDamage" />',
      '<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="AssessmentClosed" />'],
    ['<sequenceFlow id="Flow_Inspected" sourceRef="InspectDamage" targetRef="PriceRepair" />', ""],
    ['<sequenceFlow id="Flow_Priced" sourceRef="PriceRepair" targetRef="AssessmentClosed" />', ""]), "task-free body cycle");
});

test("Choices with one or three conditions are refused", async () => {
  const claim = await source("claim-rework");
  await refused("claim-rework", edit(claim,
    [/<sequenceFlow id="Flow_Reject"[\s\S]*?<\/sequenceFlow>/.exec(claim)![0], ""],
    ['<userTask id="NotifyClaimant" name="Notify claimant" />', ""],
    ['<exclusiveGateway id="ClaimClosing" name="Claim closing" gatewayDirection="Converging" />', ""],
    ['<sequenceFlow id="Flow_Notified" sourceRef="NotifyClaimant" targetRef="ClaimClosing" />', ""],
    ['<sequenceFlow id="Flow_Closed" sourceRef="ClaimClosing" targetRef="ClaimClosed" />', ""],
    ['<sequenceFlow id="Flow_Approved" sourceRef="ApproveSettlement" targetRef="ClaimClosing" />',
      '<sequenceFlow id="Flow_Approved" sourceRef="ApproveSettlement" targetRef="ClaimClosed" />']), "one condition");
  await refused("claim-rework", edit(claim, ['<sequenceFlow id="Flow_Approve"',
    '<sequenceFlow id="Flow_Withdraw" sourceRef="AssessmentOutcome" targetRef="ClaimClosing"><conditionExpression ' +
    'xsi:type="tFormalExpression">stringEquals(assessment,"withdrawn")</conditionExpression></sequenceFlow>' +
    '<sequenceFlow id="Flow_Approve"']), "three conditions");
});

test("a Choice inside a Sub-Process body is refused", async () => {
  await refused("contract-revision", edit(await source("contract-revision"),
    ['<sequenceFlow id="Flow_DraftOpened" sourceRef="DraftOpened" targetRef="EditDraft" />',
      '<sequenceFlow id="Flow_DraftOpened" sourceRef="DraftOpened" targetRef="DraftKind" />' +
      '<exclusiveGateway id="DraftKind" gatewayDirection="Diverging" default="Flow_Plain" />' +
      '<exclusiveGateway id="DraftKindJoin" gatewayDirection="Converging" />' +
      '<sequenceFlow id="Flow_Long" sourceRef="DraftKind" targetRef="DraftKindJoin"><conditionExpression ' +
      'xsi:type="tFormalExpression">stringEquals(draft,"long")</conditionExpression></sequenceFlow>' +
      '<sequenceFlow id="Flow_Short" sourceRef="DraftKind" targetRef="DraftKindJoin"><conditionExpression ' +
      'xsi:type="tFormalExpression">stringEquals(draft,"short")</conditionExpression></sequenceFlow>' +
      '<sequenceFlow id="Flow_Plain" sourceRef="DraftKind" targetRef="DraftKindJoin" />' +
      '<sequenceFlow id="Flow_Kinded" sourceRef="DraftKindJoin" targetRef="EditDraft" />']), "body Choice");
});

test("a root body with a second None End is refused", async () => {
  await refused("claim-rework", edit(await source("claim-rework"),
    ['<exclusiveGateway id="ClaimClosing" name="Claim closing" gatewayDirection="Converging" />',
      '<endEvent id="ClaimSettled" name="Claim settled" />'],
    ['<sequenceFlow id="Flow_Notified" sourceRef="NotifyClaimant" targetRef="ClaimClosing" />',
      '<sequenceFlow id="Flow_Notified" sourceRef="NotifyClaimant" targetRef="ClaimClosed" />'],
    ['<sequenceFlow id="Flow_Approved" sourceRef="ApproveSettlement" targetRef="ClaimClosing" />',
      '<sequenceFlow id="Flow_Approved" sourceRef="ApproveSettlement" targetRef="ClaimSettled" />'],
    ['<sequenceFlow id="Flow_Closed" sourceRef="ClaimClosing" targetRef="ClaimClosed" />', ""]), "second root End");
});

test("a model that both forks and chooses is refused", async () => {
  await refused("claim-rework", edit(await source("claim-rework"),
    ['<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="InspectDamage" />',
      '<sequenceFlow id="Flow_AssessmentOpened" sourceRef="AssessmentOpened" targetRef="Split" />' +
      '<parallelGateway id="Split" gatewayDirection="Diverging" /><parallelGateway id="Join" gatewayDirection="Converging" />' +
      '<userTask id="PhotographDamage" name="Photograph damage" />' +
      '<sequenceFlow id="Flow_SplitInspect" sourceRef="Split" targetRef="InspectDamage" />' +
      '<sequenceFlow id="Flow_SplitPhoto" sourceRef="Split" targetRef="PhotographDamage" />' +
      '<sequenceFlow id="Flow_Photographed" sourceRef="PhotographDamage" targetRef="Join" />'],
    ['<sequenceFlow id="Flow_Inspected" sourceRef="InspectDamage" targetRef="PriceRepair" />',
      '<sequenceFlow id="Flow_Inspected" sourceRef="InspectDamage" targetRef="Join" />' +
      '<sequenceFlow id="Flow_Joined" sourceRef="Join" targetRef="PriceRepair" />']), "fork and choose");
});

test("a cycle inside a Sub-Process body, with no root Choice or Merge, is refused by the serial route", async () => {
  // Wraps the claim's whole root cycle in one Sub-Process. Source admission refuses a body Choice before any analysis,
  // so the witness is built on the checked graph and lowered, reaching the routes the relaxed graph policy leaves.
  const result = await compile("claim-rework", await source("claim-rework"));
  assert.ok(result.status === BpmnCompilationStatus.Accepted);
  const checked = result.checkedProcess;
  const root = "scope:Process_ClaimRework";
  const wrapper = "scope:HandleClaim";
  const outer = new Set(["ClaimReceived", "ClaimClosed"]);
  const wrapped = {
    ...checked,
    definitionScopes: [...checked.definitionScopes.map(scope => scope.parentScopeId === root
      ? { ...scope, parentScopeId: wrapper } : scope), { id: wrapper, parentScopeId: root, originElementId: "HandleClaim" }]
      .sort((a, b) => a.id < b.id ? -1 : 1),
    nodes: [...checked.nodes.map(node => node.id === "ClaimReceived" ? { ...node, id: "HandleOpened" }
      : node.id === "ClaimClosed" ? { ...node, id: "HandleClosed" } : node),
    { kind: CheckedNodeKind.NoneStartEvent, id: "ClaimReceived" }, { kind: CheckedNodeKind.NoneEndEvent, id: "ClaimClosed" },
    { kind: CheckedNodeKind.EmbeddedSubProcess, id: "HandleClaim", childScopeId: wrapper }].sort((a, b) => a.id < b.id ? -1 : 1),
    nodeScopes: [...checked.nodeScopes.map(entry => entry.scopeId !== root ? entry
      : { ...entry, nodeId: entry.nodeId === "ClaimReceived" ? "HandleOpened" : entry.nodeId === "ClaimClosed" ? "HandleClosed"
        : entry.nodeId, scopeId: wrapper }),
    ...[...outer, "HandleClaim"].map(nodeId => ({ nodeId, scopeId: root }))].sort((a, b) => a.nodeId < b.nodeId ? -1 : 1),
    sequenceFlows: [...checked.sequenceFlows.map(flow => ({ ...flow,
      sourceId: flow.sourceId === "ClaimReceived" ? "HandleOpened" : flow.sourceId,
      targetId: flow.targetId === "ClaimClosed" ? "HandleClosed" : flow.targetId })),
    { id: "Flow_Handle", sourceId: "ClaimReceived", targetId: "HandleClaim", condition: null },
    { id: "Flow_Handled", sourceId: "HandleClaim", targetId: "ClaimClosed", condition: null }].sort((a, b) => a.id < b.id ? -1 : 1),
    sequenceFlowScopes: [...checked.sequenceFlowScopes.map(entry => entry.scopeId === root ? { ...entry, scopeId: wrapper } : entry),
    { sequenceFlowId: "Flow_Handle", scopeId: root }, { sequenceFlowId: "Flow_Handled", scopeId: root }]
      .sort((a, b) => a.sequenceFlowId < b.sequenceFlowId ? -1 : 1),
  };
  const program = lowerCheckedProcess(wrapped);
  // The vertex model and its scope bounds admit the wrapped Program, so only the serial walk's refusal of a body
  // Choice or Merge can refuse it.
  const model = nestedScopeProgramModel(program);
  assert.ok(model !== null && scopeDataStructureAdmitted(model));
  assert.equal(scopeReentryProgram(program), false);
  assert.equal(structuredScopeDataProgramStartNames(program), null);
  assert.equal(structuredScopeDataCheckedStartNames(wrapped), null);
});
