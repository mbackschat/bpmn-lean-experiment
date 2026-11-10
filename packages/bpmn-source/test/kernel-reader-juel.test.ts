/**
 * The JUEL reader (`kernel-reader/juel.ts`) through `readKernelProgram`: each row is one `camunda:inputParameter` text
 * and the IL source it reads to, a node table in post-order or the `foreign` text the pinned grammar refuses. The
 * oracle is the pinned `cibseven-juel` `Scanner` and `Parser`, cited per row in the expression semantics
 * (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#grammar-at-core); the reader is checked against them here and
 * against the retained CIB evidence end to end. The defect rows lock the two reader fixes of PC-DATA-04 and PC-DATA-07.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelJson } from "@bpmn-lean/bpmn-source";

const camunda = "http://camunda.org/schema/1.0/bpmn";
const xsi = "http://www.w3.org/2001/XMLSchema-instance";
const juelLanguage = "urn:cibseven:expression-language:juel";

const escapeXml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function model(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="${camunda}" xmlns:xsi="${xsi}" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">${body}</bpmn:process></bpmn:definitions>`;
}

async function program(xml: string): Promise<Record<string, unknown>> {
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(xml),
    overlay: null,
    profile: "juel-reader",
    limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  return (read as unknown as { program: Record<string, unknown> }).program;
}

const elementOf = (read: Record<string, unknown>, id: string): Record<string, unknown> => {
  const elements = read.elements as Array<Record<string, Record<string, unknown>>>;
  const entry = elements.map((element) => Object.values(element)[0] as Record<string, unknown>)
    .find((payload) => (payload.header as Record<string, unknown>).id === id);
  assert.ok(entry !== undefined, id);
  return entry;
};

/** The source an input parameter with `text` reads to. */
async function inputSource(text: string): Promise<KernelJson> {
  const xml = model(`<bpmn:userTask id="U"><bpmn:extensionElements><camunda:inputOutput>
<camunda:inputParameter name="value">${escapeXml(text)}</camunda:inputParameter></camunda:inputOutput></bpmn:extensionElements></bpmn:userTask>`);
  const payload = elementOf(await program(xml), "U").payload as Record<string, Record<string, unknown>>;
  const inputs = payload.envelope?.inputs as Array<Record<string, KernelJson>>;
  return inputs[0]?.source ?? null;
}

const nodes = (...table: KernelJson[]): KernelJson => ({ juel: { nodes: table } });
const id = (name: string): KernelJson => ({ identifier: { name } });
const int = (digits: string): KernelJson => ({ integer: { digits } });
const str = (value: string): KernelJson => ({ stringLiteral: { value } });
const text = (value: string): KernelJson => ({ text: { value } });
const bin = (op: string, left: number, right: number): KernelJson => ({ binary: { payload: { op, left, right } } });
const foreign = (source: string): KernelJson => ({ foreign: { language: juelLanguage, source } });

