import { asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { ReadRefusal, ReadRefusalCode, list, optionalId, text } from "./model.js";
import type { ReadContext } from "./model.js";
import { compareIds, ctor, expressionSource, foreign, literalSource, mapping, stringLiteral, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** The source language of a CIB value that is more than a variable read; the kernel reads it only as `foreign`. */
const juelLanguage = "urn:cibseven:expression-language:juel";
const simpleBooleanLanguage = "urn:bpmn-lean:expression:simple-boolean:v1";
/** BPMN 2.0.2 Table 8.17: the default `expressionLanguage` of Definitions. */
const defaultExpressionLanguage = "http://www.w3.org/1999/XPath";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u;
const maxExpressionBytes = 256;
const maxStringValueBytes = 128;
const variableReadPattern = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u;
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
 * The IL Expression of a condition. A body in Simple Boolean v1, declared or undeclared, is read in that grammar;
 * any other text stays `foreign` with its language, for `Kernel.Admission` to refuse. The language an undeclared
 * condition means is a profile's selection, so the reader never interprets text beyond this one grammar.
 */
export function conditionExpression(ctx: ReadContext, expression: ElementRecord): KernelJson {
  const body = text(expression, "body") ?? "";
  const language = text(expression, "language") ?? ctx.expressionLanguage;
  if (language === null || language === simpleBooleanLanguage) {
    const parsed = simpleBoolean(body);
    if (parsed !== undefined) return ctor("simpleBoolean", { body: parsed });
  }
  return foreign(language ?? defaultExpressionLanguage, body);
}

/** A CIB value expression: a single variable read, or foreign JUEL. */
export function valueExpression(source: string): KernelJson {
  const name = variableReadPattern.exec(source)?.[1];
  return name === undefined ? foreign(juelLanguage, source) : variable(name);
}

/** A `ValueSource`: CIB treats text without an expression marker as a literal. */
export const valueSource = (source: string): KernelJson =>
  expressionMarkerPattern.test(source) ? expressionSource(valueExpression(source)) : literalSource(source);

/** CIB `BpmnParseUtil.parseParamValueProvider` applies Java `String.trim` to a parameter's text. */
const trimParameter = (body: string): string => body.replace(/^[\u0000- ]+|[\u0000- ]+$/gu, "");

function parameterValue(parameter: ElementRecord): KernelJson {
  if (asElementArray(parameter.$children) !== undefined) {
    throw new ReadRefusal(ReadRefusalCode.UnknownExtension, null,
      `structured camunda parameter ${String(parameter.name)}`);
  }
  const body = typeof parameter.$body === "string" ? trimParameter(parameter.$body) : "";
  if (body.length === 0) return ctor("literal", { value: { kind: "null" } });
  return expressionMarkerPattern.test(body) ? valueExpression(body) : stringLiteral(body);
}

export type ParameterMappings = Readonly<{ inputs: KernelJson[]; outputs: KernelJson[]; targets: string[] }>;

/** `camunda:inputOutput`, each direction ordered by target name. */
export function inputOutputParameters(ctx: ReadContext, element: ElementRecord): ParameterMappings {
  const blocks = ctx.extensions(element, "inputOutput");
  const parameters = blocks.flatMap((block) => asElementArray(block.$children) ?? []);
  const named = (localName: string): ElementRecord[] => parameters
    .filter((parameter) => String(parameter.$type).endsWith(`:${localName}`))
    .sort((left, right) => compareIds(String(left.name), String(right.name)));
  const inputs = named("inputParameter");
  return {
    inputs: inputs.map((parameter) => mapping(String(parameter.name), parameterValue(parameter))),
    outputs: named("outputParameter").map((parameter) => mapping(String(parameter.name), parameterValue(parameter))),
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

function associationTarget(association: ElementRecord): string {
  const target = association.targetRef as ElementRecord | undefined;
  const id = target === undefined ? null : optionalId(target);
  if (id === null) {
    throw new ReadRefusal(ReadRefusalCode.DataAssociationShape, optionalId(association), "targetRef without id");
  }
  return id;
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

export const associationInputs = (ctx: ReadContext, associations: ReadonlyArray<ElementRecord>): KernelJson[] =>
  associations.map((association) => mapping(associationTarget(association), associationValue(ctx, association, elementId)));

export const associationOutputs = (ctx: ReadContext, associations: ReadonlyArray<ElementRecord>): KernelJson[] =>
  associations.map((association) => mapping(associationTarget(association), associationValue(ctx, association, elementId)));

export const eventOutputs = (ctx: ReadContext, element: ElementRecord): KernelJson[] =>
  list(element, "dataOutputAssociations").map((association) =>
    mapping(associationTarget(association), associationValue(ctx, association, eventOutputName)));

export const eventInputs = (ctx: ReadContext, element: ElementRecord): KernelJson[] =>
  list(element, "dataInputAssociations").map((association) =>
    mapping(associationTarget(association), associationValue(ctx, association, elementId)));

export const associationSourceId = (association: ElementRecord): string | null => {
  const source = list(association, "sourceRef")[0];
  return source === undefined ? null : optionalId(source);
};

export const associationTargetId = (association: ElementRecord): string | null => {
  const target = association.targetRef as ElementRecord | undefined;
  return target === undefined ? null : optionalId(target);
};
