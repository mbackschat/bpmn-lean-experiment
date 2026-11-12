/**
 * Refusal tests of `admission/decision.ts` (PC-AUTO-07, DECISION-SEMANTICS-SPEC "Refusal codes"): the Business Rule
 * Task a decision admits and the DMN resources, decisions and decision tables the program carries. Every form outside
 * the subset reaches its stable code; each control is the same construct in its admitted form.
 */
import {
  activity, append, computed, conditionOn, definitionRef, juel, mapping, refusalTests, ruleWork, task, userWork, variable,
  withOptions, withOrigin,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";
import {
  any, between, cmp, decision, eq, grades, input, lit, output, resource, rule, ruleProgram, table, tests,
} from "./decision-support.ts";

const withRule = (work: Json, resources: Json[] = [resource([grades("d", "unique")])]) =>
  (_program: Json): Json => ruleProgram(work, resources);
const admitted = withRule({});
/** The admitted decision task with envelope `env`. */
const withEnvelope = (env: Json) => (_program: Json): Json => ruleProgram({}, [resource([grades("d", "unique")])], env);
/** A program carrying the one decision `d` with `logic`. */
const withLogic = (logic: Json) => withRule({}, [resource([decision("d", logic)])]);
const oneRule = (inputs: Json[], outputs: Json[], entries: Array<Json | string>, results: Array<Json | string>, hitPolicy = "unique") =>
  withLogic(table(hitPolicy, inputs, outputs, [rule("r1", entries, results)]));
const integerTest = (entry: Json | string) => oneRule([input("score")], [output("grade")], [entry], [lit.str("x")]);
const stringOutput = (value: Json | string, typeRef: Json | string | null = "string") =>
  oneRule([input("score")], [output("grade", typeRef)], [any], [value]);
const foreignText = (text: string, language: string | null = null): Json => ({ foreign: { value: { language, text } } });

/**
 * CIB binds `decisionResult` only as a transient local of a decision task's execution (`DecisionEvaluationUtil.java:82`);
 * the kernel carries no such binding, so a JUEL read of the name is refused wherever it stands.
 */
const juelReads = (name: string): Json => juel({ identifier: { name } });
const underJuel = (program: Json): Json => withOptions(program, { evaluator: "juel" });
const outputReads = (name: string) => (program: Json): Json =>
  underJuel(task(activity("T", userWork(), { outputs: [mapping("copy", juelReads(name))] }))(program));
const conditionReads = (name: string) => (program: Json): Json => underJuel(conditionOn(program, "f2", juelReads(name)));

/**
 * The admitted decision task with a carried process `Called` whose element is a decision task too: a copy of deployment 2
 * (`CT@2`) when `copied`, else the root's own document's (`CT`).
 */
const inCalled = (copied: boolean) => (program: Json): Json => {
  const element = activity(copied ? "CT@2" : "CT", ruleWork(), { incoming: [], outgoing: [] });
  return {
    ...append(admitted(program), copied ? withOrigin(element, { definition: null, sourceId: "CT" }) : element),
    processes: [{ definition: definitionRef("Called", { deployment: copied ? 2 : null }), children: [copied ? "CT@2" : "CT"], variables: [], executable: true }],
  };
};

const rows: Row[] = [
  { code: "expression.juel.decisionResult", description: "an output parameter reading decisionResult",
    mutate: outputReads("decisionResult"), control: outputReads("grade") },
  { code: "expression.juel.decisionResult", description: "a Sequence Flow condition reading decisionResult",
    mutate: conditionReads("decisionResult"), control: conditionReads("grade") },
  { code: "work.rule", description: "a Business Rule Task under a profile without decision tables (CIB-EXT-0032)",
    mutate: (program) => withOptions(admitted(program), { businessRuleTask: "refused" }), control: admitted },
  { code: "work.rule.dataAssociation", description: "a Data Input Association on a decision task",
    mutate: withEnvelope({ inputs: [mapping("score", variable("s"), "dataAssociation")] }),
    control: withEnvelope({ inputs: [mapping("score", variable("s"))] }) },
  { code: "work.rule.dataAssociation", description: "a Data Output Association on a decision task",
    mutate: withEnvelope({ outputs: [mapping("copy", variable("grade"), "dataAssociation")] }),
    control: withEnvelope({ outputs: [mapping("copy", variable("grade"))] }) },
  { code: "work.rule.decisionExpression", description: "a decisionRef given by an expression",
    mutate: withRule({ decision: computed(variable("key")) }), control: admitted },
  { code: "work.rule.binding", description: "a decisionRef bound by deployment", mutate: withRule({ binding: "deployment" }), control: admitted },
  { code: "work.rule.tenant", description: "a decisionRef with a tenant", mutate: withRule({ tenant: { literal: { value: "t" } } }), control: admitted },
  { code: "work.rule.decisionMissing", description: "a decisionRef no carried resource declares", mutate: withRule({}, []), control: admitted },
  { code: "work.rule.acrossDeployments", description: "a decision task in a copy of another deployment's process",
    mutate: inCalled(true), control: inCalled(false) },
  { code: "work.rule.resultVariable", description: "a result variable named decisionResult",
    mutate: withRule({ resultVariable: "decisionResult" }), control: withRule({ resultVariable: "grade" }) },
  { code: "decision.namespace", description: "a DMN 1.1 resource",
    mutate: withRule({}, [resource([grades("d", "unique")], { namespace: "http://www.omg.org/spec/DMN/20151101/dmn.xsd" })]), control: admitted },
  { code: "decision.expressionLanguage", description: "a resource whose expression language is JUEL",
    mutate: withRule({}, [resource([grades("d", "unique")], { expressionLanguage: "juel" })]),
    control: withRule({}, [resource([grades("d", "unique")], { expressionLanguage: "https://www.omg.org/spec/DMN/20191111/FEEL/" })]) },
  { code: "decision.duplicateId", description: "one decision id in two carried resources",
    mutate: withRule({}, [resource([grades("d", "unique")]), resource([grades("d", "first")])]),
    control: withRule({}, [resource([grades("d", "unique")]), resource([grades("e", "first")])]) },
  { code: "decision.logic", description: "a literal-expression decision",
    mutate: withRule({}, [resource([decision("d", { foreign: { element: "literalExpression" } })])]), control: admitted },
  { code: "decision.requirements", description: "a decision with an information requirement",
    mutate: withRule({}, [resource([{ ...grades("d", "unique"), requires: ["e"] }])]), control: admitted },
  { code: "decision.hitPolicy", description: "a PRIORITY table", mutate: withLogic(table("priority", [input("score")], [output("grade")], [])),
    control: withLogic(table("unique", [input("score")], [output("grade")], [])) },
  { code: "decision.hitPolicy", description: "an OUTPUT ORDER table", mutate: withLogic(table("outputOrder", [input("score")], [output("grade")], [])) },
  { code: "decision.hitPolicy", description: "a COLLECT table with an aggregator",
    mutate: withLogic(table("collect", [input("score")], [output("grade", "integer")], [], "sum")),
    control: withLogic(table("collect", [input("score")], [output("grade", "integer")], [])) },
  { code: "decision.inputExpression", description: "an input expression other than a bare name",
    mutate: withLogic(table("unique", [{ expression: foreignText("score + 1"), typeRef: "integer" }], [output("grade")], [])) },
  { code: "decision.inputType", description: "an input without a typeRef",
    mutate: withLogic(table("unique", [input("score", null)], [output("grade")], [])) },
  { code: "decision.typeRef", description: "an input typeRef spelled Integer",
    mutate: withLogic(table("unique", [input("score", { foreign: { name: "Integer" } })], [output("grade")], [])) },
  { code: "decision.typeRef", description: "an output typeRef double",
    mutate: withLogic(table("unique", [input("score")], [output("grade", { foreign: { name: "double" } })], [])) },
  { code: "decision.outputName", description: "a nameless output", mutate: withLogic(table("unique", [input("score")], [output(null)], [])) },
  { code: "decision.outputName", description: "two outputs of one name",
    mutate: withLogic(table("unique", [input("score")], [output("grade"), output("grade")], [])),
    control: withLogic(table("unique", [input("score")], [output("grade"), output("label")], [])) },
  { code: "decision.feel", description: "an input entry outside the grammar", mutate: integerTest(foreignText("date(\"2020-01-01\")")),
    control: integerTest(tests(cmp("lt", 5))) },
  { code: "decision.feel", description: "an input entry with an element-level language", mutate: integerTest(foreignText("< 5", "juel")) },
  { code: "decision.feel", description: "an output entry outside the grammar", mutate: stringOutput(foreignText("\"a\" + \"b\"")),
    control: stringOutput(lit.str("ab")) },
  { code: "decision.testKind", description: "a String literal test of an Integer input", mutate: integerTest(tests(eq(lit.str("5")))),
    control: integerTest(tests(eq(lit.null))) },
  { code: "decision.testKind", description: "a comparison of a String input",
    mutate: oneRule([input("channel", "string")], [output("grade")], [tests(cmp("lt", 5))], [lit.str("x")]),
    control: oneRule([input("channel", "string")], [output("grade")], [tests(eq(lit.str("web")))], [lit.str("x")]) },
  { code: "decision.testKind", description: "a comparison bounded by a String", mutate: integerTest(tests({ compare: { operator: "lt", bound: lit.str("5") } })),
    control: integerTest(tests(cmp("lt", 5))) },
  { code: "decision.testKind", description: "a number test of a Boolean input",
    mutate: oneRule([input("vip", "boolean")], [output("grade")], [tests(eq(lit.num(1)))], [lit.str("x")]),
    control: oneRule([input("vip", "boolean")], [output("grade")], [tests(eq(lit.bool(true)))], [lit.str("x")]) },
  { code: "decision.number", description: "a number literal with sixteen significant digits",
    mutate: integerTest(tests(eq(lit.num("1234567890123456")))), control: integerTest(tests(eq(lit.num("123456789012345")))) },
  { code: "decision.number", description: "a number literal with ten fraction digits",
    mutate: integerTest(tests(between(0, true, 1, true), eq(lit.num(1, 10)))), control: integerTest(tests(eq(lit.num(1, 9)))) },
  { code: "decision.number", description: "a decimal output", mutate: stringOutput(lit.num(15, 1), "integer"), control: stringOutput(lit.num(15), "integer") },
  { code: "decision.number", description: "a number output without a typeRef", mutate: stringOutput(lit.num(1), null),
    control: stringOutput(lit.str("1"), null) },
  { code: "decision.number", description: "a number output under boolean", mutate: stringOutput(lit.num(1), "boolean"),
    control: stringOutput(lit.bool(true), "boolean") },
  { code: "decision.number", description: "an integer output beyond int", mutate: stringOutput(lit.num(2147483648), "integer"),
    control: stringOutput(lit.num(2147483647), "integer") },
  { code: "decision.blankOutput", description: "a blank output entry", mutate: stringOutput("blank") },
  { code: "decision.schema", description: "a rule with fewer input entries than inputs",
    mutate: oneRule([input("score"), input("channel", "string")], [output("grade")], [any], [lit.str("x")]),
    control: oneRule([input("score"), input("channel", "string")], [output("grade")], [any, any], [lit.str("x")]) },
  { code: "decision.schema", description: "a rule with more output entries than outputs",
    mutate: oneRule([input("score")], [output("grade")], [any], [lit.str("x"), lit.str("y")]) },
];

refusalTests("decision", rows);
