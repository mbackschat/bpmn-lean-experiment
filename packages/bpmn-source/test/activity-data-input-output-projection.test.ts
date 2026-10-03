import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const { importBpmnGraph } = await import(
  new URL("../dist/moddle-adapter.js", import.meta.url).href
) as typeof import("../src/moddle-adapter.ts");
const { projectProcessDataInputOutputUserTask, projectOwnedDataInputOutputUserTask } = await import(
  new URL("../dist/activity-data-input-output-projection.js", import.meta.url).href
) as typeof import("../src/activity-data-input-output-projection.ts");

const source = await readFile(new URL("./fixtures/call-activity-data-boundaries.bpmn", import.meta.url), "utf8");

async function parse(xml = source) {
  const graph = await importBpmnGraph(xml, 1_000);
  assert.deepEqual(graph.warnings, []);
  return (id: string) => {
    const element = [...graph.located.keys()].find((entry) => entry.id === id);
    assert.ok(element);
    return element;
  };
}

test("called task resolves its containing Process ports as typed endpoints", async () => {
  const find = await parse();
  const task = projectProcessDataInputOutputUserTask(find("Task_AssessSupplier"), find("SupplierDueDiligence"));
  assert.ok(task);
  assert.deepEqual(task.directInput.source, { kind: "processDataInput", dataInputId: "Input_ProcessSummary" });
  assert.equal(task.directInput.targetDataInputId, "Input_TaskSummary");
  assert.deepEqual(task.directOutput.target, { kind: "processDataOutput", dataOutputId: "Output_ProcessDecision" });
  assert.equal(task.directOutput.sourceDataOutputId, "Output_TaskDecision");
  assert.equal(projectOwnedDataInputOutputUserTask(find("Task_AssessSupplier"), find("SupplierDueDiligence")), undefined);
});

test("Process-owned Property endpoints retain their distinct endpoint kind", async () => {
  const find = await parse();
  const task = projectProcessDataInputOutputUserTask(find("Task_FinalReview"), find("SupplierOnboarding"));
  assert.ok(task);
  assert.deepEqual(task.directInput.source, { kind: "property", propertyId: "Property_DueDiligenceDecision" });
  assert.deepEqual(task.directOutput.target, { kind: "property", propertyId: "Property_OnboardingReceipt" });
});

test("descriptive Task set names do not restrict the Call data reader or broaden the predecessor", async () => {
  const find = await parse(source.replace('<bpmn:inputSet id="Inputs_FinalReview">', '<bpmn:inputSet id="Inputs_FinalReview" name="Required">'));
  assert.ok(projectProcessDataInputOutputUserTask(find("Task_FinalReview"), find("SupplierOnboarding")));
  assert.equal(projectOwnedDataInputOutputUserTask(find("Task_FinalReview"), find("SupplierOnboarding")), undefined);
});

for (const [name, before, after] of [
  ["foreign Property input", "<bpmn:sourceRef>Input_ProcessSummary</bpmn:sourceRef>", "<bpmn:sourceRef>Property_SupplierSummary</bpmn:sourceRef>"],
  ["foreign Property output", "<bpmn:targetRef>Output_ProcessDecision</bpmn:targetRef>", "<bpmn:targetRef>Property_DueDiligenceDecision</bpmn:targetRef>"],
  ["output used as input", "<bpmn:sourceRef>Input_ProcessSummary</bpmn:sourceRef>", "<bpmn:sourceRef>Output_ProcessDecision</bpmn:sourceRef>"],
  ["input used as output", "<bpmn:targetRef>Output_ProcessDecision</bpmn:targetRef>", "<bpmn:targetRef>Input_ProcessSummary</bpmn:targetRef>"],
] as const) {
  test(`Process task projection refuses ${name}`, async () => {
    const xml = source.replace(before, after);
    assert.notEqual(xml, source);
    const find = await parse(xml);
    assert.equal(projectProcessDataInputOutputUserTask(find("Task_AssessSupplier"), find("SupplierDueDiligence")), undefined);
  });
}

test("task membership cannot hide a foreign declared Process owner", async () => {
  const find = await parse();
  const task = find("Task_AssessSupplier");
  const process = find("SupplierDueDiligence");
  assert.ok(projectProcessDataInputOutputUserTask(task, process));
  task.$parent = find("SupplierOnboarding");
  assert.equal(projectProcessDataInputOutputUserTask(task, process), undefined);
});

test("foreign parser objects with identical IDs cannot supply Process interface endpoints", async () => {
  const find = await parse();
  const other = await parse();
  const task = find("Task_AssessSupplier");
  const associations = task.dataInputAssociations as Array<Record<string, unknown>>;
  assert.ok(associations[0]);
  associations[0].sourceRef = [other("Input_ProcessSummary")];
  assert.equal(projectProcessDataInputOutputUserTask(task, find("SupplierDueDiligence")), undefined);
});
