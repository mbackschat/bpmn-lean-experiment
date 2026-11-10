/**
 * The reader's DMN resources and decision tasks (PC-AUTO-07, DECISION-SEMANTICS-SPEC "Parser and source binding" and
 * item 4): the FEEL unary-test subset read to the kernel IL's entries, a resource bound by its exact bytes, and every
 * form the reader cannot read faithfully refused with its stable code. Kinds and domains are admission's to check.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram, ReadRefusalCode } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

const dmn13 = "https://www.omg.org/spec/DMN/20191111/MODEL/";
const bpmn = (tasks: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">${tasks}</bpmn:process></bpmn:definitions>`;
const ruleTask = `<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:mapDecisionResult="singleEntry" camunda:resultVariable="r"/>`;

/** A DMN document with one decision `d` whose table has `body`; `root` adds attributes to `definitions`. */
const dmn = (body: string, root = "", namespace = dmn13): string => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${namespace}" id="Defs" name="Decisions" namespace="urn:t"${root}>
  <decision id="d" name="D"><decisionTable id="T">${body}</decisionTable></decision>
</definitions>`;
const scoreTable = (entries: string[], outputs: string[] = ["\"x\""], header = "") => `${header}
  <input id="I1" label="Score"><inputExpression id="IE1" typeRef="integer"><text>score</text></inputExpression></input>
  <output id="O1" name="grade" typeRef="string"/>
  ${entries.map((entry, index) => `<rule id="R${index}"><inputEntry id="E${index}"><text>${entry}</text></inputEntry>${
    outputs.map((output, at) => `<outputEntry id="OE${index}_${at}"><text>${output}</text></outputEntry>`).join("")}</rule>`).join("")}`;

async function read(dmnText: string, tasks = ruleTask, sha256?: string): Promise<KernelRead> {
  const bytes = new TextEncoder().encode(dmnText);
  return readKernelProgram({
    bytes: new TextEncoder().encode(bpmn(tasks)), overlay: null, profile: "any-profile",
    limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
    decisions: [{ bytes, sha256: sha256 ?? createHash("sha256").update(bytes).digest("hex") }],
  }, kernelProfileOptions([]));
}

async function resource(dmnText: string): Promise<Json> {
  const result = await read(dmnText);
  assert.equal(result.kind, "read", JSON.stringify(result));
  return ((result as Extract<KernelRead, { kind: "read" }>).program as Json).decisionResources[0];
}

/** The input entries of a one-input table whose rules have the given entry texts. */
async function entries(...texts: string[]): Promise<unknown[]> {
  const read_ = await resource(dmn(scoreTable(texts)));
  return read_.decisions[0].logic.table.value.rules.map((rule: Json) => rule.inputs[0]);
}

async function refusal(dmnText: string, tasks = ruleTask, sha256?: string): Promise<unknown> {
  const result = await read(dmnText, tasks, sha256);
  return result.kind === "refused" ? result.code : JSON.stringify(result).slice(0, 200);
}

const num = (coefficient: string, scale = 0) => ({ number: { coefficient, scale } });
const literal = (value: unknown) => ({ literal: { value } });
const testsOf = (negated: boolean, ...unary: unknown[]) => ({ tests: { value: { negated, first: unary[0], rest: unary.slice(1) } } });
const foreign = (text: string, language: string | null = null) => ({ foreign: { value: { language, text } } });

test("a resource is read with its namespace, digest and one decision table", async () => {
  const text = dmn(scoreTable(["&lt; 50"]), ` expressionLanguage="https://www.omg.org/spec/DMN/20191111/FEEL/"`);
  const read_ = await resource(text);
  assert.equal(read_.namespace, dmn13);
  assert.equal(read_.sourceSha256, createHash("sha256").update(text).digest("hex"));
  assert.equal(read_.expressionLanguage, "https://www.omg.org/spec/DMN/20191111/FEEL/");
  assert.deepEqual(read_.decisions[0], {
    id: "d",
    requires: [],
    logic: { table: { value: {
      hitPolicy: "unique",
      aggregation: null,
      inputs: [{ expression: { variable: { name: "score" } }, typeRef: "integer" }],
      outputs: [{ name: "grade", typeRef: "string" }],
      rules: [{ id: "R0", inputs: [testsOf(false, { compare: { operator: "lt", bound: num("50") } })], outputs: [literal({ string: { value: "x" } })] }],
    } } },
  });
});

test("the FEEL subset: literals, comparisons, intervals, lists, negation, dash and empty text", async () => {
  assert.deepEqual(await entries("-", "", " - ", "&lt;= -1.50", "&gt;=.5", "5", "\"a \\\"b\\\" \\\\\"", "true", "false", "null"), [
    "any", "any", "any",
    testsOf(false, { compare: { operator: "le", bound: num("-150", 2) } }),
    testsOf(false, { compare: { operator: "ge", bound: num("5", 1) } }),
    testsOf(false, literal(num("5"))),
    testsOf(false, literal({ string: { value: "a \"b\" \\" } })),
    testsOf(false, literal({ bool: { value: true } })),
    testsOf(false, literal({ bool: { value: false } })),
    testsOf(false, literal("null")),
  ]);
  const interval = (lowClosed: boolean, highClosed: boolean) =>
    ({ interval: { value: { low: num("40"), lowClosed, high: num("70"), highClosed } } });
  assert.deepEqual(await entries("[40..70]", "]40..70[", "(40 .. 70]", "[40..70)", "\"web\",\"app\"", "not( \"a\" , &gt; 3 )"), [
    testsOf(false, interval(true, true)),
    testsOf(false, interval(false, false)),
    testsOf(false, interval(false, true)),
    testsOf(false, interval(true, false)),
    testsOf(false, literal({ string: { value: "web" } }), literal({ string: { value: "app" } })),
    testsOf(true, literal({ string: { value: "a" } }), { compare: { operator: "gt", bound: num("3") } }),
  ]);
});

test("a text outside the grammar is foreign, never a guess", async () => {
  const texts = ["score &gt; 5", "trueish", "1e3", "+5", "\"a\\nb\"", "date(\"2020-01-01\")", "not \"a\"", "[1..]", "1,", " 5", "--"];
  assert.deepEqual(await entries(...texts), texts.map((text) => foreign(text.replace("&gt;", ">"))));
});

test("outputs: a literal, a blank entry, a foreign text, an element-level language", async () => {
  const table = await resource(dmn(scoreTable(["-"], ["-5", "", "\"a\" + \"b\""], "").replace(
    `<output id="O1" name="grade" typeRef="string"/>`,
    `<output id="O1" name="a" typeRef="integer"/><output id="O2" name="b"/><output id="O3" name="c" typeRef="Integer"/>`)));
  assert.deepEqual(table.decisions[0].logic.table.value.outputs,
    [{ name: "a", typeRef: "integer" }, { name: "b", typeRef: null }, { name: "c", typeRef: { foreign: { name: "Integer" } } }]);
  assert.deepEqual(table.decisions[0].logic.table.value.rules[0].outputs, [literal(num("-5")), "blank", foreign("\"a\" + \"b\"")]);
  const languages = await resource(dmn(scoreTable(["-"])).replace(`<inputEntry id="E0">`, `<inputEntry id="E0" expressionLanguage="juel">`));
  assert.deepEqual(languages.decisions[0].logic.table.value.rules[0].inputs, [foreign("-", "juel")]);
});

test("hit policies, aggregators, a literal-expression decision and information requirements are carried", async () => {
  const policy = async (attributes: string) =>
    (await resource(dmn(scoreTable(["-"])).replace(`id="T"`, `id="T" ${attributes}`))).decisions[0].logic.table.value;
  assert.equal((await policy(`hitPolicy="RULE ORDER"`)).hitPolicy, "ruleOrder");
  assert.equal((await policy(`hitPolicy="OUTPUT ORDER"`)).hitPolicy, "outputOrder");
  assert.deepEqual([(await policy(`hitPolicy="COLLECT" aggregation="SUM"`)).aggregation], ["sum"]);
  const literalDecision = await resource(`<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${dmn13}" id="Defs" name="Decisions" namespace="urn:t">
  <decision id="d" name="D"><informationRequirement id="IR"><requiredDecision href="#e"/></informationRequirement>
    <literalExpression id="L"><text>1</text></literalExpression></decision>
