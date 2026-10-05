import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MappingExpressionKind as Mapping } from "@bpmn-lean/semantic-core";

const { importBpmnGraph } = await import(new URL("../dist/moddle-adapter.js", import.meta.url).href) as typeof import("../src/moddle-adapter.ts");
const { asElement, asElementArray } = await import(new URL("../dist/moddle-graph.js", import.meta.url).href) as typeof import("../src/moddle-graph.ts");
const { readSequentialSubProcessDeclaration: read, readParallelSubProcessDeclaration: readParallel } = await import(
  new URL("../dist/multi-instance-subprocess-source.js", import.meta.url).href
) as typeof import("../src/multi-instance-subprocess-source.ts");

const source = await readFile(new URL("../../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/sequential-mi-business-subprocess-probe.bpmn", import.meta.url), "utf8");
const loop = /<multiInstanceLoopCharacteristics[\s\S]*?\/>/u;
const inputs = /<extensionElements>[\s\S]*?<\/extensionElements>/u;
const handlers = new Set(["invoiceValidator"]);

async function parse(xml: string, reader = read) {
  const imported = await importBpmnGraph(xml, 5000);
  assert.deepEqual(imported.warnings, []);
  const definitions = asElement(imported.rootElement)!;
  const process = asElementArray(definitions.rootElements)![0]!;
  const body = asElementArray(process.flowElements)!.find(element => element.$type === "bpmn:SubProcess")!;
  return reader(body, definitions, handlers);
}

test("parallel declarations honor explicit false and the BPMN default without entering the sequential profile", async () => {
  assert.equal(typeof readParallel, "function");
  const explicit = source.replace('isSequential="true"', 'isSequential="false"');
  const omitted = source.replace(' isSequential="true"', "");
  const expected = await parse(source);
  assert.deepEqual(await parse(explicit, readParallel), expected);
  assert.deepEqual(await parse(omitted, readParallel), expected);
  assert.equal(await parse(explicit), undefined);
  assert.equal(await parse(omitted), undefined);
  assert.equal(await parse(source, readParallel), undefined);
});

test("parallel declarations retain the same bounded mappings and completion-condition restrictions", async () => {
  assert.equal(typeof readParallel, "function");
  const conditioned = source.replace(loop, '<multiInstanceLoopCharacteristics isSequential="false" camunda:collection="${items}" camunda:elementVariable="item"><completionCondition>${stopBatch}</completionCondition></multiInstanceLoopCharacteristics>');
  assert.deepEqual(await parse(conditioned, readParallel),
    await parse(conditioned.replace('isSequential="false"', 'isSequential="true"')));
  for (const xml of [
    conditioned.replace('>${stopBatch}<', '>${item}<'),
    conditioned.replace('>${stopBatch}<', '>${stopBatch == true}<'),
    conditioned.replace('camunda:elementVariable="item"', 'camunda:elementVariable="items"'),
    conditioned.replace('name="reviewStatus"', 'name="stopBatch"'),
    conditioned.replace('>pending<', '>${invoiceValidator}<'),
    conditioned.replace('<completionCondition>', '<loopCardinality>2</loopCardinality><completionCondition>'),
    conditioned.replace('inputParameter name="reviewStatus">pending</camunda:inputParameter>',
      'outputParameter name="reviewStatus">${result}</camunda:outputParameter>'),
    conditioned.replace('camunda:collection="${items}"', 'camunda:collection="${items}" camunda:asyncBefore="true"'),
  ]) assert.equal(await parse(xml, readParallel), undefined);
});

test("projects the CIB repeated invoice body's collection, item and canonical local inputs", async () => {
  assert.deepEqual(await parse(source), {
    collectionName: "items", itemName: "item", completionBooleanName: null,
    bodyInputs: [
      { target: "decision", expression: { kind: Mapping.StringLiteral, value: "unset" } },
      { target: "reviewStatus", expression: { kind: Mapping.StringLiteral, value: "pending" } },
    ], requiredInitializationInputs: [],
  });
  assert.deepEqual(await parse(source.replaceAll('id="ReviewInvoice"', 'id="OtherBody"')
    .replaceAll('Ref="ReviewInvoice"', 'Ref="OtherBody"')), await parse(source));
});

