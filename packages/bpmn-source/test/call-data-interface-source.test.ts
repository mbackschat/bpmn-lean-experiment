import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const { importBpmnGraph } = await import(
  new URL("../dist/moddle-adapter.js", import.meta.url).href
) as typeof import("../src/moddle-adapter.ts");
const { projectCallDataInterfaces } = await import(
  new URL("../dist/call-data-source.js", import.meta.url).href
) as typeof import("../src/call-data-source.ts");
const { projectOwnedDataInputOutputUserTask } = await import(
  new URL("../dist/activity-data-input-output-projection.js", import.meta.url).href
) as typeof import("../src/activity-data-input-output-projection.ts");

const source = await readFile(new URL("./fixtures/call-activity-data-boundaries.bpmn", import.meta.url), "utf8");

async function parse(xml = source) {
  const graph = await importBpmnGraph(xml, 1_000);
  assert.deepEqual(graph.warnings, []);
  const elements = [...graph.located.keys()];
  function find(id: string) {
    const value = elements.find((element) => element.id === id);
    assert.ok(value);
    return value;
  }
  return { call: find("Call_DueDiligence"), caller: find("SupplierOnboarding"), called: find("SupplierDueDiligence"), task: find("Task_FinalReview") };
}

test("Call associations copy through separately owned wrapper and Process interfaces", async () => {
  const { call, caller, called } = await parse();
  const data = projectCallDataInterfaces(call, caller, called);
  assert.ok(data);
  assert.equal(data.call.ownerId, "Call_DueDiligence");
  assert.equal(data.called.ownerId, "SupplierDueDiligence");
  assert.deepEqual(data.directInput.source, { kind: "property", propertyId: "Property_SupplierSummary" });
  assert.equal(data.directInput.targetDataInputId, "Input_CallSummary");
  assert.equal(data.called.input.id, "Input_ProcessSummary");
  assert.equal(data.directOutput.sourceDataOutputId, "Output_CallDecision");
  assert.deepEqual(data.directOutput.target, { kind: "property", propertyId: "Property_DueDiligenceDecision" });
});

test("Call data projection does not require matching display names", async () => {
  const { call, caller, called } = await parse(source.replace(/ name="[^"]*"/g, ""));
  assert.ok(projectCallDataInterfaces(call, caller, called));
});

test("Call data retains unused declared caller Properties for exact start admission", async () => {
  const { call, caller, called } = await parse();
  const data = projectCallDataInterfaces(call, caller, called);
  assert.ok(data);
  assert.ok("callerProperties" in data);
  assert.deepEqual(data.callerProperties, [
    "Property_DueDiligenceDecision", "Property_InternalNote",
    "Property_OnboardingReceipt", "Property_SupplierSummary",
  ]);
});

for (const [name, mutate] of [
  ["input association crosses directly into the called Process", (xml: string) => xml.replace("<bpmn:targetRef>Input_CallSummary</bpmn:targetRef>", "<bpmn:targetRef>Input_ProcessSummary</bpmn:targetRef>")],
  ["output association reads directly from the called Process", (xml: string) => xml.replace("<bpmn:sourceRef>Output_CallDecision</bpmn:sourceRef>", "<bpmn:sourceRef>Output_ProcessDecision</bpmn:sourceRef>")],
  ["called Properties are outside this profile", (xml: string) => xml.replace('<bpmn:startEvent id="Start_DueDiligence">', '<bpmn:property id="CalledSecret"/><bpmn:startEvent id="Start_DueDiligence">')],
  ["input endpoint is another interface instead of a caller Property", (xml: string) => xml.replace("<bpmn:sourceRef>Property_SupplierSummary</bpmn:sourceRef>", "<bpmn:sourceRef>Input_ProcessSummary</bpmn:sourceRef>")],
] as const) {
  test(`Call data projection refuses ${name}`, async () => {
    const xml = mutate(source);
    assert.notEqual(xml, source);
    const { call, caller, called } = await parse(xml);
    assert.equal(projectCallDataInterfaces(call, caller, called), undefined);
  });
}

test("an interface cannot be reassigned to an unrelated caller", async () => {
  const { call, caller, called } = await parse();
  assert.equal(projectCallDataInterfaces(call, called, caller), undefined);
  const otherGraph = await parse();
  assert.equal(projectCallDataInterfaces(call, otherGraph.caller, called), undefined);
});

test("association membership cannot hide a foreign declared owner", async () => {
  for (const field of ["dataInputAssociations", "dataOutputAssociations"]) {
    const { call, caller, called } = await parse();
    assert.ok(projectCallDataInterfaces(call, caller, called));
    const association = (call[field] as Array<Record<string, unknown>>)[0];
    assert.ok(association);
    association.$parent = called;
    assert.equal(projectCallDataInterfaces(call, caller, called), undefined);
  }
});

for (const field of ["dataInputAssociations", "dataOutputAssociations"]) {
  test(`composed task ${field} require the same exact owner as their task ports`, async () => {
    const { task, caller, called } = await parse();
    assert.ok(projectOwnedDataInputOutputUserTask(task, caller));
    const association = (task[field] as Array<Record<string, unknown>>)[0];
    assert.ok(association);
    association.$parent = called;
    assert.equal(projectOwnedDataInputOutputUserTask(task, caller), undefined);
  });
}