</definitions>`);
  assert.deepEqual(literalDecision.decisions[0], { id: "d", logic: { foreign: { element: "literalExpression" } }, requires: ["#e"] });
});

test("another DMN namespace is kept with its namespace alone, for admission to refuse whole", async () => {
  const older = await resource(dmn(scoreTable(["-"]), "", "http://www.omg.org/spec/DMN/20180521/MODEL/"));
  assert.deepEqual(older, { sourceSha256: older.sourceSha256, namespace: "http://www.omg.org/spec/DMN/20180521/MODEL/",
    expressionLanguage: null, decisions: [] });
});

test("a decision task names its decision literally and carries its tenant; a delegate beside it is not carried", async () => {
  const result = await read(dmn(scoreTable(["-"])),
    `<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:decisionRefTenantId="t"/>`);
  assert.equal(result.kind, "read", JSON.stringify(result));
  const task = ((result as Extract<KernelRead, { kind: "read" }>).program as Json).elements
    .find((entry: Json) => entry.activity?.header.id === "R");
  assert.deepEqual(task.activity.payload.work.rule.payload.tenant, { literal: { value: "t" } });
  assert.equal(await refusal(dmn(scoreTable(["-"])), `<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:class="x.Y"/>`),
    ReadRefusalCode.FactNotCarried);
});

test("what the reader cannot read faithfully is refused with its stable code", async () => {
  const ok = dmn(scoreTable(["-"]));
  assert.equal(await refusal(ok, ruleTask, "0".repeat(64)), ReadRefusalCode.SourceIdentityMismatch);
  assert.equal(await refusal(ok.replace(`<decisionTable id="T">`, `<decisionTable id="T"><unknownElement/>`)), ReadRefusalCode.ParserWarning);
  assert.equal(await refusal(ok.replace(`<decision id="d" name="D">`, `<decision id="d" name="D" extra="1">`)), ReadRefusalCode.ParserWarning);
  assert.equal(await refusal(ok.replace(`<decision id="d" name="D">`,
    `<decision id="d" name="D" xmlns:camunda="http://camunda.org/schema/1.0/dmn" camunda:historyTimeToLive="1">`)), ReadRefusalCode.UnknownAttribute);
  assert.equal(await refusal(ok.replace(` name="D"`, "")), ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(`<decisionTable id="T">`, `<decisionTable id="T" hitPolicy="LAST">`)), ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(`<decisionTable id="T">`, `<decisionTable id="T" hitPolicy="COLLECT" aggregation="AVG">`)),
    ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(/<outputEntry[^]*?<\/outputEntry>/u, "")), ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(/<output id="O1"[^>]*\/>/u, "")), ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(/<inputExpression[^]*?<\/inputExpression>/u, "")), ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(ok.replace(`<inputEntry id="E0"><text>-</text></inputEntry>`, `<inputEntry id="E0"/>`)),
    ReadRefusalCode.DecisionSchema);
  assert.equal(await refusal(`<?xml version="1.0"?><other/>`), ReadRefusalCode.ParserFailure);
});
