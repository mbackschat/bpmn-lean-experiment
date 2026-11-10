/**
 * Reads one DMN resource a program carries to the kernel IL's `DecisionResource` (`Kernel.IL.Types.Decision`), through
 * the project-authored DMN 1.3 moddle descriptor of the decision subset passed to `BpmnModdle` as an extra package, so
 * no parser dependency is added ([decision semantics](../../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#parser-and-source-binding)).
 * Like the BPMN reader it chooses no semantics: every DMN element outside the descriptor is a parser warning and every
 * undeclared attribute is unknown, both refused, and within the declared types a violation of the DMN 1.3 XSD's
 * required attributes, enumerations and cardinalities, which CIB refuses at deployment (`DmnParser.java:56`), is refused
 * as `decision.schema`. A resource in another DMN namespace is kept with its namespace alone, which admission refuses
 * whole (`decision.namespace`).
 */
import { BpmnModdle } from "bpmn-moddle";

import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { readMessage, withDeadline } from "../moddle-adapter.js";
import dmnModdle from "./dmn-1.3-moddle.json" with { type: "json" };
import { inputEntry, inputExpression, outputEntry } from "./feel.js";
import { ReadRefusal, ReadRefusalCode } from "./model.js";
import { declaredSourceEncoding, decodeUtf8, sha256Of } from "./source.js";
import { ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** One DMN resource as a scenario or deployment binds it: its exact bytes and their SHA-256. */
export type DecisionSource = Readonly<{ bytes: Uint8Array; sha256: string }>;

type Limits = Readonly<{ maxBytes: number; parserDeadlineMs: number }>;

const hitPolicies: ReadonlyMap<string, string> = new Map([
  ["UNIQUE", "unique"], ["FIRST", "first"], ["ANY", "any"], ["RULE ORDER", "ruleOrder"], ["COLLECT", "collect"],
  ["PRIORITY", "priority"], ["OUTPUT ORDER", "outputOrder"],
]);
const aggregators: ReadonlyMap<string, string> = new Map([["SUM", "sum"], ["MIN", "min"], ["MAX", "max"], ["COUNT", "count"]]);
const typeRefs: ReadonlySet<string> = new Set(["string", "integer", "boolean"]);

const schema = (element: ElementRecord | undefined, evidence: string): never => {
  throw new ReadRefusal(ReadRefusalCode.DecisionSchema, typeof element?.id === "string" ? element.id : null, evidence);
};

const textOf = (element: ElementRecord, key: string): string | null => (typeof element[key] === "string" ? element[key] : null);
const children = (element: ElementRecord, key: string): readonly ElementRecord[] => asElementArray(element[key]) ?? [];

/** The namespace of the document's root `definitions` element, `null` when the root is not one. */
function rootNamespace(xml: string): string | null {
  const root = /<(?![?!])(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)([^>]*)>/u.exec(xml);
  if (root === null || root[2] !== "definitions") return null;
  const declaration = root[1] === undefined ? "xmlns" : `xmlns:${root[1]}`;
  for (const [, name, double, single] of (root[3] ?? "").matchAll(/\s([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) {
    if (name === declaration) return double ?? single ?? null;
  }
  return null;
}

/** Every DMN element of the tree: no attribute outside the descriptor but namespace declarations. */
function requireDeclaredAttributes(element: ElementRecord): void {
  for (const name of Object.keys(asElement(element.$attrs) ?? {})) {
    if (name === "xmlns" || name.startsWith("xmlns:")) continue;
    throw new ReadRefusal(ReadRefusalCode.UnknownAttribute, typeof element.id === "string" ? element.id : null, name);
  }
  for (const [key, value] of Object.entries(element)) {
    if (key.startsWith("$")) continue;
    for (const child of asElementArray(value) ?? (asElement(value) === undefined ? [] : [asElement(value)!])) {
      if (typeof child.$type === "string") requireDeclaredAttributes(child);
    }
  }
}

function typeRef(value: string | null): KernelJson {
  if (value === null) return null;
  return typeRefs.has(value) ? value : ctor("foreign", { name: value });
}

function table(element: ElementRecord): KernelJson {
  const declaredPolicy = textOf(element, "hitPolicy") ?? "UNIQUE";
  const hitPolicy = hitPolicies.get(declaredPolicy) ?? schema(element, `hitPolicy ${declaredPolicy}`);
  const declaredAggregation = textOf(element, "aggregation");
  const aggregation = declaredAggregation === null ? null
    : aggregators.get(declaredAggregation) ?? schema(element, `aggregation ${declaredAggregation}`);
  const outputs = children(element, "output");
  if (outputs.length === 0) schema(element, "a decision table without an output");
  return {
    hitPolicy,
    aggregation,
    inputs: children(element, "input").map((input) => {
      const expression = asElement(input.inputExpression) ?? schema(input, "an input without an inputExpression");
      return {
        expression: inputExpression(textOf(expression, "text") ?? "", textOf(expression, "expressionLanguage")),
        typeRef: typeRef(textOf(expression, "typeRef")),
      };
    }),
    outputs: outputs.map((output) => ({ name: textOf(output, "name"), typeRef: typeRef(textOf(output, "typeRef")) })),
    rules: children(element, "rule").map((rule) => {
      const results = children(rule, "outputEntry");
      if (results.length === 0) schema(rule, "a rule without an outputEntry");
      return {
        id: textOf(rule, "id") ?? "",
        inputs: children(rule, "inputEntry").map((entry) =>
          inputEntry(textOf(entry, "text") ?? schema(entry, "an inputEntry without text"), textOf(entry, "expressionLanguage"))),
        outputs: results.map((entry) => outputEntry(textOf(entry, "text") ?? "", textOf(entry, "expressionLanguage"))),
      };
    }),
  };
}

/** A decision's logic: a decision table, or the element it is instead (`literalExpression`, or `none`). */
function logic(decision: ElementRecord): KernelJson {
  const element = asElement(decision.decisionLogic);
  switch (element?.$type) {
    case "dmn:DecisionTable":
      return ctor("table", { value: table(element!) });
    case "dmn:LiteralExpression":
      return ctor("foreign", { element: "literalExpression" });
    default:
      return ctor("foreign", { element: "none" });
  }
}

function decision(element: ElementRecord): KernelJson {
  // CIB keys a decision definition by its id (`DmnDecisionImpl#getKey`); the XSD requires a name.
  const id = textOf(element, "id") ?? schema(element, "a decision without an id");
  if (textOf(element, "name") === null) schema(element, "a decision without a name");
  const requires = children(element, "informationRequirement").map((requirement) =>
    textOf(asElement(requirement.requiredDecision) ?? asElement(requirement.requiredInput) ?? {}, "href") ?? "");
  return { id, logic: logic(element), requires };
}

/** Reads one DMN resource; a source the reader cannot read faithfully is refused with a `ReadRefusal`. */
export async function readDecisionResource(source: DecisionSource, limits: Limits): Promise<KernelJson> {
  if (source.bytes.byteLength > limits.maxBytes) {
    throw new ReadRefusal(ReadRefusalCode.SourceTooLarge, null, `${source.bytes.byteLength} bytes`);
  }
  const sha256 = await sha256Of(source.bytes);
  if (sha256 !== source.sha256) throw new ReadRefusal(ReadRefusalCode.SourceIdentityMismatch, null, `captured ${sha256}`);
  const encoding = declaredSourceEncoding(source.bytes);
  if (encoding !== null && !/^utf-?8$/iu.test(encoding)) throw new ReadRefusal(ReadRefusalCode.SourceEncoding, null, encoding);
  const xml = decodeUtf8(source.bytes);
  if (/<\s*!DOCTYPE\b/iu.test(xml)) throw new ReadRefusal(ReadRefusalCode.SourceDoctype, null, "DOCTYPE present");
  const namespace = rootNamespace(xml);
  if (namespace === null) throw new ReadRefusal(ReadRefusalCode.ParserFailure, null, "no DMN definitions root");
  if (namespace !== dmnModdle.uri) return { sourceSha256: sha256, namespace, expressionLanguage: null, decisions: [] };
  let imported: unknown;
  try {
    imported = await withDeadline(() => new BpmnModdle({ dmn: dmnModdle }).fromXML(xml, "dmn:Definitions"),
      limits.parserDeadlineMs, "DMN import");
  } catch (error: unknown) {
    throw new ReadRefusal(ReadRefusalCode.ParserFailure, null, error instanceof Error ? error.message : "DMN import failed");
  }
  const result = asElement(imported);
  const definitions = asElement(result?.rootElement);
  if (definitions === undefined) throw new ReadRefusal(ReadRefusalCode.ParserFailure, null, "no root element");
  for (const warning of asElementArray(result?.warnings) ?? []) {
    throw new ReadRefusal(ReadRefusalCode.ParserWarning, null, readMessage(warning, "DMN import warning"));
  }
  requireDeclaredAttributes(definitions);
  if (textOf(definitions, "name") === null || textOf(definitions, "namespace") === null) {
    schema(definitions, "definitions without a name or namespace");
  }
  return {
    sourceSha256: sha256,
    namespace,
    expressionLanguage: textOf(definitions, "expressionLanguage"),
    decisions: children(definitions, "drgElement").map(decision),
  };
}
