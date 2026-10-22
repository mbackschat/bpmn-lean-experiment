/**
 * CALLN-ADMIT-01 for Stage A through the exact-bytes source path: the supplier onboarding model's Process-root Calls
 * under the `SCOPE` profile. The oracle is the repeated, nested and concurrent Calls proposal's required and excluded
 * scope; every refusal differs from the admitted control in the one fact its label names.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { forest, forked, serial } from "./call-forest-fixture.ts";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CallDataKind, CheckedNodeKind, SemanticOperationKind, SemanticProfileId, isWellFormedSemanticProcessProgram,
  nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis,
} from "@bpmn-lean/semantic-core";

const directory = new URL("../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const supplierXml = async (): Promise<string> => readFile(new URL("supplier-onboarding.bpmn", directory), "utf8");

async function compile(xml: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "supplier-onboarding", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
}

test("CALLN-ADMIT-01 admits the supplier model's repeated, nested and concurrent Process-root Calls", async () => {
  const result = await compile(await supplierXml());
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const calls = result.checkedProcess.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []);
  assert.deepEqual(calls.map(({ id, calledProcessId, data }) => [id, calledProcessId, data.kind]), [
    ["CallActivity_BankApproval", "Process_FourEyesApproval", CallDataKind.Empty],
    ["CallActivity_CheckCompliance", "Process_ComplianceCheck", CallDataKind.Empty],
    ["CallActivity_FinalApproval", "Process_FourEyesApproval", CallDataKind.Empty],
    ["CallActivity_ReviewRisk", "Process_SupplierRiskReview", CallDataKind.Empty],
    ["CallActivity_TaxApproval", "Process_FourEyesApproval", CallDataKind.Empty],
  ]);
  assert.equal(result.checkedProcess.processId, "Process_SupplierOnboarding");
  assert.equal(result.checkedProcess.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null).length, 4);
  const program = result.semanticProcess;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(program.operations.filter(({ kind }) => kind === SemanticOperationKind.InvokeProcess).length, 5);
  assert.equal(program.operations.filter(({ kind }) => kind === SemanticOperationKind.ReturnProcess).length, 5);
  // Completing Screen sanctions charges the proposal's six steps, in the checked graph and the Program alike.
  assert.equal(nestedScopeControlCheckedAnalysis({ ...result.checkedProcess, flows: result.checkedProcess.sequenceFlows }), 6);
  assert.equal(nestedScopeControlProgramAnalysis(program), 6);
});

const taxCall = '<bpmn:callActivity id="CallActivity_TaxApproval" name="Tax approval" calledElement="Process_FourEyesApproval">';

test("CALLN-ADMIT-01 refuses each excluded Call attribute and placement", async () => {
  const xml = await supplierXml();
  const variants: ReadonlyArray<readonly [string, string, string]> = [
    ["calledElement naming the caller", taxCall, taxCall.replace("Process_FourEyesApproval", "Process_SupplierOnboarding")],
    ["absent calledElement target", taxCall, taxCall.replace("Process_FourEyesApproval", "Process_Missing")],
    ["prefixed calledElement", taxCall, taxCall.replace('"Process_FourEyesApproval"', '"tns:Process_FourEyesApproval"')],
    ["calledElementBinding", taxCall, taxCall.replace(">", ' xmlns:camunda="http://camunda.org/schema/1.0/bpmn" camunda:calledElementBinding="latest">')],
  ];
  for (const [label, from, to] of variants) {
    assert.ok(xml.includes(from), label);
    const result = await compile(xml.replace(from, to));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  }
});

const admitted = async (xml: string) => (await compile(xml)).status === BpmnCompilationStatus.Accepted;

/** The admitted largest closure of a model, from the checked graph and the Program independently. */
async function bursts(xml: string): Promise<readonly [number | null, number | null]> {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const checked = result.checkedProcess;
  return [nestedScopeControlCheckedAnalysis({ ...checked, flows: checked.sequenceFlows }),
    nestedScopeControlProgramAnalysis(result.semanticProcess)];
}

