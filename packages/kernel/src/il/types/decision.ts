/**
 * DMN decision tables, transcribed from `Kernel/IL/Types/Decision.lean`: the reader's meaning-preserving read of the DMN
 * 1.3 resources a program carries ([decision semantics](../../../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#il-shape-proposed-kernel-shape-hunk)).
 * Every field outside the admitted subset stays in the shape and `admission/decision.ts` refuses it with a stable code.
 * Part of `il/types.ts`, which re-exports it.
 */
/**
 * A `typeRef` CIB matches ignoring case (`DefaultDataTypeTransformerRegistry.java:41-61`); the reader keeps every
 * spelling but the three lower-case names as `foreign`, which admission refuses (`decision.typeRef`).
 */
export enum TypeRefTag {
  String = "string",
  Integer = "integer",
  Boolean = "boolean",
  Foreign = "foreign",
}

export type TypeRef =
  | { readonly tag: TypeRefTag.String }
  | { readonly tag: TypeRefTag.Integer }
  | { readonly tag: TypeRefTag.Boolean }
  | { readonly tag: TypeRefTag.Foreign; readonly name: string };

// guard-exception(3): FEEL unary-test comparisons (decision semantics item 4), a separate expression language from JUEL's operators.
export enum Comparison {
  Lt = "lt",
  Le = "le",
  Gt = "gt",
  Ge = "ge",
}

export enum FeelLiteralTag {
  Null = "null",
  Bool = "bool",
  Number = "number",
  String = "string",
}

/** A FEEL literal of the unary-test subset. A number is `coefficient × 10^-scale`, exactly as written. */
export type FeelLiteral =
  | { readonly tag: FeelLiteralTag.Null }
  | { readonly tag: FeelLiteralTag.Bool; readonly value: boolean }
  | { readonly tag: FeelLiteralTag.Number; readonly coefficient: bigint; readonly scale: number }
  | { readonly tag: FeelLiteralTag.String; readonly value: string };

export interface Interval {
  readonly low: FeelLiteral;
  readonly lowClosed: boolean;
  readonly high: FeelLiteral;
  readonly highClosed: boolean;
}

export enum UnaryTestTag {
  Literal = "literal",
  Compare = "compare",
  Interval = "interval",
}

export type UnaryTest =
  | { readonly tag: UnaryTestTag.Literal; readonly value: FeelLiteral }
  | { readonly tag: UnaryTestTag.Compare; readonly operator: Comparison; readonly bound: FeelLiteral }
  | { readonly tag: UnaryTestTag.Interval; readonly value: Interval };

/** A list of unary tests, never empty, optionally negated as a whole (`not(...)`). */
export interface TestList {
  readonly negated: boolean;
  readonly first: UnaryTest;
  readonly rest: readonly UnaryTest[];
}

/** A text outside the subset's grammar, with the element-level `expressionLanguage` it names, if any. */
export interface ForeignText {
  // guard-exception(19): refused with its foreign text whole (`decision.feel`, `decision.inputExpression`).
  readonly language: string | null;
  readonly text: string;
}

export enum InputEntryTag {
  Any = "any",
  Tests = "tests",
  Foreign = "foreign",
}

export type InputEntry =
  | { readonly tag: InputEntryTag.Any }
  | { readonly tag: InputEntryTag.Tests; readonly value: TestList }
  | { readonly tag: InputEntryTag.Foreign; readonly value: ForeignText };

export enum OutputEntryTag {
  Literal = "literal",
  Blank = "blank",
  Foreign = "foreign",
}

export type OutputEntry =
  | { readonly tag: OutputEntryTag.Literal; readonly value: FeelLiteral }
  | { readonly tag: OutputEntryTag.Blank }
  | { readonly tag: OutputEntryTag.Foreign; readonly value: ForeignText };

export enum InputExpressionTag {
  Variable = "variable",
  Foreign = "foreign",
}

export type InputExpression =
  | { readonly tag: InputExpressionTag.Variable; readonly name: string }
  | { readonly tag: InputExpressionTag.Foreign; readonly value: ForeignText };

export interface DecisionInput {
  readonly expression: InputExpression;
  readonly typeRef: TypeRef | null;
}

export interface DecisionOutput {
  readonly name: string | null;
  readonly typeRef: TypeRef | null;
}

export interface DecisionRule {
  readonly id: string;
  readonly inputs: readonly InputEntry[];
  readonly outputs: readonly OutputEntry[];
}

export enum HitPolicy {
  Unique = "unique",
  First = "first",
  Any = "any",
  RuleOrder = "ruleOrder",
  Collect = "collect",
  Priority = "priority",
  OutputOrder = "outputOrder",
}

export enum CollectAggregator {
  Sum = "sum",
  Min = "min",
  Max = "max",
  Count = "count",
}

export interface DecisionTable {
  readonly hitPolicy: HitPolicy;
  readonly aggregation: CollectAggregator | null;
  readonly inputs: readonly DecisionInput[];
  readonly outputs: readonly DecisionOutput[];
  readonly rules: readonly DecisionRule[];
}

export enum DecisionLogicTag {
  Table = "table",
  Foreign = "foreign",
}

export type DecisionLogic =
  | { readonly tag: DecisionLogicTag.Table; readonly value: DecisionTable }
  | { readonly tag: DecisionLogicTag.Foreign; readonly element: string };

/** `requires` lists the decisions its information requirements name. */
export interface Decision {
  readonly id: string;
  readonly logic: DecisionLogic;
  readonly requires: readonly string[];
}

/** One DMN resource the program carries, bound by its exact bytes. */
export interface DecisionResource {
  readonly sourceSha256: string;
  readonly namespace: string;
  readonly expressionLanguage: string | null;
  readonly decisions: readonly Decision[];
}

/**
 * The significant digits of `coefficient`, trailing zeros dropped: at most 15 is exact both as a Decimal128 and as a
 * Java `double` (DECISION-SEMANTICS-SPEC item 4).
 */
export function significantDigits(coefficient: bigint): number {
  const digits = (coefficient < 0n ? -coefficient : coefficient).toString().replace(/0+$/u, "");
  return Math.max(digits.length, 1);
}