const rows: ReadonlyArray<readonly [string, string, KernelJson]> = [
  ["a single variable read stays a variable", "${amount}", { variable: { name: "amount" } }],
  ["text without an eval is a String literal", "plain", { literal: { value: { kind: "string", value: "plain" } } }],
  ["precedence: * before +", "${a + b * 2}", nodes(id("a"), id("b"), int("2"), bin("mul", 1, 2), bin("add", 0, 3))],
  ["left associativity", "${a - b - 1}", nodes(id("a"), id("b"), bin("sub", 0, 1), int("1"), bin("sub", 2, 3))],
  ["word operators", "${a gt 1 and not b}", nodes(id("a"), int("1"), bin("gt", 0, 1), id("b"), { unary: { op: "not", operand: 3 } }, bin("and", 2, 4))],
  ["choice is right-nested", "${a ? 1 : b ? 2 : 3}", nodes(id("a"), int("1"), id("b"), int("2"), int("3"),
    { choice: { payload: { condition: 2, whenTrue: 3, whenFalse: 4 } } },
    { choice: { payload: { condition: 0, whenTrue: 1, whenFalse: 5 } } })],
  ["parentheses leave no node", "${(a)}", { variable: { name: "a" } }],
  ["string escapes: only the backslash and the quote", "${'it\\'s \\\\'}", nodes(str("it's \\"))],
  ["leading zeros are an integer literal", "${007}", nodes(int("007"))],
  ["a point makes a floating literal", "${1.5}", nodes({ float: { lexeme: "1.5" } })],
  ["an exponent without digits ends the integer", "${2e}", foreign("${2e}")],
  ["composite of text and evals", "n=${a}!", nodes(text("n="), id("a"), text("!"), { composite: { parts: [0, 1, 2] } })],
  ["an escaped delimiter is text", "\\${a}", { literal: { value: { kind: "string", value: "${a}" } } }],
  ["a backslash before an escape stays armed", "\\\\${a}", { literal: { value: { kind: "string", value: "\\${a}" } } }],
  ["mixed delimiters are a syntax error", "${a}#{b}", foreign("${a}#{b}")],
  ["deferred delimiter alone", "#{a + 1}", nodes(id("a"), int("1"), bin("add", 0, 1))],
  ["dot and bracket access", "${order.lines[0]}", nodes(id("order"), { dot: { base: 0, property: "lines" } }, int("0"), { bracket: { base: 1, property: 2 } })],
  // The reader keeps the method name as written; the kernel codecs look it up among the listed methods.
  ["a method call keeps its written name", "${s.substring(1, 2)}", nodes(id("s"), int("1"), int("2"),
    { call: { payload: { receiver: 0, target: "substring", args: [1, 2] } } })],
  ["an unlisted method keeps its name too", "${s.getClass()}", nodes(id("s"), { call: { payload: { receiver: 0, target: "getClass", args: [] } } })],
  ["a method named by a bracket", "${s['length']()}", nodes(id("s"), str("length"), { computedCall: { payload: { receiver: 0, name: 1, args: [] } } })],
  ["a namespaced function", "${f:g(1)}", nodes(int("1"), { function: { payload: { qualifier: "f", name: "g", args: [0] } } })],
  ["a keyword after a dot is a syntax error", "${word.empty}", foreign("${word.empty}")],
  ["instanceof has no production", "${a instanceof b}", foreign("${a instanceof b}")],
  ["a non-ASCII identifier is unparsed", "${größe}", foreign("${größe}")],
  ["non-ASCII whitespace is unparsed", "${a　+ 1}", foreign("${a　+ 1}")],
  ["non-ASCII text in a string literal is read", "${'größe'}", nodes(str("größe"))],
  ["an integer literal beyond Long is a syntax error", "${9223372036854775808}", foreign("${9223372036854775808}")],
  ["assignment is EL 3.0", "${a = 1}", foreign("${a = 1}")],
];

for (const [name, source, expected] of rows) {
  test(`juel reader: ${name}`, async () => {
    assert.deepEqual(await inputSource(source), expected);
  });
}

// Defect (PC-DATA-04, found 2026-11-10): `${null}` and every EL reserved word were read as a variable of that name.
test("juel reader: a reserved word is never a variable name", async () => {
  assert.deepEqual(await inputSource("${null}"), nodes("null"));
  assert.deepEqual(await inputSource("${true}"), nodes({ bool: { value: true } }));
  assert.deepEqual(await inputSource("${empty a}"), nodes(id("a"), { unary: { op: "empty", operand: 0 } }));
});

// Defect (PC-DATA-07, found 2026-11-10): a `camunda:in` `sourceExpression` read an absent name as null, as a `source` copy
// does (CIB-EXT-0021), where CIB's `ElValueProvider` fails the evaluation.
test("juel reader: a Call sourceExpression is an ioParameter mapping, a source copy a callVariable one", async () => {
  const xml = model(`<bpmn:callActivity id="C" calledElement="Q"><bpmn:extensionElements>
<camunda:in sourceExpression="\${missing + 1}" target="x"/><camunda:in source="y" target="z"/></bpmn:extensionElements></bpmn:callActivity>`)
    .replace("</bpmn:process>", `</bpmn:process><bpmn:process id="Q" isExecutable="true"><bpmn:task id="QT"/></bpmn:process>`);
  const payload = elementOf(await program(xml), "C").payload as Record<string, Record<string, unknown>>;
  const work = (payload.work as Record<string, Record<string, unknown>>).call?.payload as Record<string, unknown>;
  assert.deepEqual(work.inputs, [
    { target: "x", source: nodes(id("missing"), int("1"), bin("add", 0, 1)), dialect: "ioParameter" },
    { target: "z", source: { variable: { name: "y" } }, dialect: "callVariable" },
  ]);
});

