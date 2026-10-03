import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const { importBpmnGraph } = await import(
  new URL("../dist/moddle-adapter.js", import.meta.url).href
) as typeof import("../src/moddle-adapter.ts");
const { projectScalarIoSpecification } = await import(
  new URL("../dist/scalar-io-specification.js", import.meta.url).href
) as typeof import("../src/scalar-io-specification.ts");

const source = await readFile(new URL("./fixtures/call-activity-data-boundaries.bpmn", import.meta.url), "utf8");

async function owner(xml = source, id = "SupplierDueDiligence") {
  const graph = await importBpmnGraph(xml, 1_000);
  assert.deepEqual(graph.warnings, []);
  const value = [...graph.located.keys()].find((element) => element.id === id);
  assert.ok(value);
  return value;
}

test("retains Process interface owners, separate ports and exact required-set membership", async () => {
  const selected = projectScalarIoSpecification(await owner());
  assert.ok(selected);
  assert.deepEqual(selected.declaration, {
    ownerId: "SupplierDueDiligence", id: "IO_SupplierDueDiligence",
    input: { id: "Input_ProcessSummary", name: "Supplier summary" },
    output: { id: "Output_ProcessDecision", name: "Due diligence decision" },
    inputSet: { id: "Inputs_SupplierDueDiligence", name: null, dataInputRefs: ["Input_ProcessSummary"] },
    outputSet: { id: "Outputs_SupplierDueDiligence", name: null, dataOutputRefs: ["Output_ProcessDecision"] },
  });
});

test("the same scalar interface reader retains Call and task declarations", async () => {
  for (const id of ["Call_DueDiligence", "Task_AssessSupplier", "Task_FinalReview"]) {
    assert.equal(projectScalarIoSpecification(await owner(source, id))?.declaration.ownerId, id);
  }
});

test("descriptive port and set names do not control membership", async () => {
  const renamed = source.replace('id="Inputs_SupplierDueDiligence"', 'id="Inputs_SupplierDueDiligence" name="Input choice"')
    .replace('id="Outputs_SupplierDueDiligence"', 'id="Outputs_SupplierDueDiligence" name="Output choice"');
  assert.equal(projectScalarIoSpecification(await owner(renamed))?.declaration.inputSet.name, "Input choice");
  assert.ok(projectScalarIoSpecification(await owner(source.replace(/ name="[^"]*"/g, ""))));
});

for (const [name, mutate] of [
  ["collection input", (xml: string) => xml.replace('id="Input_ProcessSummary"', 'id="Input_ProcessSummary" isCollection="true"')],
  ["collection output", (xml: string) => xml.replace('id="Output_ProcessDecision"', 'id="Output_ProcessDecision" isCollection="true"')],
  ["optional input", (xml: string) => xml.replace("<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>", "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs><bpmn:optionalInputRefs>Input_ProcessSummary</bpmn:optionalInputRefs>")],
  ["while-executing output", (xml: string) => xml.replace("<bpmn:dataOutputRefs>Output_ProcessDecision</bpmn:dataOutputRefs>", "<bpmn:dataOutputRefs>Output_ProcessDecision</bpmn:dataOutputRefs><bpmn:whileExecutingOutputRefs>Output_ProcessDecision</bpmn:whileExecutingOutputRefs>")],
  ["foreign input reference", (xml: string) => xml.replace("<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>", "<bpmn:dataInputRefs>Input_CallSummary</bpmn:dataInputRefs>")],
  ["paired sets", (xml: string) => xml.replace("<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>", "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs><bpmn:outputSetRefs>Outputs_SupplierDueDiligence</bpmn:outputSetRefs>")],
  ["extra required port", (xml: string) => xml.replace('<bpmn:inputSet id="Inputs_SupplierDueDiligence">', '<bpmn:dataInput id="Input_Extra" /><bpmn:inputSet id="Inputs_SupplierDueDiligence">')],
  ["duplicate set reference", (xml: string) => xml.replace("<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>", "<bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs><bpmn:dataInputRefs>Input_ProcessSummary</bpmn:dataInputRefs>")],
] as const) {
  test(`scalar interface refuses ${name}`, async () => {
    const changed = mutate(source);
    assert.notEqual(changed, source);
    assert.equal(projectScalarIoSpecification(await owner(changed)), undefined);
  });
}

test("set references resolve by parser identity even when another object's ID matches", async () => {
  const selected = await owner();
  const parsed = await owner();
  const io = selected.ioSpecification as Record<string, unknown>;
  const foreignIo = parsed.ioSpecification as Record<string, unknown>;
  const inputSet = (io.inputSets as Array<Record<string, unknown>>)[0];
  assert.ok(inputSet);
  inputSet.dataInputRefs = foreignIo.dataInputs;
  assert.equal(projectScalarIoSpecification(selected), undefined);
});
