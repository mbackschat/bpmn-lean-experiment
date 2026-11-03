/**
 * SSM-ADMIT-01 and SSM-PROFILE-01 through the exact-bytes source path, at the Program and checked levels. The oracle is
 * the approved proposal's witness account: each retained model holds no embedded Sub-Process and compiles under the
 * nested scope-data profile on the route its shape selects, while each embedded completion control stays refused with
 * one scope and admitted once its Tasks sit in a Sub-Process, so a lower bound dropped for every profile, or kept at one
 * level only, cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, SemanticProfileId, isWellFormedSemanticProcessProgram, nestedScopeControlCheckedAnalysis,
  nestedScopeControlProgramAnalysis, nestedScopeCheckedAnalysis, nestedScopeProgramAnalysis, scopeReentryCheckedAnalysis,
  scopeReentryProgramAnalysis, structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/", import.meta.url);
const activity = "urn:bpmn-lean:effect-protocol:activity-v1";

function overlay(id: string, semanticProfile: string, delegates: readonly string[]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id, semanticProfile,
    effectBindings: delegates.map(delegate => ({ source: { implementation: activity, delegateExpression: `\${${delegate}}` },
      descriptor: { protocol: activity, operation: delegate } })), inertAttributes: [] }));
  return { id, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string, delegates: readonly string[] | null) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "model", expectedSha256: undefined,
    semanticProfile, sourceOverlay: delegates === null ? null : overlay("model-handlers", semanticProfile, delegates),
    limits: semanticProcessTestLimits });
}

async function retained(family: string, model: string): Promise<string> {
  return readFile(new URL(`${family}/${model}.bpmn`, scenarios), "utf8");
}

async function admitted(xml: string, delegates: readonly string[], label: string) {
  const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, delegates);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Both levels agree independently, so a Program-only or checked-only relaxation cannot pass.
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result;
}

function replaceOnce(xml: string, from: string | RegExp, to: string): string {
  const matches = xml.match(typeof from === "string" ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : new RegExp(from.source, "g"));
  assert.equal(matches?.length, 1, String(from));
  return xml.replace(from, to);
}

const controlGraph = (graph: CheckedProcess) => ({ ...graph, flows: graph.sequenceFlows });

test("the purchase request forks at its only scope on the concurrent route", async () => {
  const { checkedProcess, semanticProcess } = await admitted(await retained("single-scope-models", "purchase-request"),
    ["checkBudget"], "purchase-request");
  assert.equal(checkedProcess.definitionScopes.length, 1);
  assert.equal(semanticProcess.definitionScopes.length, 1);
  assert.notEqual(nestedScopeControlCheckedAnalysis(controlGraph(checkedProcess)), null);
  assert.notEqual(nestedScopeControlProgramAnalysis(semanticProcess), null);
  assert.deepEqual(structuredScopeDataProgramStartNames(semanticProcess)?.required, ["request"]);
  assert.deepEqual(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NonOperationalTask ||
    kind === CheckedNodeKind.NoneIntermediateThrowEvent).map(({ id }) => id).sort(),
  ["CollectSignature", "LogBudgetCheck", "PurchaseApproved"]);
});

test("the invoice clearing runs its rework loop at its only scope on the re-entry route", async () => {
  const { checkedProcess, semanticProcess } = await admitted(await retained("single-scope-models", "invoice-clearing"),
    ["validateInvoice"], "invoice-clearing");
  assert.equal(semanticProcess.definitionScopes.length, 1);
  assert.notEqual(scopeReentryCheckedAnalysis(checkedProcess), null);
  assert.deepEqual(scopeReentryProgramAnalysis(semanticProcess), scopeReentryCheckedAnalysis(checkedProcess));
  assert.deepEqual(structuredScopeDataProgramStartNames(semanticProcess)?.required, ["invoice"]);
});

test("a serial model whose only other scope is a called Process is admitted on the serial route", async () => {
  const xml = await retained("call-variable-mapping", "loan-application");
  const unedited = await admitted(xml, ["acknowledgeApplication"], "loan-application");
  assert.equal(unedited.semanticProcess.definitionScopes.length, 3);
  const flattened = replaceOnce(xml, /<subProcess id="ReviewApplication"[\s\S]*?<\/subProcess>/,
    '<userTask id="ReviewApplication" name="Review application" />');
  const { checkedProcess, semanticProcess } = await admitted(flattened, ["acknowledgeApplication"], "flattened loan");
  assert.equal(semanticProcess.definitionScopes.length, 2);
  assert.notEqual(nestedScopeCheckedAnalysis(checkedProcess), null);
  assert.notEqual(nestedScopeProgramAnalysis(semanticProcess), null);
});

const serial = (body: string, flows: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_Serial" targetNamespace="urn:bpmn-lean:serial">
  <process id="Process_Serial" isExecutable="true">
    <startEvent id="Opened" />${body}
    <endEvent id="Closed" />${flows}
  </process>
</definitions>`;

const recordTask = `
    <serviceTask id="Record" implementation="${activity}" camunda:delegateExpression="\${record}" camunda:asyncBefore="true">
      <extensionElements><camunda:inputOutput>
        <camunda:inputParameter name="entry">\${entry}</camunda:inputParameter>
        <camunda:outputParameter name="receipt">\${receipt}</camunda:outputParameter>
      </camunda:inputOutput></extensionElements>
    </serviceTask>`;

test("a degenerate single scope keeps the serial overlay rule while its one-Service-Task twin is admitted", async () => {
  const bare = serial("", '\n    <sequenceFlow id="Flow_Closed" sourceRef="Opened" targetRef="Closed" />');
  // NSD-ADMIT-01's overlay rule: a serial model binds at least one handler, with or without a Sub-Process.
  assert.equal((await compile(bare, SemanticProfileId.NestedEmbeddedScopeData, [])).status, BpmnCompilationStatus.Rejected);
  const recorded = serial(recordTask, `
    <sequenceFlow id="Flow_Record" sourceRef="Opened" targetRef="Record" />
    <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="Closed" />`);
  const { semanticProcess } = await admitted(recorded, ["record"], "recorded");
  assert.equal(semanticProcess.definitionScopes.length, 1);
});

test("each excluded single-scope form is refused", async () => {
  const purchase = await retained("single-scope-models", "purchase-request");
  const refusals: ReadonlyArray<readonly [string, string]> = [
    ["a second None End", replaceOnce(replaceOnce(purchase,
      '<sequenceFlow id="Flow_OrderPlaced" sourceRef="PlaceOrder" targetRef="OrderPlaced" />',
      '<sequenceFlow id="Flow_OrderPlaced" sourceRef="PlaceOrder" targetRef="OrderPlaced" />' +
        '<endEvent id="SignatureFiled" /><sequenceFlow id="Flow_SignatureFiled" sourceRef="LogBudgetCheck" targetRef="SignatureFiled" />'),
      '<sequenceFlow id="Flow_BudgetLogged" sourceRef="LogBudgetCheck" targetRef="ChecksDone" />', "")],
    ["a Call in the forking root", replaceOnce(purchase, '<task id="LogBudgetCheck" name="Log budget check" />',
      '<callActivity id="LogBudgetCheck" name="Log budget check" calledElement="Process_PurchaseRequest" />')],
  ];
  for (const [label, xml] of refusals) {
    assert.equal((await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, ["checkBudget"])).status,
      BpmnCompilationStatus.Rejected, label);
  }
});

const wrapped = (body: string, inner: string, innerFlows: string) => serial(`
    <subProcess id="Work">
      <startEvent id="WorkOpened" />${inner}
      <endEvent id="WorkClosed" />${innerFlows}
    </subProcess>${body}`, `
    <sequenceFlow id="Flow_Work" sourceRef="Opened" targetRef="Work" />
    <sequenceFlow id="Flow_Worked" sourceRef="Work" targetRef="Closed" />`);

const reviewTasks = `
    <parallelGateway id="Split" />
    <userTask id="Review" />
    <userTask id="Approve" />
    <parallelGateway id="Join" />`;

const reviewFlows = (from: string, to: string) => `
    <sequenceFlow id="Flow_Split" sourceRef="${from}" targetRef="Split" />
    <sequenceFlow id="Flow_Review" sourceRef="Split" targetRef="Review" />
    <sequenceFlow id="Flow_Approve" sourceRef="Split" targetRef="Approve" />
    <sequenceFlow id="Flow_Reviewed" sourceRef="Review" targetRef="Join" />
    <sequenceFlow id="Flow_Approved" sourceRef="Approve" targetRef="Join" />
    <sequenceFlow id="Flow_Joined" sourceRef="Join" targetRef="${to}" />`;

test("the embedded completion profile refuses each single-scope control and admits its Sub-Process twin", async () => {
  const pairs: ReadonlyArray<readonly [string, string, string, readonly string[] | null]> = [
    ["data-free fork", serial(reviewTasks, reviewFlows("Opened", "Closed")),
    wrapped("", reviewTasks, reviewFlows("WorkOpened", "WorkClosed")), null],
    ["data-bearing", serial(recordTask, `
    <sequenceFlow id="Flow_Record" sourceRef="Opened" targetRef="Record" />
    <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="Closed" />`),
    wrapped("", recordTask, `
      <sequenceFlow id="Flow_Record" sourceRef="WorkOpened" targetRef="Record" />
      <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="WorkClosed" />`), ["record"]],
  ];
  for (const [label, single, twin, delegates] of pairs) {
    const twinResult = await compile(twin, SemanticProfileId.EmbeddedSubProcessCompletion, delegates);
    assert.ok(twinResult.status === BpmnCompilationStatus.Accepted, `${label} twin: ${JSON.stringify(twinResult.diagnostics)}`);
    assert.equal((await compile(single, SemanticProfileId.EmbeddedSubProcessCompletion, delegates)).status,
      BpmnCompilationStatus.Rejected, label);
    // Past the source reader: the single-scope graph and Program the nested profile admits, relabelled to the embedded
    // completion profile, are refused by the shared analyses, so a relaxation keyed on anything but identity fails.
    // A forking nested model may bind no handler (CSSD-ADMIT-01), so the data-free fork compiles with an empty overlay.
    const nested = await compile(single, SemanticProfileId.NestedEmbeddedScopeData, delegates ?? []);
    assert.ok(nested.status === BpmnCompilationStatus.Accepted, `${label} nested: ${JSON.stringify(nested.diagnostics)}`);
    const graph = { ...nested.checkedProcess, identity: { ...nested.checkedProcess.identity,
      semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } };
    const program = { ...nested.semanticProcess, identity: { ...nested.semanticProcess.identity,
      semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } };
    assert.equal(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, `${label} checked`);
    assert.equal(nestedScopeControlProgramAnalysis(program), null, `${label} Program`);
  }
});
