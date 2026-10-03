import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID,
  SimpleBooleanExpressionLanguage,
  CommandOutcome, StimulusKind, VariableValueKind, applyStimulus, initialState,
  structuredCompositionCheckedGraph, isWellFormedSemanticProcessProgram, SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import type { VariableBinding, CheckedProcess, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  compileBpmnToSemanticProcess, lowerCheckedProcess,
} from "@bpmn-lean/bpmn-source";

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

function document(body: string): string {
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions"
    targetNamespace="urn:invoice" expressionLanguage="${SimpleBooleanExpressionLanguage}">
    <bpmn:process id="Invoice" isExecutable="true">${body}</bpmn:process>
  </bpmn:definitions>`;
}

const properties = '<bpmn:property id="summary" /><bpmn:property id="decision" /><bpmn:property id="receipt" />';
const serial = document(`${properties}<bpmn:startEvent id="start" />
  ${dataTask("assess", "summary", "decision")}${dataTask("archive", "decision", "receipt")}
  <bpmn:endEvent id="end" />
  <bpmn:sequenceFlow id="first" sourceRef="start" targetRef="assess" />
  <bpmn:sequenceFlow id="handoff" sourceRef="assess" targetRef="archive" />
  <bpmn:sequenceFlow id="last" sourceRef="archive" targetRef="end" />`);

async function compile(xml: string, semanticProfile = STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "composition-source",
    expectedSha256: undefined, semanticProfile, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

test("compiles serial scalar handoff with shared Process Property ownership", async () => {
  const result = await compile(serial);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result));
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  assert.deepEqual(result.checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.DataInputOutputUserTask), [
    { kind: CheckedNodeKind.DataInputOutputUserTask, id: "archive", name: "archive",
      directInput: { associationId: "archive_read", sourcePropertyId: "decision", targetDataInputId: "archive_in", targetDataInputName: null },
      directOutput: { associationId: "archive_write", sourceDataOutputId: "archive_out", sourceDataOutputName: null, targetPropertyId: "receipt" } },
    { kind: CheckedNodeKind.DataInputOutputUserTask, id: "assess", name: "assess",
      directInput: { associationId: "assess_read", sourcePropertyId: "summary", targetDataInputId: "assess_in", targetDataInputName: null },
      directOutput: { associationId: "assess_write", sourceDataOutputId: "assess_out", sourceDataOutputName: null, targetPropertyId: "decision" } },
  ]);
});

test("checked and standalone Program admission preserve global data identity with shared Properties", async () => {
  const result = await compile(serial);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  const admitted = (checked: CheckedProcess) => structuredCompositionCheckedGraph(
    { ...checked, flows: checked.sequenceFlows });
  assert.equal(admitted(result.checkedProcess), true);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const mutations = [
    ["directInput", "targetDataInputId", "assess_in"],
    ["directOutput", "sourceDataOutputId", "assess_out"],
    ["directInput", "associationId", "assess_read"],
    ["directOutput", "associationId", "assess_write"],
    ["directInput", "associationId", "assess"],
    ["directInput", "sourcePropertyId", "assess"],
    ["directInput", "targetDataInputId", "summary"],
    ["directOutput", "targetPropertyId", "assess_in"],
    ["directInput", "associationId", "first"],
    ["directInput", "sourcePropertyId", "first"],
    ["directOutput", "sourceDataOutputId", "Invoice"],
    ["directOutput", "targetPropertyId", "Invoice"],
  ] as const;
  for (const [side, field, alias] of mutations) {
    const label = `${side}.${field} aliases ${alias}`;
    const checked: CheckedProcess = { ...result.checkedProcess, nodes: result.checkedProcess.nodes.map((node) =>
      node.kind === CheckedNodeKind.DataInputOutputUserTask && node.id === "archive"
        ? { ...node, [side]: { ...node[side], [field]: alias } } : node) };
    const program: SemanticProcessProgram = { ...result.semanticProcess, operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask && operation.task.elementId === "archive"
        ? { ...operation, [side]: { ...operation[side], [field]: alias } } : operation) };
    assert.deepEqual(lowerCheckedProcess(checked), program, label);
    assert.deepEqual([admitted(checked), isWellFormedSemanticProcessProgram(program)], [false, false], label);
  }
});

test("compiles ordinary serial tasks under the same explicit expression language", async () => {
  const xml = document(`<bpmn:startEvent id="s" /><bpmn:userTask id="t" /><bpmn:endEvent id="e" />
    <bpmn:sequenceFlow id="a" sourceRef="s" targetRef="t" /><bpmn:sequenceFlow id="b" sourceRef="t" targetRef="e" />`);
  assert.equal((await compile(xml)).status, BpmnCompilationStatus.Accepted);
  assert.equal((await compile(xml.replace(` expressionLanguage="${SimpleBooleanExpressionLanguage}"`, ""))).status, BpmnCompilationStatus.Rejected);
});

test("checked composition rejects foreign family declarations even beside an ordinary graph", async () => {
  const result = await compile(serial);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  const graph = { ...result.checkedProcess, flows: result.checkedProcess.sequenceFlows };
  assert.equal(structuredCompositionCheckedGraph(graph), true);
  assert.deepEqual(["compensation", "transactionCancellation"].map((family) =>
    structuredCompositionCheckedGraph({ ...graph, [family]: {} })), [false, false]);
});

test("refuses aliases, cross-Activity bindings and unselected source content", async () => {
  const mutations: readonly [string, string][] = [
    ["same Process endpoint", serial.replace('<bpmn:targetRef>decision</bpmn:targetRef>', '<bpmn:targetRef>summary</bpmn:targetRef>')],
    ["cross-Activity input", serial.replace('<bpmn:targetRef>archive_in</bpmn:targetRef>', '<bpmn:targetRef>assess_in</bpmn:targetRef>')],
    ["cross-Activity output", serial.replace('<bpmn:sourceRef>archive_out</bpmn:sourceRef>', '<bpmn:sourceRef>assess_out</bpmn:sourceRef>')],
    ["foreign attribute", serial.replace('id="assess"', 'id="assess" xmlns:ext="urn:foreign" ext:value="x"')],
    ["unselected loop", serial.replace('</bpmn:userTask>', '<bpmn:standardLoopCharacteristics /></bpmn:userTask>')],
    ["optional input", serial.replace('</bpmn:inputSet>', '<bpmn:optionalInputRefs>assess_in</bpmn:optionalInputRefs></bpmn:inputSet>')],
    ["collection input", serial.replace('id="assess_in"', 'id="assess_in" isCollection="true"')],
  ];
  for (const [label, xml] of mutations) {
    assert.notEqual(xml, serial, label);
    assert.equal((await compile(xml)).status, BpmnCompilationStatus.Rejected, label);
  }
});

function flow(id: string, source: string, target: string, condition?: string): string {
  return `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}">${condition === undefined ? "" :
    `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${condition}</bpmn:conditionExpression>`}</bpmn:sequenceFlow>`;
}

function region(id: string, first: string, second: string, fallback: string): string {
  return `<bpmn:exclusiveGateway id="${id}" default="${id}_default" />
    <bpmn:exclusiveGateway id="${id}_merge" />` +
    flow(`${id}_first`, id, first, 'stringEquals(decision,"approved")') +
    flow(`${id}_second`, id, second, 'stringEquals(decision,"rejected")') +
    flow(`${id}_default`, id, fallback);
}

const invoice = document(`${properties}<bpmn:startEvent id="start" />
  ${dataTask("assess", "summary", "decision")}
  ${region("route", "approve", "reject", "manual")}
  <bpmn:userTask id="approve" /><bpmn:userTask id="reject" /><bpmn:userTask id="manual" />
  ${dataTask("archive", "decision", "receipt")}<bpmn:endEvent id="end" />
  ${flow("begin", "start", "assess")}${flow("decide", "assess", "route")}
  ${flow("approved", "approve", "route_merge")}${flow("rejected", "reject", "route_merge")}${flow("reviewed", "manual", "route_merge")}
  ${flow("archive_route", "route_merge", "archive")}${flow("finish", "archive", "end")}`);

const binding = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value },
});

for (const [decision, selected] of [["approved", "approve"], ["rejected", "reject"], [null, "manual"]] as const) {
  test(`compiled invoice follows ${selected} and transfers the output after its merge`, async () => {
    const result = await compile(invoice);
    assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result));
    if (result.status !== BpmnCompilationStatus.Accepted) return;
    const program = result.semanticProcess;
    const started = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess,
      commandId: "start", processId: "Invoice", instanceId: "invoice-1", initialVariables: [binding("summary", "Invoice 4711")] });
    assert.equal(started.outcome, CommandOutcome.Committed);
    let state = started.state;
    for (const [task, values, next] of [
      ["assess", [binding("assess_out", decision)], selected],
      [selected, [], "archive"],
      ["archive", [binding("archive_out", "saved")], null],
    ] as const) {
      const completed = applyStimulus(program, state, { kind: StimulusKind.CompleteUserTaskInstance,
        commandId: `complete-${task}`, taskId: { processInstanceId: "invoice-1", elementId: task, activation: 1 }, submittedValues: values });
      assert.equal(completed.outcome, CommandOutcome.Committed);
      assert.equal(completed.internalStepBoundExceeded, false);
      state = completed.state;
      assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), next === null ? [] : [next]);
      if (next === "archive") assert.deepEqual(state.variables.activities.map(({ bindings }) => bindings), [[binding("archive_in", decision)]]);
    }
    assert.deepEqual(state.variables.activities, []);
    assert.deepEqual(state.variables.process.bindings, [binding("decision", decision), binding("receipt", "saved"), binding("summary", "Invoice 4711")]);
  });
}

for (const keepNames of [true, false]) {
  test(`every source identity can change with display names ${keepNames ? "replaced" : "omitted"}`, async () => {
    const sourceIds = [...invoice.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]!);
    const renamed = new Map(sourceIds.map((id, index) => [id, `renamed_${index.toString().padStart(3, "0")}`]));
    const id = (original: string): string => {
      const value = renamed.get(original);
      assert.notEqual(value, undefined, original);
      return value!;
    };
    const xml = invoice
      .replace(/\b(id|sourceRef|targetRef|default)="([^"]+)"/gu, (_, attribute: string, value: string) => `${attribute}="${id(value)}"`)
      .replace(/(<bpmn:(?:sourceRef|targetRef|dataInputRefs|dataOutputRefs)>)([^<]+)(<\/bpmn:[^>]+>)/gu,
        (_, before: string, value: string, after: string) => `${before}${id(value)}${after}`)
      .replaceAll('stringEquals(decision,', `stringEquals(${id("decision")},`)
      .replace(/ name="([^"]+)"/gu, (_, name: string) => keepNames ? ` name="Display ${id(name)}"` : "");
    assert.deepEqual([...xml.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]), sourceIds.map(id));
    assert.ok(sourceIds.every(original => !xml.includes(`id="${original}"`)));
    const compiled = await compile(xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    for (const [decision, branch] of [["approved", "approve"], ["rejected", "reject"], [null, "manual"]] as const) {
      const started = applyStimulus(compiled.semanticProcess, initialState, { kind: StimulusKind.StartProcess,
        commandId: "start", processId: id("Invoice"), instanceId: "renamed-invoice",
        initialVariables: [binding(id("summary"), "Invoice 4711")] });
      assert.equal(started.outcome, CommandOutcome.Committed);
      let state = started.state;
      assert.deepEqual(state.userTaskWaits.map(wait => wait.id.elementId), [id("assess")]);
      for (const [task, values, next] of [
        ["assess", [binding(id("assess_out"), decision)], branch],
        [branch, [], "archive"],
        ["archive", [binding(id("archive_out"), "saved")], null],
      ] as const) {
        const result = applyStimulus(compiled.semanticProcess, state, { kind: StimulusKind.CompleteUserTaskInstance,
          commandId: `complete-${task}`, taskId: { processInstanceId: "renamed-invoice", elementId: id(task), activation: 1 },
          submittedValues: values });
        assert.equal(result.outcome, CommandOutcome.Committed);
        state = result.state;
        assert.deepEqual(state.userTaskWaits.map(wait => wait.id.elementId), next === null ? [] : [id(next)]);
        if (next === "archive") assert.deepEqual(state.variables.activities.map(scope => scope.bindings), [[binding(id("archive_in"), decision)]]);
      }
      assert.equal(state.control.kind, "completed");
      assert.deepEqual(state.variables.activities, []);
      assert.deepEqual(state.variables.process.bindings, [binding(id("summary"), "Invoice 4711"), binding(id("decision"), decision), binding(id("receipt"), "saved")]);
    }
  });
}

test("declaration permutation preserves source references while candidate declaration order remains semantic", async () => {
  const original = await compile(invoice);
  assert.equal(original.status, BpmnCompilationStatus.Accepted);
  if (original.status !== BpmnCompilationStatus.Accepted) return;
  const swapped = invoice.replace('<bpmn:userTask id="approve" /><bpmn:userTask id="reject" />', '<bpmn:userTask id="reject" /><bpmn:userTask id="approve" />');
  const result = await compile(swapped);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  assert.deepEqual(result.checkedProcess.nodes, original.checkedProcess.nodes);
  assert.deepEqual(result.checkedProcess.sequenceFlows, original.checkedProcess.sequenceFlows);
  const first = flow("route_first", "route", "approve", 'stringEquals(decision,"approved")');
  const second = flow("route_second", "route", "reject", 'stringEquals(decision,"rejected")');
  assert.ok(invoice.includes(first) && invoice.includes(second));
  const reversed = await compile(invoice.replace(first, "REPLACE_FIRST").replace(second, first).replace("REPLACE_FIRST", second));
  assert.equal(reversed.status, BpmnCompilationStatus.Accepted);
  if (reversed.status !== BpmnCompilationStatus.Accepted) return;
  const gateway = reversed.checkedProcess.nodes.find(({ id }) => id === "route");
  assert.equal(gateway?.kind, CheckedNodeKind.ExclusiveGateway);
  if (gateway?.kind === CheckedNodeKind.ExclusiveGateway) assert.deepEqual(gateway.candidateFlowIds, ["route_second", "route_first"]);
});

test("nested regions and empty branches contract without losing edge multiplicity", async () => {
  const xml = document(`<bpmn:startEvent id="s" /><bpmn:userTask id="t" /><bpmn:endEvent id="e" />
    ${region("outer", "inner", "outer_merge", "outer_merge")}
    ${region("inner", "inner_merge", "inner_merge", "inner_merge")}
    ${flow("a", "s", "outer")}${flow("b", "inner_merge", "outer_merge")}${flow("c", "outer_merge", "t")}${flow("d", "t", "e")}`);
  assert.equal((await compile(xml)).status, BpmnCompilationStatus.Accepted);
  assert.equal((await compile(xml.replace('id="b" sourceRef="inner_merge" targetRef="outer_merge"', 'id="b" sourceRef="inner_merge" targetRef="e"'))).status, BpmnCompilationStatus.Rejected);
});

test("structured source refuses a bypass, disconnected task and duplicate control edge", async () => {
  const mutations = [
    invoice.replace('id="reviewed" sourceRef="manual" targetRef="route_merge"', 'id="reviewed" sourceRef="manual" targetRef="end"'),
    invoice.replace('</bpmn:process>', '<bpmn:userTask id="Unreachable" /></bpmn:process>'),
    invoice.replace('</bpmn:process>', `${flow("duplicate", "assess", "route")}</bpmn:process>`),
  ];
  for (const xml of mutations) {
    assert.notEqual(xml, invoice);
    assert.equal((await compile(xml)).status, BpmnCompilationStatus.Rejected);
  }
});

test("overlapping conditions choose the first source-declared candidate after the associated write", async () => {
  const first = flow("route_first", "route", "approve", 'stringEquals(decision,"approved")');
  const second = flow("route_second", "route", "reject", 'stringEquals(decision,"approved")');
  const overlap = invoice.replace('stringEquals(decision,"rejected")', 'stringEquals(decision,"approved")');
  assert.ok(overlap.includes(first) && overlap.includes(second));
  const reversed = overlap.replace(first, "FIRST_CANDIDATE").replace(second, first).replace("FIRST_CANDIDATE", second);
  for (const [xml, selected] of [[overlap, "approve"], [reversed, "reject"]] as const) {
    const compiled = await compile(xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const started = applyStimulus(compiled.semanticProcess, initialState, { kind: StimulusKind.StartProcess,
      commandId: "start", processId: "Invoice", instanceId: "invoice-order", initialVariables: [binding("summary", "Invoice 4711")] });
    assert.equal(started.outcome, CommandOutcome.Committed);
    const completed = applyStimulus(compiled.semanticProcess, started.state, { kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "complete-assess", taskId: { processInstanceId: "invoice-order", elementId: "assess", activation: 1 },
      submittedValues: [binding("assess_out", "approved")] });
    assert.equal(completed.outcome, CommandOutcome.Committed);
    assert.deepEqual(completed.state.userTaskWaits.map(wait => wait.id.elementId), [selected]);
  }
});

test("source admission separates an eight-step closure from a nine-step empty route", async () => {
  const regions = ["one", "two", "three"].map((id) => region(id, `${id}_merge`, `${id}_merge`, `${id}_merge`)).join("");
  const body = `<bpmn:startEvent id="s" /><bpmn:userTask id="t" /><bpmn:endEvent id="e" />${regions}
    ${flow("a", "s", "one")}${flow("b", "one_merge", "two")}${flow("c", "two_merge", "three")}
    ${flow("d", "three_merge", "t")}${flow("f", "t", "e")}`;
  assert.equal((await compile(document(body))).status, BpmnCompilationStatus.Accepted);
  const over = body.replace('id="one_first" sourceRef="one" targetRef="one_merge"', 'id="one_first" sourceRef="one" targetRef="t"')
    .replace('id="d" sourceRef="three_merge" targetRef="t"', 'id="d" sourceRef="three_merge" targetRef="e"')
    .replace('id="f" sourceRef="t" targetRef="e"', 'id="f" sourceRef="t" targetRef="one_merge"');
  assert.equal((await compile(document(over))).status, BpmnCompilationStatus.Rejected);
});