test("accepts exact collection references and a distinct Boolean completion-variable reference", async () => {
  const xml = source.replace(loop, '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="${items}" camunda:elementVariable="item"><completionCondition>${stopBatch}</completionCondition></multiInstanceLoopCharacteristics>');
  const projected = await parse(xml);
  assert.equal(projected?.collectionName, "items");
  assert.equal(projected?.completionBooleanName, "stopBatch");
  const formal = xml.replace('xmlns:camunda=', 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda=')
    .replace('<completionCondition>', '<completionCondition xsi:type="tFormalExpression">');
  assert.deepEqual(await parse(formal), projected);
});

test("initialization references remain Process requirements despite same-named body declarations", async () => {
  const declarations = ['<camunda:inputParameter name="a">seed</camunda:inputParameter>',
    '<camunda:inputParameter name="b">${a}</camunda:inputParameter>',
    '<camunda:inputParameter name="status">${status}</camunda:inputParameter>'];
  const projected = await parse(source.replace(inputs, `<extensionElements><camunda:inputOutput>${declarations.join("")}</camunda:inputOutput></extensionElements>`));
  assert.deepEqual(projected?.requiredInitializationInputs, ["a", "status"]);
  assert.deepEqual(await parse(source.replace(inputs, `<extensionElements><camunda:inputOutput>${declarations.reverse().join("")}</camunda:inputOutput></extensionElements>`)), projected);
});

test("normalizes CIB parameter text but excludes source null and structured parameter values", async () => {
  const normalized = await parse(source.replace('>pending<', '>  pending  <'));
  assert.deepEqual(normalized?.bodyInputs.find(mapping => mapping.target === "reviewStatus")?.expression,
    { kind: Mapping.StringLiteral, value: "pending" });
  for (const value of ["", "   ", "<camunda:list><camunda:value>x</camunda:value></camunda:list>", "${item.name}"]) {
    assert.equal(await parse(source.replace('>pending<', `>${value}<`)), undefined);
  }
});

test("preserves non-ASCII surrounding whitespace that CIB's Java trim leaves in a literal", async () => {
  for (const value of ["\u00a0pending\u00a0", "\u2003pending\u2003"]) {
    const projected = await parse(source.replace('>pending<', `>${value}<`));
    assert.deepEqual(projected?.bodyInputs.find(mapping => mapping.target === "reviewStatus")?.expression,
      { kind: Mapping.StringLiteral, value });
  }
});

test("refuses incompatible MI forms, unknown extensions and protected-name collisions", async () => {
  const forms = [
    '<multiInstanceLoopCharacteristics camunda:collection="items" camunda:elementVariable="item"/>',
    '<multiInstanceLoopCharacteristics isSequential="false" camunda:collection="items" camunda:elementVariable="item"/>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="${items.value}" camunda:elementVariable="item"/>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="items"/>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="invoiceValidator"/>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item" camunda:asyncBefore="true"/>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item"><loopCardinality>2</loopCardinality></multiInstanceLoopCharacteristics>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item"><completionCondition>${items}</completionCondition></multiInstanceLoopCharacteristics>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item"><completionCondition>${stopBatch == true}</completionCondition></multiInstanceLoopCharacteristics>',
    '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item"><completionCondition camunda:asyncBefore="true">${stopBatch}</completionCondition></multiInstanceLoopCharacteristics>',
  ];
  for (const form of forms) assert.equal(await parse(source.replace(loop, form)), undefined, form);
  for (const name of ["items", "item", "invoiceValidator"]) {
    assert.equal(await parse(source.replace('name="reviewStatus"', `name="${name}"`)), undefined, name);
  }
  assert.equal(await parse(source.replace('name="reviewStatus"', 'name="decision"')), undefined);
  assert.equal(await parse(source.replace('${item}', '${invoiceValidator}').replace('>pending<', '>${invoiceValidator}<')), undefined);
});

test("refuses MI output mappings and condition-variable redeclaration", async () => {
  assert.equal(await parse(source.replace('inputParameter name="reviewStatus">pending</camunda:inputParameter>',
    'outputParameter name="reviewStatus">${result}</camunda:outputParameter>')), undefined);
  const condition = '<multiInstanceLoopCharacteristics isSequential="true" camunda:collection="items" camunda:elementVariable="item"><completionCondition>${reviewStatus}</completionCondition></multiInstanceLoopCharacteristics>';
  assert.equal(await parse(source.replace(loop, condition)), undefined);
});
