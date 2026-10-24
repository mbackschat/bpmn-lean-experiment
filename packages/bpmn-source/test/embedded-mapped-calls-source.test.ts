/**
 * CALLN-ADMIT-01 for Stage B through the exact-bytes source path: the guarantor loan model's two mapped Calls of one
 * definition under the nested scope-data profile, one on the root path and one inside the Guarantor review
 * Sub-Process. The oracle is the repeated, nested and concurrent Calls specification's Stage B scope; every refusal differs
 * from the admitted control in the one fact its label names.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CallDataKind, CheckedNodeKind, MappingExpressionKind, SemanticOperationKind, SemanticProfileId,
  isWellFormedSemanticProcessProgram, nestedScopeCheckedStartNames, nestedScopeProgramStartNames,
} from "@bpmn-lean/semantic-core";

const directory = new URL("../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const guarantorXml = async (): Promise<string> => readFile(new URL("guarantor-loan.bpmn", directory), "utf8");

async function compile(xml: string) {
  const overlay = new Uint8Array(await readFile(new URL("guarantor-loan-overlay.json", directory)));
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "guarantor-loan", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "guarantor-loan-handlers", sha256: sha256(overlay), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
}

const enclosing = (name: string) => ({ kind: MappingExpressionKind.EnclosingVariable, name }) as const;
const local = (name: string) => ({ kind: MappingExpressionKind.LocalVariable, name }) as const;
const applicantData = {
  kind: CallDataKind.VariableMappings,
  inputs: [{ target: "customer", expression: enclosing("applicant") }, { target: "amount", expression: enclosing("amount") }],
  outputs: [{ target: "applicantVerdict", expression: local("verdict") }],
};
const guarantorData = {
  kind: CallDataKind.VariableMappings,
  inputs: [{ target: "customer", expression: enclosing("guarantor") }],
  outputs: [{ target: "guarantorVerdict", expression: local("verdict") }],
};

test("CALLN-ADMIT-01 admits the guarantor loan's root-path and Sub-Process Calls of one definition", async () => {
  const result = await compile(await guarantorXml());
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const checked = result.checkedProcess;
  const calls = checked.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []);
  assert.deepEqual(calls.map(({ id, calledProcessId, data }) => [id, calledProcessId, data]), [
    ["VerifyApplicant", "Process_IdentityVerification", applicantData],
    ["VerifyGuarantor", "Process_IdentityVerification", guarantorData],
  ]);
  const scopeOf = (nodeId: string) => checked.nodeScopes.find(entry => entry.nodeId === nodeId)?.scopeId;
  assert.equal(scopeOf("VerifyApplicant"), "scope:Process_GuarantorLoan");
  assert.equal(scopeOf("VerifyGuarantor"), "scope:GuarantorReview");
  assert.deepEqual(checked.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null)
    .map(({ originElementId }) => originElementId), ["Process_GuarantorLoan", "Process_IdentityVerification"]);

  const program = result.semanticProcess;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const placeScope = new Map(program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) =>
    [controlPlaceId, scopeId]));
  const operationScope = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  for (const [elementId, scope, data] of [
    ["VerifyApplicant", "scope:Process_GuarantorLoan", applicantData],
    ["VerifyGuarantor", "scope:GuarantorReview", guarantorData],
  ] as const) {
    const invoke = program.operations.find(operation =>
      operation.kind === SemanticOperationKind.InvokeProcess && operation.origin.elementId === elementId);
    assert.ok(invoke?.kind === SemanticOperationKind.InvokeProcess, elementId);
    const returned = program.operations.find(({ id }) => id === invoke.returnOperationId);
    assert.ok(returned?.kind === SemanticOperationKind.ReturnProcess, elementId);
    assert.equal(operationScope.get(invoke.id), scope, elementId);
    assert.equal(placeScope.get(returned.callerOutput), scope, elementId);
    assert.equal(operationScope.get(returned.id), "scope:Process_IdentityVerification", elementId);
    assert.deepEqual(invoke.data, data, elementId);
    assert.deepEqual(returned.data, data, elementId);
  }
});

/**
 * CALLN-FRAME-01's admission half: the Sub-Process frame declares `guarantorVerdict`, so the second Call's output
 * lands there and is no Start name, while the Sub-Process output and the root Call's output reach the Process.
 */
test("CALLN-FRAME-01 admits Start names by each Call's own enclosing chain", async () => {
  const result = await compile(await guarantorXml());
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const expected = { required: ["applicant"], optional: ["applicant", "amount", "applicantVerdict", "guarantor"] };
  assert.deepEqual(nestedScopeCheckedStartNames(result.checkedProcess), expected);
  assert.deepEqual(nestedScopeProgramStartNames(result.semanticProcess), expected);
});