test("juel reader: an undeclared condition is JUEL, text alone included; a declared language stays foreign", async () => {
  const condition = (attributes: string, body: string): string => model(`<bpmn:startEvent id="S"/><bpmn:exclusiveGateway id="G"/>
<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G"/>
<bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression"${attributes}>${body}</bpmn:conditionExpression></bpmn:sequenceFlow>`);
  const conditionOf = async (xml: string): Promise<KernelJson> =>
    ((await program(xml)).flows as Array<Record<string, KernelJson>>).find((flow) => flow.id === "F1")?.condition ?? null;
  assert.deepEqual(await conditionOf(condition("", "${a &gt; 1}")), nodes(id("a"), int("1"), bin("gt", 0, 1)));
  assert.deepEqual(await conditionOf(condition("", "true")), nodes(text("true")));
  assert.deepEqual(await conditionOf(condition(` language="javascript"`, "a")), { foreign: { language: "javascript", source: "a" } });
});

test("juel reader: a Sequence Flow's undeclared condition is trimmed as CIB trims it; the Multi-Instance loop bodies are not", async () => {
  // CIB applies Java `String.trim` to a Sequence Flow condition (`BpmnParse.java:4394`, `:4400`) but reads
  // `loopCardinality` and `completionCondition` untrimmed (`:1826`, `:1836`). A Simple Boolean body keeps its text: that
  // language forbids surrounding whitespace.
  const flowCondition = (attributes: string, body: string): string => model(`<bpmn:startEvent id="S"/><bpmn:exclusiveGateway id="G"/>
<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G"/>
<bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression"${attributes}>${body}</bpmn:conditionExpression></bpmn:sequenceFlow>`);
  const conditionOf = async (xml: string): Promise<KernelJson> =>
    ((await program(xml)).flows as Array<Record<string, KernelJson>>).find((flow) => flow.id === "F1")?.condition ?? null;
  assert.deepEqual(await conditionOf(flowCondition("", "\n  ${approved}\t ")), { variable: { name: "approved" } });
  assert.deepEqual(await conditionOf(flowCondition("", " ${a &gt; 1} ")), nodes(id("a"), int("1"), bin("gt", 0, 1)));
  const simpleBoolean = "urn:bpmn-lean:expression:simple-boolean:v1";
  assert.deepEqual(await conditionOf(flowCondition(` language="${simpleBoolean}"`, " true ")), { foreign: { language: simpleBoolean, source: " true " } });
  const loop = model(`<bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics>
<bpmn:loopCardinality> 2 </bpmn:loopCardinality><bpmn:completionCondition> \${done} </bpmn:completionCondition>
</bpmn:multiInstanceLoopCharacteristics></bpmn:userTask>`);
  const multiInstance = (elementOf(await program(loop), "U").payload as Record<string, Record<string, Record<string, KernelJson>>>).envelope?.multiInstance;
  assert.deepEqual(multiInstance?.count, { cardinality: { count: nodes(text(" 2 ")) } });
  assert.deepEqual(multiInstance?.completionCondition, nodes(text(" "), id("done"), text(" "), { composite: { parts: [0, 1, 2] } }));
});

test("juel reader: a condition's camunda:resource and a Call copy's local flag are refused as facts no IL field carries", async () => {
  const refusal = async (xml: string): Promise<unknown> => {
    const read = await readKernelProgram({
      bytes: new TextEncoder().encode(xml), overlay: null, profile: "juel-reader", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
    }, kernelProfileOptions([]));
    return read.kind === "refused" ? [read.code, read.evidence] : read.kind;
  };
  assert.deepEqual(await refusal(model(`<bpmn:startEvent id="S"/><bpmn:exclusiveGateway id="G"/><bpmn:endEvent id="E"/>
<bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="G"/><bpmn:sequenceFlow id="F1" sourceRef="G" targetRef="E">
<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" camunda:resource="r.js">\${a}</bpmn:conditionExpression></bpmn:sequenceFlow>`)),
  ["reader.factNotCarried", "camunda:resource"]);
  assert.deepEqual(await refusal(model(`<bpmn:callActivity id="C" calledElement="Q"><bpmn:extensionElements>
<camunda:in source="y" target="z" local="true"/></bpmn:extensionElements></bpmn:callActivity>`)
    .replace("</bpmn:process>", `</bpmn:process><bpmn:process id="Q" isExecutable="true"><bpmn:task id="QT"/></bpmn:process>`)),
  ["reader.factNotCarried", "camunda:in/out local"]);
});
