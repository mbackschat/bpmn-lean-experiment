/**
 * CVM-ADMIT-01 and CVM-RESOLVE-01 through the exact-bytes source path: a nested scope-data caller with one Call whose
 * `camunda:in`/`camunda:out` copies become the Call's `variableMappings` data arm. The oracle is the Call variable
 * mapping proposal's required and excluded scope; every refusal differs from the admitted control in one fact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import type { CompileBpmnToSemanticProcessRequest } from "@bpmn-lean/bpmn-source";
import {
  CallDataKind, CheckedNodeKind, MappingExpressionKind, SemanticOperationKind, SemanticProfileId,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const directory = new URL("../../../scenarios/call-variable-mapping/", import.meta.url);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function request(xml: string): Promise<CompileBpmnToSemanticProcessRequest> {
  const overlay = new Uint8Array(await readFile(new URL("loan-application-overlay.json", directory)));
  return {
    bytes: new TextEncoder().encode(xml), sourceId: "loan-application", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "loan-application-handlers", sha256: sha256(overlay), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  };
}

const loanXml = async (): Promise<string> => readFile(new URL("loan-application.bpmn", directory), "utf8");

async function compile(xml: string) {
  return compileBpmnToSemanticProcess(await request(xml));
}

const enclosing = (name: string) => ({ kind: MappingExpressionKind.EnclosingVariable, name }) as const;
const local = (name: string) => ({ kind: MappingExpressionKind.LocalVariable, name }) as const;
const expectedData = {
  kind: CallDataKind.VariableMappings,
  inputs: [{ target: "customer", expression: enclosing("applicant") }, { target: "amount", expression: enclosing("amount") }],
  outputs: [{ target: "decision", expression: local("verdict") }, { target: "echoedCustomer", expression: local("customer") }],
};

test("CVM-ADMIT-01 admits the loan application with its Call on the root path and both lists in document order", async () => {
  const result = await compile(await loanXml());
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const call = result.checkedProcess.nodes.find(({ id }) => id === "VerifyIdentity");
  assert.deepEqual(call, { kind: CheckedNodeKind.CallActivity, id: "VerifyIdentity",
    calledProcessId: "Process_IdentityVerification", data: expectedData });
  const scopes = result.checkedProcess.definitionScopes.map(({ parentScopeId, originElementId }) =>
    [originElementId, parentScopeId]);
  assert.equal(scopes.filter(([, parent]) => parent === null).length, 2);
  const program = result.semanticProcess;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  for (const kind of [SemanticOperationKind.InvokeProcess, SemanticOperationKind.ReturnProcess]) {
    const operation = program.operations.find((candidate) => candidate.kind === kind);
    assert.ok(operation !== undefined && "data" in operation, kind);
    assert.deepEqual(operation.data, expectedData, kind);
  }
});

const callElement = '<callActivity id="VerifyIdentity" name="Verify identity" calledElement="Process_IdentityVerification">';
const firstIn = '<camunda:in source="applicant" target="customer" />';

test("CVM-ADMIT-01 refuses each excluded Call attribute and mapping form", async () => {
  const xml = await loanXml();
  const variants: ReadonlyArray<readonly [string, string, string]> = [
    ["sourceExpression", firstIn, '<camunda:in sourceExpression="${applicant}" target="customer" />'],
    ["variables all", firstIn, '<camunda:in variables="all" />'],
    ["local", firstIn, '<camunda:in source="applicant" target="customer" local="true" />'],
    ["businessKey", firstIn, '<camunda:in businessKey="${applicant}" />'],
    ["missing source", firstIn, '<camunda:in target="customer" />'],
    ["empty target", firstIn, '<camunda:in source="applicant" target="" />'],
    ["duplicate input target", firstIn, `${firstIn}<camunda:in source="amount" target="customer" />`],
    ["duplicate output target", '<camunda:out source="verdict" target="decision" />',
      '<camunda:out source="verdict" target="decision" /><camunda:out source="customer" target="decision" />'],
    ["reserved output", '<camunda:out source="verdict" target="decision" />',
      '<camunda:out source="verdict" target="nrOfInstances" />'],
    ["no input", firstIn + '\n        <camunda:in source="amount" target="amount" />', ""],
    ["prefixed calledElement", callElement, callElement.replace('"Process_IdentityVerification"', '"lv:Process_IdentityVerification"')],
    ["calledElement naming the caller", callElement, callElement.replace('"Process_IdentityVerification"', '"Process_LoanApplication"')],
    ["absent calledElement", callElement, callElement.replace('"Process_IdentityVerification"', '"Process_Missing"')],
    ["calledElementBinding", callElement, callElement.replace(">", ' camunda:calledElementBinding="latest">')],
    ["called Service Task", '<userTask id="RecordVerdict" name="Record verdict" />',
      '<serviceTask id="RecordVerdict" implementation="urn:bpmn-lean:effect-protocol:activity-v1" camunda:delegateExpression="${acknowledgeApplication}" camunda:asyncBefore="true"/>'],
    ["inputOutput on the Call", firstIn,
      `${firstIn}<camunda:inputOutput><camunda:inputParameter name="x">y</camunda:inputParameter></camunda:inputOutput>`],
  ];
  for (const [label, from, to] of variants) {
    assert.ok(xml.includes(from), label);
    const result = await compile(xml.replace(from, to));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  }
});

// The Call and the review task trade places, so the Call sits inside the review Sub-Process; the Lean account still
// binds Call callers to Process roots, so CVM-ADMIT-01 leaves that placement to PC-SCOPE-05.
test("CVM-ADMIT-01 refuses a Call inside an embedded Sub-Process", async () => {
  const xml = await loanXml();
  const callStart = xml.indexOf(callElement);
  const callEnd = xml.indexOf("</callActivity>", callStart) + "</callActivity>".length;
  const call = xml.slice(callStart, callEnd);
  const task = '<userTask id="ConfirmDecision" name="Confirm or override the verdict" />';
  assert.ok(callStart >= 0 && xml.includes(task));
  const moved = xml.slice(0, callStart) + '<userTask id="VerifyIdentity" name="Verify identity" />' + xml.slice(callEnd);
  const nested = moved.replace(task, call.replace('id="VerifyIdentity"', 'id="ConfirmDecision"'));
  const control = await compile(xml);
  assert.equal(control.status, BpmnCompilationStatus.Accepted);
  const result = await compile(nested);
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});
