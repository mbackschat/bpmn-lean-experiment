import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { parseJuel } from "./juel.js";
import { ReadRefusal, ReadRefusalCode, itemName, list, namespaceOf, optionalId, reference, requireId, text } from "./model.js";
import type { ReadContext } from "./model.js";
import { ctor, expressionSource, foreign, literalSource, mapping, MappingSyntax, stringLiteral, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** The source language of a CIB text the JUEL reader could not parse, which the kernel reads only as `foreign`. */
const juelLanguage = "urn:cibseven:expression-language:juel";
const simpleBooleanLanguage = "urn:bpmn-lean:expression:simple-boolean:v1";
const xsiNamespace = "http://www.w3.org/2001/XMLSchema-instance";
/** BPMN 2.0.2 Table 8.17: the default `expressionLanguage` of Definitions. */
const defaultExpressionLanguage = "http://www.w3.org/1999/XPath";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u;
const maxExpressionBytes = 256;
const maxStringValueBytes = 128;
const expressionMarkerPattern = /[#$]\{/u;

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;

function canonicalJsonString(token: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(token);
    return typeof parsed === "string" && JSON.stringify(parsed) === token && parsed.isWellFormed() ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const argumentOf = (body: string, functionName: string): string | undefined =>
  body.startsWith(`${functionName}(`) && body.endsWith(")") ? body.slice(functionName.length + 1, -1) : undefined;

/** The exact Simple Boolean v1 grammar, `undefined` for any other text. */
function simpleBoolean(body: string): KernelJson | undefined {
  if (!body.isWellFormed() || utf8Length(body) > maxExpressionBytes) return undefined;
  if (body === "true" || body === "false") return ctor("literal", { value: body === "true" });
  const present = argumentOf(body, "isPresent");
  if (present !== undefined && identifierPattern.test(present)) return ctor("isPresent", { name: present });
  const absent = argumentOf(body, "isNull");
  if (absent !== undefined && identifierPattern.test(absent)) return ctor("isNull", { name: absent });
  const equalsArguments = argumentOf(body, "stringEquals");
  if (equalsArguments === undefined) return undefined;
  const separator = equalsArguments.indexOf(",");
  if (separator <= 0) return undefined;
  const name = equalsArguments.slice(0, separator);
  const value = canonicalJsonString(equalsArguments.slice(separator + 1));
  return identifierPattern.test(name) && value !== undefined && utf8Length(value) <= maxStringValueBytes
    ? ctor("stringEquals", { name, value })
    : undefined;
}

/**
 * The IL Expression of a condition. A body whose language, on the expression or its Definitions, is Simple Boolean v1
 * is read in that grammar; any other named language stays `foreign` with its language, for `Kernel.Admission` to
 * refuse. A body with no named language is in the BPMN default, XPath (Table 8.17), which CIB reads as JUEL instead
 * (CIB-EXT-0030): the reader parses it as JUEL, text alone included, and a profile admits or refuses the result, so
 * the reader selects no profile ([expression semantics](../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#which-text-is-juel)).
 * The body is read as written: CIB trims neither `loopCardinality` nor `completionCondition` (`BpmnParse.java:1826`,
 * `:1836`); a Sequence Flow's condition is `flowCondition`.
 */
export function conditionExpression(ctx: ReadContext, expression: ElementRecord): KernelJson {
  return readCondition(ctx, expression, (body) => body);
}

/**
 * A Sequence Flow's condition. CIB applies Java `String.trim` to its text before reading it (`BpmnParse.java:4394`,
 * `:4400`), so the JUEL reading trims it too; a Simple Boolean body forbids surrounding whitespace and a foreign body is
 * kept as written.
 */
export function flowCondition(ctx: ReadContext, expression: ElementRecord, flowId: string): KernelJson {
  // CIB accepts only `tFormalExpression` as an explicit type there (`BpmnParse.java:4404-4407`).
  const xsiType = Object.entries(asElement(expression.$attrs) ?? {}).find(([name]) =>
    namespaceOf(expression, ctx.definitions, name.includes(":") ? name.slice(0, name.indexOf(":")) : "") === xsiNamespace &&
    name.endsWith(":type"))?.[1];
  if (typeof xsiType === "string" && xsiType.slice(xsiType.indexOf(":") + 1) === "tExpression") {
    throw new ReadRefusal(ReadRefusalCode.ConditionExpressionType, flowId, xsiType);
  }
  return readCondition(ctx, expression, javaTrim);
}

function readCondition(ctx: ReadContext, expression: ElementRecord, juelBody: (body: string) => string): KernelJson {
  const body = text(expression, "body") ?? "";
  // CIB reads a script resource only with a `language` (`BpmnParse.java:4413-4416`); no IL field carries it.
  if (ctx.attribute(expression, "resource") !== null) {
    throw new ReadRefusal(ReadRefusalCode.FactNotCarried, optionalId(expression), "camunda:resource");
  }
  const named = text(expression, "language") ?? ctx.expressionLanguage;
  if (named === null) return juelExpression(juelBody(body), false);
  if (named === simpleBooleanLanguage) {
    const parsed = simpleBoolean(body);
    if (parsed !== undefined) return ctor("simpleBoolean", { body: parsed });
  }
  return foreign(named, body);
}

/** The single identifier a node table is, if it is one. */
function soleIdentifier(nodes: readonly KernelJson[]): string | null {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  const identifier = typeof only === "object" && only !== null && !Array.isArray(only) ? only.identifier : undefined;
  const name = typeof identifier === "object" && identifier !== null && !Array.isArray(identifier) ? identifier.name : undefined;
  return typeof name === "string" ? name : null;
}

/** The single text a node table is, if it is one. */
function soleText(nodes: readonly KernelJson[]): string | null {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  const node = typeof only === "object" && only !== null && !Array.isArray(only) ? only.text : undefined;
  const value = typeof node === "object" && node !== null && !Array.isArray(node) ? node.value : undefined;
  return typeof value === "string" ? value : null;
}

/**
 * A JUEL text: exactly `${name}` stays the evaluator-neutral variable read, and a value that is text alone a String
 * literal; any other parse is a node table, and a text outside the pinned grammar stays `foreign`.
 */
function juelExpression(source: string, textAsLiteral: boolean): KernelJson {
  const nodes = parseJuel(source);
  if (nodes === null) return foreign(juelLanguage, source);
  const name = soleIdentifier(nodes);
  if (name !== null) return variable(name);
  const textOnly = soleText(nodes);
  if (textAsLiteral && textOnly !== null) return stringLiteral(textOnly);
  return ctor("juel", { nodes });
}

/** A CIB value expression, which CIB always reads as JUEL. */
export const valueExpression = (source: string): KernelJson => juelExpression(source, true);

/** A `ValueSource`: CIB treats text without an expression marker as a literal. */
export const valueSource = (source: string): KernelJson =>
  expressionMarkerPattern.test(source) ? expressionSource(valueExpression(source)) : literalSource(source);

/** Java `String.trim`: strips every character up to U+0020 at both ends. */
export const javaTrim = (body: string): string => body.replace(/^[\u0000- ]+|[\u0000- ]+$/gu, "");

function parameterValue(parameter: ElementRecord): KernelJson {
  if (asElementArray(parameter.$children) !== undefined) {
    throw new ReadRefusal(ReadRefusalCode.UnknownExtension, null,
      `structured camunda parameter ${String(parameter.name)}`);
  }
  // CIB `BpmnParseUtil.parseParamValueProvider` trims a parameter's text (`BpmnParseUtil.java:206`).
  const body = typeof parameter.$body === "string" ? javaTrim(parameter.$body) : "";
  if (body.length === 0) return ctor("literal", { value: { kind: "null" } });
  return expressionMarkerPattern.test(body) ? valueExpression(body) : stringLiteral(body);
}

export type ParameterMappings = Readonly<{ inputs: KernelJson[]; outputs: KernelJson[]; targets: string[] }>;

/**
 * `camunda:inputOutput`, each direction in document order: CIB runs the parameters one at a time in that order
 * (`BpmnParseUtil.java:89-110`, `IoMapping.java:38-48`), so which failure ends an entry, which value a repeated target
 * keeps and what a later output reads of an earlier one depend on it (`Ctx.evaluateMappingsWith`).
 */
export function inputOutputParameters(ctx: ReadContext, element: ElementRecord): ParameterMappings {
  const blocks = ctx.extensions(element, "inputOutput");
  const parameters = blocks.flatMap((block) => asElementArray(block.$children) ?? []);
  const named = (localName: string): ElementRecord[] => parameters
    .filter((parameter) => String(parameter.$type).endsWith(`:${localName}`));
  const inputs = named("inputParameter");
  return {
    inputs: inputs.map((parameter) => mapping(String(parameter.name), parameterValue(parameter), MappingSyntax.IoParameter)),
    outputs: named("outputParameter").map((parameter) =>
      mapping(String(parameter.name), parameterValue(parameter), MappingSyntax.IoParameter)),
    targets: inputs.map((parameter) => String(parameter.name)),
  };
}

function associationSource(association: ElementRecord): ElementRecord {
  const sources = list(association, "sourceRef");
  const source = sources[0];
  if (sources.length !== 1 || source === undefined) {
    throw new ReadRefusal(ReadRefusalCode.DataAssociationShape, optionalId(association),
      `${sources.length} sourceRef values`);
  }
  return source;
}

/** `source.schema` requires the `targetRef` and `source.reference` resolves it, so it names an item (`itemName`). */
function associationTarget(association: ElementRecord): string {
  return itemName(association.targetRef as ElementRecord);
}

/** How one association's source value is read: its transformation when given, otherwise the source element. */
function associationValue(ctx: ReadContext, association: ElementRecord, sourceName: (source: ElementRecord) => string): KernelJson {
  const transformation = association.transformation as ElementRecord | undefined;
  if (transformation !== undefined) {
    return foreign(text(transformation, "language") ?? ctx.expressionLanguage ?? defaultExpressionLanguage,
      text(transformation, "body") ?? "");
  }
  return variable(sourceName(associationSource(association)));
}

const elementId = (source: ElementRecord): string => String(source.id);
/** A catch Event's DataOutput is the payload part the Message delivers under its name. */
const eventOutputName = (source: ElementRecord): string => text(source, "name") ?? elementId(source);

const associationMapping = (ctx: ReadContext, association: ElementRecord, sourceName: (source: ElementRecord) => string): KernelJson =>
  mapping(associationTarget(association), associationValue(ctx, association, sourceName), MappingSyntax.DataAssociation);

export const associationMappings = (ctx: ReadContext, associations: ReadonlyArray<ElementRecord>): KernelJson[] =>
  associations.map((association) => associationMapping(ctx, association, itemName));

export const eventOutputs = (ctx: ReadContext, element: ElementRecord): KernelJson[] =>
  list(element, "dataOutputAssociations").map((association) => associationMapping(ctx, association, eventOutputName));

/** The identifier of the ItemDefinition `key` references on `owner`, `null` when it references none. */
export function itemDefinitionId(owner: ElementRecord, key: string): string | null {
  const item = reference(owner, key, "bpmn:ItemDefinition");
  return item === null ? null : requireId(item);
}

/** A Data Output's `DataOutputDecl`: its identifier and its `itemSubjectRef` ItemDefinition's (BPMN 2.0.2 §10.4.1). */
export const dataOutputDecl = (output: ElementRecord): KernelJson =>
  ({ id: requireId(output), itemRef: itemDefinitionId(output, "itemSubjectRef") });

export const eventInputs = (ctx: ReadContext, element: ElementRecord): KernelJson[] =>
  associationMappings(ctx, list(element, "dataInputAssociations"));

export const associationSourceId = (association: ElementRecord): string | null => {
  const source = list(association, "sourceRef")[0];
  return source === undefined ? null : optionalId(source);
};

export const associationTargetId = (association: ElementRecord): string | null => {
  const target = association.targetRef as ElementRecord | undefined;
  return target === undefined ? null : optionalId(target);
};

/** The item an association reads (`itemName`), `null` without a source. */
export const associationSourceItem = (association: ElementRecord): string | null => {
  const source = list(association, "sourceRef")[0];
  return source === undefined ? null : itemName(source);
};

/** The item an association writes (`itemName`), `null` without a target. */
export const associationTargetItem = (association: ElementRecord): string | null => {
  const target = association.targetRef as ElementRecord | undefined;
  return target === undefined ? null : itemName(target);
};

/** The text of a CIB business key: a value expression when it carries an expression marker, else a string literal. */
export const businessKeyExpression = (source: string): KernelJson =>
  expressionMarkerPattern.test(source) ? valueExpression(source) : stringLiteral(source);

export type VariableCopies = Readonly<{
  mappings: KernelJson[];
  /** A `variables="all"` entry copies every variable. */
  propagateAll: boolean;
  /**
   * The number of `mappings` before the last `variables="all"` entry, `null` without one: a later copy of every
   * variable re-copies what an earlier one did, so the last one's position is the copy's place in the order.
   */
  propagateAllAt: number | null;
  /** That entry also carries `local="true"`, so it copies only the local variables. */
  localOnly: boolean;
  businessKey: KernelJson | null;
  /** A single-variable copy carries a `local` attribute, which no IL field holds. */
  localCopy: boolean;
}>;

/** CIB `camunda:in`/`camunda:out` copies (`BpmnParse#parseInputParameter`, `#parseCallableElementProvider`). */
export function variableCopies(element: ElementRecord, entries: ReadonlyArray<ElementRecord>): VariableCopies {
  const mappings: KernelJson[] = [];
  let propagateAll = false;
  let propagateAllAt: number | null = null;
  let localOnly = false;
  let localCopy = false;
  let businessKey: KernelJson | null = null;
  for (const entry of entries) {
    if (entry.variables === "all") {
      propagateAll = true;
      propagateAllAt = mappings.length;
      localOnly ||= entry.local === "true";
    } else if (typeof entry.businessKey === "string") {
      businessKey = businessKeyExpression(entry.businessKey);
    } else if (typeof entry.target === "string") {
      // A local copy reads only the source scope's own variables (`CallableElementParameter`); no IL field carries it.
      if (entry.local === "true") {
        throw new ReadRefusal(ReadRefusalCode.FactNotCarried, optionalId(element), "camunda:in/out local");
      }
      // A `sourceExpression` fails on an absent name like any CIB expression (`ElValueProvider`); a `source` copy reads
      // null (CIB-EXT-0021).
      mappings.push(typeof entry.sourceExpression === "string"
        ? mapping(entry.target, valueExpression(entry.sourceExpression), MappingSyntax.IoParameter)
        : mapping(entry.target, variable(String(entry.source)), MappingSyntax.CallVariable));
      localCopy ||= typeof entry.local === "string";
    } else {
      throw new ReadRefusal(ReadRefusalCode.UnknownAttributeValue, optionalId(element), "camunda variable copy without a target");
    }
  }
  return { mappings, propagateAll, propagateAllAt, localOnly, businessKey, localCopy };
}
