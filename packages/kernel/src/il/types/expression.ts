/**
 * Values and expressions, transcribed from `Kernel/IL/Types/Expression.lean`: the data values a program carries and
 * the expressions that read and produce them, plus the value sources and mappings built on them. Part of
 * `il/types.ts`, which re-exports it.
 */
import type { JuelNode } from "./juel.js";

/** Exhaustiveness witness for every `switch` over a kernel enum; no kernel switch has a `default:` arm. */
export function assertNever(value: never): never {
  throw new TypeError(`unhandled kernel variant ${JSON.stringify(value)}`);
}

/** A typed data value, as the scenario contract's `variableValue` carries it; the one nested type. */
// guard-exception(3): the portable value vocabulary JUEL's `JVal` is built on (its List and Map carry these values), not a copy of it.
export enum ValueTag {
  Null = "null",
  Bool = "bool",
  Int = "int",
  Decimal = "decimal",
  String = "string",
  StringList = "stringList",
  List = "list",
  Map = "map",
}

export type Value =
  | { readonly tag: ValueTag.Null }
  | { readonly tag: ValueTag.Bool; readonly value: boolean }
  | { readonly tag: ValueTag.Int; readonly value: number }
  | { readonly tag: ValueTag.Decimal; readonly coefficient: bigint; readonly scale: number }
  | { readonly tag: ValueTag.String; readonly value: string }
  | { readonly tag: ValueTag.StringList; readonly items: readonly string[] }
  | { readonly tag: ValueTag.List; readonly items: readonly Value[] }
  | { readonly tag: ValueTag.Map; readonly entries: readonly (readonly [string, Value])[] };

/** The Simple Boolean subset, evaluated inside the kernel ([decision](../../../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)). */
export enum SimpleBooleanTag {
  Literal = "literal",
  IsPresent = "isPresent",
  IsNull = "isNull",
  StringEquals = "stringEquals",
}

export type SimpleBoolean =
  | { readonly tag: SimpleBooleanTag.Literal; readonly value: boolean }
  | { readonly tag: SimpleBooleanTag.IsPresent; readonly name: string }
  | { readonly tag: SimpleBooleanTag.IsNull; readonly name: string }
  | { readonly tag: SimpleBooleanTag.StringEquals; readonly name: string; readonly value: string };

/** An expression; the kernel evaluates every arm but `foreign`, unread text, and `juel` only under `Evaluator.juel`. */
export enum ExpressionTag {
  Literal = "literal",
  SimpleBoolean = "simpleBoolean",
  Variable = "variable",
  Juel = "juel",
  Foreign = "foreign",
}

export type Expression =
  | { readonly tag: ExpressionTag.Literal; readonly value: Value }
  | { readonly tag: ExpressionTag.SimpleBoolean; readonly body: SimpleBoolean }
  | { readonly tag: ExpressionTag.Variable; readonly name: string }
  | { readonly tag: ExpressionTag.Juel; readonly nodes: readonly JuelNode[] }
  | { readonly tag: ExpressionTag.Foreign; readonly language: string; readonly source: string };

/** A configuration value given either literally or by an expression. */
export enum ValueSourceTag { Literal = "literal", Expression = "expression" }

export type ValueSource =
  | { readonly tag: ValueSourceTag.Literal; readonly value: string }
  | { readonly tag: ValueSourceTag.Expression; readonly body: Expression };

/**
 * Which syntax wrote a mapping, which settles what an unset source means: an unavailable Data Input (BPMN 2.0.2
 * §10.4.2), an unresolved `camunda:inputParameter`, `outputParameter` or `camunda:in`/`out` `sourceExpression`
 * expression, or a `camunda:in`/`out` `source` copy that reads null (CIB-EXT-0021).
 */
export enum MappingDialect {
  DataAssociation = "dataAssociation",
  IoParameter = "ioParameter",
  CallVariable = "callVariable",
}

/** `target := source`, evaluated in the scope the owning element names. */
export interface Mapping { readonly target: string; readonly source: Expression; readonly dialect: MappingDialect; }

/**
 * A `camunda:script` value of a structured parameter (`BpmnParseUtil.java:224-239`): its `scriptFormat`, its inline
 * text, `null` when absent, and the `resource` it names instead, as `ScriptWork` carries a Script Task's.
 */
export interface ParameterScript { readonly format: string; readonly source: string | null; readonly resource: string | null; }

/** A `camunda:map` entry: its `key` attribute's text and the index of the node holding its value. */
export interface ParameterEntry { readonly key: string; readonly value: number; }

export enum ParameterNodeTag { Value = "value", List = "list", Map = "map", Script = "script" }

/**
 * One node of a structured parameter value, the value provider CIB parses (`BpmnParseUtil.java:152-222`): a flat table
 * in post-order, each child the index of an earlier node, the root last. A `value` is a text leaf read as a scalar
 * parameter's text is (`Mapping.source`); list items and map entries keep document order.
 */
export type ParameterNode =
  | { readonly tag: ParameterNodeTag.Value; readonly body: Expression }
  | { readonly tag: ParameterNodeTag.List; readonly items: readonly number[] }
  | { readonly tag: ParameterNodeTag.Map; readonly entries: readonly ParameterEntry[] }
  | { readonly tag: ParameterNodeTag.Script; readonly payload: ParameterScript };

/**
 * A `camunda:inputParameter` or `outputParameter` whose value is a `camunda:list`, `map` or `script`, beside the scalar
 * ones its direction's mappings carry: `position` is the index among those mappings before which it runs, in document
 * order (`BpmnParseUtil.java:89-110`). Admission refuses every one (`mapping.structuredParameter`).
 */
export interface StructuredParameter {
  readonly target: string;
  // guard-exception(19): a structured parameter is refused whole (`mapping.structuredParameter`, admission/data.ts).
  readonly position: number;
  readonly nodes: readonly ParameterNode[];
}
