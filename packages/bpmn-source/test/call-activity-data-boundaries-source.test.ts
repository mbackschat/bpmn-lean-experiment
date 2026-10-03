import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { CallDataKind, CheckedNodeKind, SemanticOperationKind, SemanticProfileId, isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";

const source = await readFile(
  new URL("./fixtures/call-activity-data-boundaries.bpmn", import.meta.url),
  "utf8",
);

function compile(xml: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "supplier-onboarding-call-data",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-call-activity-data-boundaries-draft",
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

test("admits supplier onboarding with separate Call, Process and task scalar interfaces", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const call = result.checkedProcess.nodes.find((node) => node.kind === CheckedNodeKind.CallActivity);
  assert.ok(call);
  assert.equal(call.data.kind, CallDataKind.Scalar);
  for (const operation of result.semanticProcess.operations.filter((operation) =>
    operation.kind === SemanticOperationKind.InvokeProcess || operation.kind === SemanticOperationKind.ReturnProcess)) {
    assert.deepEqual(operation.data, call.data);
  }
  assert.ok(!Object.values(SemanticProfileId).some((profile) => profile === result.checkedProcess.identity.semanticProfile));
});

test("Call interface correspondence follows owned singleton ports independently of labels", async () => {
  const renamed = source
    .replaceAll('name="Supplier summary"', 'name="same display label"')
    .replaceAll('name="Due diligence decision"', 'name="same display label"')
    .replace('id="Input_ProcessSummary" name="same display label"', 'id="Input_ProcessSummary" name="Callable request"')
    .replace('id="Output_ProcessDecision" name="same display label"', 'id="Output_ProcessDecision" name="Callable response"')
    .replaceAll("Input_CallSummary", "Wrapper_Request")
    .replaceAll("Input_ProcessSummary", "Callable_Request")
    .replaceAll("Output_CallDecision", "Wrapper_Response")
    .replaceAll("Output_ProcessDecision", "Callable_Response");
  const result = await compile(renamed);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
});

test("Call data admission does not require descriptive names", async () => {
  const result = await compile(source.replace(/ name="[^"]*"/g, ""));
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
});

test("Call data follows every renamed source identity and descriptive set name", async () => {
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  let xml = source.replace(/(<bpmn:(?:inputSet|outputSet) id="[^"]+")/g, '$1 name="Descriptive only"');
  for (const [index, id] of ids.entries()) {
    assert.ok(id);
    xml = xml.replaceAll(id, `Renamed_${index}`);
  }
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
});

for (const [owner, insertion] of [
  ["called Process", '<bpmn:ioSpecification id="IO_SupplierDueDiligence">'],
  ["called Task", '<bpmn:ioSpecification id="IO_AssessSupplier">'],
] as const) {
  test(`Call data refuses an overwritten extra ${owner} interface`, async () => {
    const xml = source.replace(insertion, '<bpmn:ioSpecification id="IO_Discarded" />' + insertion);
    assert.notEqual(xml, source);
    const result = await compile(xml);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  });
}

for (const [name, mutate] of [
  ["caller association crosses directly into the called Process", (xml: string) => xml.replace(
    "<bpmn:targetRef>Input_CallSummary</bpmn:targetRef>",
    "<bpmn:targetRef>Input_ProcessSummary</bpmn:targetRef>",
  )],
  ["called task reads a caller Property", (xml: string) => xml.replace(
    "<bpmn:sourceRef>Input_ProcessSummary</bpmn:sourceRef>",
    "<bpmn:sourceRef>Property_SupplierSummary</bpmn:sourceRef>",
  )],
  ["called task writes a caller Property before return", (xml: string) => xml.replace(
    "<bpmn:targetRef>Output_ProcessDecision</bpmn:targetRef>",
    "<bpmn:targetRef>Property_DueDiligenceDecision</bpmn:targetRef>",
  )],
  ["caller review reads request instead of the returned result", (xml: string) => xml.replace(
    "<bpmn:sourceRef>Property_DueDiligenceDecision</bpmn:sourceRef>",
    "<bpmn:sourceRef>Property_SupplierSummary</bpmn:sourceRef>",
  )],
  ["caller receipt overwrites the returned result", (xml: string) => xml.replace(
    "<bpmn:targetRef>Property_OnboardingReceipt</bpmn:targetRef>",
    "<bpmn:targetRef>Property_DueDiligenceDecision</bpmn:targetRef>",
  )],
  ["caller receipt overwrites the request", (xml: string) => xml.replace(
    "<bpmn:targetRef>Property_OnboardingReceipt</bpmn:targetRef>",
    "<bpmn:targetRef>Property_SupplierSummary</bpmn:targetRef>",
  )],
  ["caller task is moved before invocation", (xml: string) => xml
    .replace('sourceRef="Start_Onboarding" targetRef="Call_DueDiligence"', 'sourceRef="Start_Onboarding" targetRef="Task_FinalReview"')
    .replace('sourceRef="Call_DueDiligence" targetRef="Task_FinalReview"', 'sourceRef="Task_FinalReview" targetRef="Call_DueDiligence"')
    .replace('sourceRef="Task_FinalReview" targetRef="End_Onboarding"', 'sourceRef="Call_DueDiligence" targetRef="End_Onboarding"')],
  ["called Process is public", (xml: string) => xml.replace(
    'id="SupplierDueDiligence" isExecutable="true" processType="Private"',
    'id="SupplierDueDiligence" isExecutable="true" processType="Public"',
  )],
  ["called Process has a Property", (xml: string) => xml.replace(
    '<bpmn:startEvent id="Start_DueDiligence">',
    '<bpmn:property id="Property_CalledSecret" /><bpmn:startEvent id="Start_DueDiligence">',
  )],
  ["called input set references the Call input", (xml: string) => xml.replace(
    "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>",
    "<bpmn:dataInputRefs>Input_CallSummary</bpmn:dataInputRefs>",
  )],
  ["called input is a collection", (xml: string) => xml.replace(
    'id="Input_ProcessSummary" name="Supplier summary"',
    'id="Input_ProcessSummary" name="Supplier summary" isCollection="true"',
  )],
  ["both corresponding inputs are unsupported collections", (xml: string) => xml.replaceAll(
    'name="Supplier summary"',
    'name="Supplier summary" isCollection="true"',
  )],
  ["called input is optional", (xml: string) => xml.replace(
    "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>",
    "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs><bpmn:optionalInputRefs>Input_ProcessSummary</bpmn:optionalInputRefs>",
  )],
  ["an additional called output has no correspondence", (xml: string) => xml.replace(
    '<bpmn:inputSet id="Inputs_SupplierDueDiligence">',
    '<bpmn:dataOutput id="Output_Extra" /><bpmn:inputSet id="Inputs_SupplierDueDiligence">',
  )],
] as const) {
  test(`Call data admission refuses ${name}`, async () => {
    const changed = mutate(source);
    assert.notEqual(changed, source);
    const result = await compile(changed);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  });
}