const guarantorCallStart = '<callActivity id="VerifyGuarantor"';
const subProcessClose = "    </subProcess>\n    <endEvent id=\"LoanDecided\"";

/** Wraps the guarantor Call in `levels` further Sub-Processes inside Guarantor review. */
function wrapGuarantorCall(xml: string, levels: number): string {
  const start = xml.indexOf(guarantorCallStart);
  const end = xml.indexOf("</callActivity>", start) + "</callActivity>".length;
  let inner = xml.slice(start, end).replace('id="VerifyGuarantor"', 'id="VerifyGuarantorInner"');
  for (let level = levels; level >= 1; level -= 1) {
    inner = `<subProcess id="Wrap${level}"><startEvent id="Wrap${level}Start" />${inner}` +
      `<endEvent id="Wrap${level}End" />` +
      `<sequenceFlow id="Wrap${level}In" sourceRef="Wrap${level}Start" targetRef="${level === levels ? "VerifyGuarantorInner" : `Wrap${level + 1}`}" />` +
      `<sequenceFlow id="Wrap${level}Out" sourceRef="${level === levels ? "VerifyGuarantorInner" : `Wrap${level + 1}`}" targetRef="Wrap${level}End" />` +
      "</subProcess>";
  }
  return xml.slice(0, start) + inner.replace('<subProcess id="Wrap1"', '<subProcess id="VerifyGuarantor"') +
    xml.slice(end);
}

test("CALLN-ADMIT-01 admits a Sub-Process Call at depth two and refuses depth three", async () => {
  const xml = await guarantorXml();
  assert.ok(xml.includes(guarantorCallStart) && xml.includes(subProcessClose));
  const depthTwo = await compile(wrapGuarantorCall(xml, 1));
  assert.equal(depthTwo.status, BpmnCompilationStatus.Accepted, JSON.stringify(depthTwo.diagnostics));
  const depthThree = await compile(wrapGuarantorCall(xml, 2));
  assert.equal(depthThree.status, BpmnCompilationStatus.Rejected);
});

const applicantCall = '<callActivity id="VerifyApplicant" name="Verify applicant" calledElement="Process_IdentityVerification">';
const thirdCall = '<callActivity id="VerifyCoSigner" calledElement="Process_IdentityVerification"><extensionElements>' +
  '<camunda:in source="coSigner" target="customer" /><camunda:out source="verdict" target="coSignerVerdict" />' +
  "</extensionElements></callActivity>";

test("CALLN-ADMIT-01 refuses two Calls of two definitions", async () => {
  const xml = await guarantorXml();
  const open = xml.indexOf('<process id="Process_IdentityVerification"');
  const verification = xml.slice(open, xml.indexOf("</process>", open) + "</process>".length);
  const copy = verification.replaceAll(/(id|sourceRef|targetRef)="([^"]+)"/gu, '$1="$2_Copy"');
  const guarantorCall = '<callActivity id="VerifyGuarantor" name="Verify guarantor" calledElement="Process_IdentityVerification">';
  assert.ok(open >= 0 && xml.includes(guarantorCall));
  const result = await compile(xml.replace(verification, `${verification}\n  ${copy}`)
    .replace(guarantorCall, guarantorCall.replace("Process_IdentityVerification", "Process_IdentityVerification_Copy")));
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("CALLN-ADMIT-01 refuses a third Call, a call cycle and a Call naming its own caller", async () => {
  const xml = await guarantorXml();
  const decided = '<sequenceFlow id="Flow_GuarantorReviewed" sourceRef="GuarantorReview" targetRef="LoanDecided" />';
  const recordVerdict = '<userTask id="RecordVerdict" name="Record verdict" />';
  const variants: ReadonlyArray<readonly [string, string, string]> = [
    ["third Call", decided, `${thirdCall}<sequenceFlow id="Flow_GuarantorReviewed" sourceRef="GuarantorReview" ` +
      'targetRef="VerifyCoSigner" /><sequenceFlow id="Flow_CoSignerVerified" sourceRef="VerifyCoSigner" targetRef="LoanDecided" />'],
    ["called Process calling its caller", recordVerdict, '<callActivity id="RecordVerdict" calledElement="Process_GuarantorLoan">' +
      '<extensionElements><camunda:in source="customer" target="applicant" /></extensionElements></callActivity>'],
    ["calledElement naming the caller", applicantCall, applicantCall.replace("Process_IdentityVerification", "Process_GuarantorLoan")],
  ];
  for (const [label, from, to] of variants) {
    assert.ok(xml.includes(from), label);
    const result = await compile(xml.replace(from, to));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  }
});