test("CALLN-ADMIT-01 separates each refused forest from its admitted control", async () => {
  const leaf = serial("T");
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    // CALLN-ONCE-01: one closure would invoke two instances of one definition.
    ["fork straight into two Calls of one definition",
      forest({ P0: forked(["P1"], ["P1"]), P1: leaf }),
      forest({ P0: forked(["T", "P1"], ["T", "P1"]), P1: leaf })],
    // CALLN-SHARED-01: a Call-bearing definition live twice.
    ["two branches calling a Call-bearing definition",
      forest({ P0: forked(["T", "P1"], ["T", "P1"]), P1: serial("T", "P2"), P2: leaf }),
      forest({ P0: serial("T", "P1", "P1"), P1: serial("T", "P2"), P2: leaf })],
    ["a call cycle",
      forest({ P0: serial("T", "P1"), P1: serial("T", "P2"), P2: serial("T", "P1") }),
      forest({ P0: serial("T", "P1"), P1: serial("T", "P2"), P2: leaf })],
    ["Call depth four",
      forest({ P0: serial("T", "P1"), P1: serial("T", "P2"), P2: serial("T", "P3"), P3: serial("T", "P4"), P4: leaf }),
      forest({ P0: serial("T", "P1"), P1: serial("T", "P2"), P2: serial("T", "P3"), P3: leaf })],
    ["a Parallel Gateway in a called body",
      forest({ P0: serial("T", "P1"), P1: forked(["T"], ["T"]) }),
      forest({ P0: serial("T", "P1"), P1: serial("T", "T") })],
    ["four vertices in a called body",
      forest({ P0: serial("T", "P1"), P1: serial("T", "T", "T", "T") }),
      forest({ P0: serial("T", "P1"), P1: serial("T", "T", "T") })],
    ["a Call inside a Sub-Process",
      forest({ P0: { vertices: { S: "startEvent", A: { subProcess: serial("T", "P1") }, E: "endEvent" },
        flows: [["S", "A"], ["A", "E"]] }, P1: leaf }),
      forest({ P0: { vertices: { S: "startEvent", A: { subProcess: serial("T") }, C: 'callActivity calledElement="P1"',
        E: "endEvent" }, flows: [["S", "A"], ["A", "C"], ["C", "E"]] }, P1: leaf })],
    ["a called root no Call reaches",
      forest({ P0: serial("T", "P1"), P1: leaf, P2: serial("T", "P3"), P3: serial("T", "P2") }),
      forest({ P0: serial("T", "P1"), P1: leaf })],
    // Completing P6's task ends P6, P3 and P1 with three returns, then invokes P2 and its leading P4 and arms P4's task.
    ["a nine-step burst",
      forest({ P0: serial("T", "P1", "P2"), P1: serial("T", "P3"), P3: serial("T", "P6"), P6: leaf,
        P2: serial("P4"), P4: leaf }),
      forest({ P0: serial("T", "P1", "P2"), P1: serial("T", "P3"), P3: serial("T", "P6"), P6: leaf, P2: leaf })],
  ];
  for (const [label, refused, control] of cases) {
    assert.equal(await admitted(control), true, `control of ${label}`);
    assert.equal(await admitted(refused), false, label);
  }
  assert.deepEqual(await bursts(cases.at(-1)![2]), [8, 8]);
});

test("CALLN-INVOKE-01 admits a fork straight into two Calls whose bodies lead with Calls of two more definitions", async () => {
  // The entry closure charges initiate, the fork and three steps per branch: eight, the closure bound.
  assert.deepEqual(await bursts(forest({ P0: forked(["P1"], ["P2"]), P1: serial("P3"), P2: serial("P4"), P3: serial("T"),
    P4: serial("T") })), [8, 8]);
});

test("CALLN-ADMIT-01 refuses a mapping child under the embedded completion profile", async () => {
  const xml = (await supplierXml()).replace(taxCall,
    `${taxCall}<bpmn:extensionElements><camunda:in xmlns:camunda="http://camunda.org/schema/1.0/bpmn" source="a" target="b" /></bpmn:extensionElements>`);
  assert.equal(await admitted(xml), false);
});
