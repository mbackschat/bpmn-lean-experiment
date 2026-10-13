/**
 * Locks the source admission of the serial portable-value handoff: one executable Process under the BPMN default
 * expression language with exactly Start, two owned Data Input/Output User Tasks and End, three declared and pairwise
 * distinct Properties wired P_in to P_mid to P_out, and no other content.
 *
 * The oracle is the amendment's source contract and BPMN Clauses 10.4.1 and 10.4.2. Each negative alters one fact of
 * the admitted document, and business spellings never decide: only the wiring of the three Properties does.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome, SemanticOperationKind, SemanticProfileId, SimpleBooleanExpressionLanguage, StimulusKind,
  VariableValueKind, applyStimulus, initialState, isWellFormedSemanticProcessProgram, portableHandoffCheckedGraph,
  structuredCompositionCheckedGraph,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, CheckedProcess, SemanticProcessProgram, VariableBinding } from "@bpmn-lean/semantic-core";
import { BpmnCompilationStatus, CheckedNodeKind, compileBpmnToSemanticProcess, lowerCheckedProcess } from "@bpmn-lean/bpmn-source";

const profile = SemanticProfileId.PortableBusinessValuesHandoff;

function dataTask(id: string, input: string, output: string): string {
  return `<bpmn:userTask id="${id}" name="${id}">
    <bpmn:ioSpecification id="${id}_io">
      <bpmn:dataInput id="${id}_in" />
      <bpmn:dataOutput id="${id}_out" />
      <bpmn:inputSet id="${id}_inputs"><bpmn:dataInputRefs>${id}_in</bpmn:dataInputRefs></bpmn:inputSet>
      <bpmn:outputSet id="${id}_outputs"><bpmn:dataOutputRefs>${id}_out</bpmn:dataOutputRefs></bpmn:outputSet>
    </bpmn:ioSpecification>
    <bpmn:dataInputAssociation id="${id}_read"><bpmn:sourceRef>${input}</bpmn:sourceRef><bpmn:targetRef>${id}_in</bpmn:targetRef></bpmn:dataInputAssociation>
    <bpmn:dataOutputAssociation id="${id}_write"><bpmn:sourceRef>${id}_out</bpmn:sourceRef><bpmn:targetRef>${output}</bpmn:targetRef></bpmn:dataOutputAssociation>
  </bpmn:userTask>`;
}

function document(body: string, language = ""): string {
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions"
    targetNamespace="urn:order"${language}>
    <bpmn:process id="Order" isExecutable="true">${body}</bpmn:process>
  </bpmn:definitions>`;
}

function flow(id: string, source: string, target: string, condition?: string): string {
  return `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}">${condition === undefined ? "" :
    `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${condition}</bpmn:conditionExpression>`}</bpmn:sequenceFlow>`;
}

const properties = '<bpmn:property id="order" /><bpmn:property id="reviewed" /><bpmn:property id="archived" />';
const serialBody = `${properties}<bpmn:startEvent id="start" />
  ${dataTask("review", "order", "reviewed")}${dataTask("archive", "reviewed", "archived")}
  <bpmn:endEvent id="end" />${flow("first", "start", "review")}${flow("handoff", "review", "archive")}${flow("last", "archive", "end")}`;
const serial = document(serialBody);

async function compile(xml: string, semanticProfile: string = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "handoff-source",
    expectedSha256: undefined, semanticProfile, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

async function accepted(xml: string) {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result));
  if (result.status !== BpmnCompilationStatus.Accepted) assert.fail("expected an accepted compilation");
  return result;
}

const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const checkedGraph = (checked: CheckedProcess) => ({ ...checked, flows: checked.sequenceFlows });

test("compiles the serial handoff under the BPMN default expression language", async () => {
  const result = await accepted(serial);
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind).sort(), [
    CheckedNodeKind.DataInputOutputUserTask, CheckedNodeKind.DataInputOutputUserTask,
    CheckedNodeKind.NoneEndEvent, CheckedNodeKind.NoneStartEvent,
  ]);
  assert.equal(portableHandoffCheckedGraph(checkedGraph(result.checkedProcess)), true);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(lowerCheckedProcess(result.checkedProcess), result.semanticProcess);
  assert.equal(result.semanticProcess.identity.semanticProfile, profile);
  const tasks = result.semanticProcess.operations.filter((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask);
  assert.equal(tasks.length, 2);
});

test("an explicit non-default expression language is refused while the explicit BPMN default is admitted", async () => {
  const simple = document(serialBody, ` expressionLanguage="${SimpleBooleanExpressionLanguage}"`);
  assert.equal((await compile(simple)).status, BpmnCompilationStatus.Rejected);
  const explicitDefault = document(serialBody, ' expressionLanguage="http://www.w3.org/1999/XPath"');
  assert.equal((await compile(explicitDefault)).status, BpmnCompilationStatus.Accepted);
});

test("the structured-composition profile still demands its own expression language for the same document", async () => {
  assert.equal((await compile(serial, SemanticProfileId.StructuredProcessComposition)).status, BpmnCompilationStatus.Rejected);
});

test("ids, names and declaration order do not decide admission", async () => {
  const names = new Map([["order", "p3"], ["reviewed", "p1"], ["archived", "p2"], ["review", "TaskB"], ["archive", "TaskA"],
    ["start", "S0"], ["end", "Z9"], ["first", "f1"], ["handoff", "f2"], ["last", "f3"], ["Order", "Proc"]]);
  const rename = (xml: string) => xml.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/gu, (word) => names.get(word) ?? word);
  const renamed = rename(serial).replace('name="TaskB"', 'name="Pruefen"').replace('name="TaskA"', 'name="Archivieren"');
  const result = await accepted(renamed);
  assert.equal(portableHandoffCheckedGraph(checkedGraph(result.checkedProcess)), true);
  // Properties declared in a different order than they are used, with the second task declared first.
  const reordered = document(`<bpmn:property id="archived" /><bpmn:property id="order" /><bpmn:property id="reviewed" />
    ${flow("last", "archive", "end")}${dataTask("archive", "reviewed", "archived")}<bpmn:endEvent id="end" />
    ${dataTask("review", "order", "reviewed")}<bpmn:startEvent id="start" />${flow("handoff", "review", "archive")}${flow("first", "start", "review")}`);
  const swapped = await accepted(reordered);
  assert.deepEqual(swapped.checkedProcess.nodes.map(({ id }) => id).sort(), ["archive", "end", "review", "start"]);
  assert.equal(portableHandoffCheckedGraph(checkedGraph(swapped.checkedProcess)), true);
  const business = serial.replaceAll('"order"', '"Invoice"').replaceAll(">order<", ">Invoice<")
    .replaceAll('"reviewed"', '"Decision"').replaceAll(">reviewed<", ">Decision<")
    .replaceAll('"archived"', '"Receipt"').replaceAll(">archived<", ">Receipt<");
  assert.notEqual(business, serial);
  await accepted(business);
});

test("refuses an extra node, a gateway, a third task and an ordinary task", async () => {
  const mutations: readonly [string, string][] = [
    ["disconnected task", serial.replace("</bpmn:process>", '<bpmn:userTask id="Extra" /></bpmn:process>')],
    ["extra end", serial.replace("</bpmn:process>", `<bpmn:endEvent id="end2" />${flow("side", "start", "end2")}</bpmn:process>`)],
    ["gateway on the path", serial.replace(flow("handoff", "review", "archive"),
      `<bpmn:exclusiveGateway id="gate" />${flow("handoff", "review", "gate")}${flow("through", "gate", "archive")}`)],
    ["third task", serial.replace(flow("last", "archive", "end"),
      `${dataTask("audit", "archived", "audited")}${flow("last", "archive", "audit")}${flow("done", "audit", "end")}`)
      .replace(properties, `${properties}<bpmn:property id="audited" />`)],
    ["ordinary middle task", serial.replace(dataTask("archive", "reviewed", "archived"), '<bpmn:userTask id="archive" />')],
    ["ordinary first task", serial.replace(dataTask("review", "order", "reviewed"), '<bpmn:userTask id="review" />')],
    ["parallel duplicate flow", serial.replace("</bpmn:process>", `${flow("again", "review", "archive")}</bpmn:process>`)],
    ["conditioned flow", serial.replace(flow("last", "archive", "end"), flow("last", "archive", "end", "true"))],
  ];
  for (const [label, xml] of mutations) {
    assert.notEqual(xml, serial, label);
    assert.equal((await compile(xml)).status, BpmnCompilationStatus.Rejected, label);
  }
});

test("refuses a shared, extra or missing Property", async () => {
  const mutations: readonly [string, string][] = [
    ["P_mid aliases P_in", serial.replace('<bpmn:targetRef>reviewed</bpmn:targetRef>', '<bpmn:targetRef>order</bpmn:targetRef>')],
    ["P_out aliases P_mid", serial.replace('<bpmn:targetRef>archived</bpmn:targetRef>', '<bpmn:targetRef>reviewed</bpmn:targetRef>')],
    ["P_out aliases P_in", serial.replace('<bpmn:targetRef>archived</bpmn:targetRef>', '<bpmn:targetRef>order</bpmn:targetRef>')],
    ["second task reads P_in", serial.replace('<bpmn:sourceRef>reviewed</bpmn:sourceRef>', '<bpmn:sourceRef>order</bpmn:sourceRef>')],
    ["extra declared Property", serial.replace(properties, `${properties}<bpmn:property id="spare" />`)],
    ["missing declared Property", serial.replace('<bpmn:property id="archived" />', "")],
    ["Property with a datatype", serial.replace('<bpmn:property id="order" />', '<bpmn:property id="order" itemSubjectRef="Item" />')],
  ];
  for (const [label, xml] of mutations) {
    assert.notEqual(xml, serial, label);
    assert.equal((await compile(xml)).status, BpmnCompilationStatus.Rejected, label);
  }
});

test("refuses cross-Activity bindings and unselected source content", async () => {
  const mutations: readonly [string, string][] = [
    ["cross-Activity input", serial.replace('<bpmn:targetRef>archive_in</bpmn:targetRef>', '<bpmn:targetRef>review_in</bpmn:targetRef>')],
    ["cross-Activity output", serial.replace('<bpmn:sourceRef>archive_out</bpmn:sourceRef>', '<bpmn:sourceRef>review_out</bpmn:sourceRef>')],
    ["foreign attribute", serial.replace('id="review"', 'id="review" xmlns:ext="urn:foreign" ext:value="x"')],
    ["unselected loop", serial.replace("</bpmn:userTask>", "<bpmn:standardLoopCharacteristics /></bpmn:userTask>")],
    ["optional input", serial.replace("</bpmn:inputSet>", "<bpmn:optionalInputRefs>review_in</bpmn:optionalInputRefs></bpmn:inputSet>")],
    ["collection input", serial.replace('id="review_in"', 'id="review_in" isCollection="true"')],
    ["input datatype", serial.replace('id="review_in"', 'id="review_in" itemSubjectRef="Item"')],
  ];
  for (const [label, xml] of mutations) {
    assert.notEqual(xml, serial, label);
    assert.equal((await compile(xml)).status, BpmnCompilationStatus.Rejected, label);
  }
});

test("checked and Program admission keep global data identity independently", async () => {
  const result = await accepted(serial);
  const mutations = [
    ["directInput", "targetDataInputId", "review_in"], ["directOutput", "sourceDataOutputId", "review_out"],
    ["directInput", "associationId", "review_read"], ["directOutput", "associationId", "review_write"],
    ["directInput", "associationId", "review"], ["directInput", "targetDataInputId", "order"],
    ["directOutput", "target", "review_in"], ["directInput", "associationId", "first"],
    ["directOutput", "sourceDataOutputId", "Order"],
  ] as const;
  for (const [side, field, alias] of mutations) {
    const label = `${side}.${field} aliases ${alias}`;
    const value = field === "target" ? { kind: "property", propertyId: alias } : alias;
    const checked: CheckedProcess = { ...result.checkedProcess, nodes: result.checkedProcess.nodes.map((node) =>
      node.kind === CheckedNodeKind.DataInputOutputUserTask && node.id === "archive"
        ? { ...node, [side]: { ...node[side], [field]: value } } : node) };
    const program: SemanticProcessProgram = { ...result.semanticProcess, operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask && operation.task.elementId === "archive"
        ? { ...operation, [side]: { ...operation[side], [field]: value } } : operation) };
    assert.deepEqual([portableHandoffCheckedGraph(checkedGraph(checked)), isWellFormedSemanticProcessProgram(program)], [false, false], label);
  }
  // Wiring is part of the checked graph, so a task reading a Property nobody wrote is refused by both representations.
  const unwired: CheckedProcess = { ...result.checkedProcess, nodes: result.checkedProcess.nodes.map((node) =>
    node.kind === CheckedNodeKind.DataInputOutputUserTask && node.id === "archive"
      ? { ...node, directInput: { ...node.directInput, source: { kind: "property", propertyId: "archived" } } } : node) };
  assert.equal(portableHandoffCheckedGraph(checkedGraph(unwired)), false);
  assert.equal(structuredCompositionCheckedGraph(checkedGraph(result.checkedProcess)), true, "the predecessor graph still admits the shape");
});

test("the compiled handoff carries a nested order through both tasks", async () => {
  const result = await accepted(serial);
  const program = result.semanticProcess;
  const word = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
  // Entries are in canonical key order; the equal list members must stay two members at every hand-off.
  const order: BusinessValue = { kind: VariableValueKind.Map, value: [
    { name: "tags", value: { kind: VariableValueKind.List, value: [word("x"), word("x")] } },
    { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "-125", scale: 2 } }] };
  const start = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start", processId: "Order",
    instanceId: "order-1", initialVariables: [{ name: "order", value: order }] });
  assert.equal(start.outcome, CommandOutcome.Committed);
  const review = applyStimulus(program, start.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
    taskId: { processInstanceId: "order-1", elementId: "review", activation: 1 }, submittedValues: [{ name: "review_out", value: order }] });
  assert.equal(review.outcome, CommandOutcome.Committed);
  assert.deepEqual(review.state.variables.activities.map(({ bindings }) => bindings), [[{ name: "archive_in", value: order }]]);
  const refused = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start", processId: "Order",
    instanceId: "order-2", initialVariables: [text("order", "x"), text("extra", "y")] });
  assert.equal(refused.outcome, CommandOutcome.Rejected);
});
