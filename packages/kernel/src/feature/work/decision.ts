/**
 * Work: DMN decision tables, transcribed from `Kernel/Feature/Work/Decision.lean`.
 *
 * A Business Rule Task whose `camunda:decisionRef` names a decision the program carries evaluates that decision table
 * when its occurrence begins and completes in the same step
 * ([decision semantics](../../../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#5-evaluation)), in CIB's three
 * passes (`DecisionTableEvaluationHandler.java:101-161`): every input is read and converted, every rule is tested,
 * every matching rule's outputs are converted, and only then does the hit policy select. The mapped result is written
 * by the nearest-owner rule from the task's scope occurrence, before the task leaves, so its outgoing conditions read it
 * (`DecisionEvaluationUtil.java:79-87`). Every refusal of `admission/work/decision.ts` reaches a site here only as an
 * `unsupported` code of the same name.
 */
import {
  DecisionResultMapping,
  ValueSourceTag,
  ValueTag,
  assertNever,
  compareStrings,
  programDecision,
  type Program,
  type RuleWork,
  type Value,
} from "../../il/types.js";
import {
  Comparison,
  DecisionLogicTag,
  FeelLiteralTag,
  HitPolicy,
  InputEntryTag,
  InputExpressionTag,
  OutputEntryTag,
  TypeRefTag,
  UnaryTestTag,
  significantDigits,
  withinJavaInt,
  type DecisionInput,
  type DecisionOutput,
  type DecisionRule,
  type DecisionTable,
  type FeelLiteral,
  type InputEntry,
  type OutputEntry,
  type TypeRef,
  type UnaryTest,
} from "../../il/types/decision.js";
import { FailureTag, committed, failed, type Binding, type Result } from "../../state.js";

type Entries = readonly Binding[];

/**
 * Item 8: every decision failure takes the stimulus' evaluation-failure outcome, which `step.ts` derives from a
 * rollback (EXPRESSION-SEMANTICS-SPEC, failure outcomes per stimulus).
 */
const decisionFailed = <T>(): Result<T> => failed(FailureTag.RolledBack, "decision-failed");

const isAscii = (text: string): boolean => /^[\u0000-\u007f]*$/u.test(text);

/**
 * `Integer.parseInt` over ASCII text (`IntegerDataTypeTransformer.java:42`): an optional sign, decimal digits, the `int`
 * range.
 */
function parseInt(text: string): number | null {
  if (!/^[+-]?[0-9]+$/u.test(text)) return null;
  const value = BigInt(text.startsWith("+") ? text.slice(1) : text);
  return withinJavaInt(value) ? Number(value) : null;
}

/**
 * CIB's `typeRef` transformers for the values the kernel holds (item 7, `DmnTypeDefinitionImpl.java:41-58`): null is
 * never converted; a value whose Java form the kernel does not decide is `unsupported`.
 */
function convert(ref: TypeRef, value: Value): Result<Value> {
  switch (value.tag) {
    case ValueTag.Null:
      return committed(value);
    case ValueTag.List:
    case ValueTag.Map:
    case ValueTag.StringList:
      // dynamic-only: a collection is the run's data
      return failed(FailureTag.Unsupported, "decision-input-kind");
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
      return convertScalar(ref, value);
  }
  return assertNever(value);
}

function convertScalar(ref: TypeRef, value: Value): Result<Value> {
  switch (ref.tag) {
    case TypeRefTag.Integer:
      return toInteger(value);
    case TypeRefTag.Boolean:
      return toBoolean(value);
    case TypeRefTag.String:
      return toText(value);
    case TypeRefTag.Foreign:
      return failed(FailureTag.Unsupported, "decision-type-ref");
  }
  return assertNever(ref);
}

function toInteger(value: Value): Result<Value> {
  switch (value.tag) {
    case ValueTag.Int:
      return withinJavaInt(value.value) ? committed(value) : decisionFailed();
    case ValueTag.Decimal: {
      // dynamic-only: CIB reads a Number through `doubleValue`, exact only up to 15 significant digits
      if (significantDigits(value.coefficient) > 15) return failed(FailureTag.Unsupported, "decision-conversion-range");
      const unit = 10n ** BigInt(value.scale);
      if (value.coefficient % unit !== 0n) return decisionFailed();
      const whole = value.coefficient / unit;
      return withinJavaInt(whole) ? committed({ tag: ValueTag.Int, value: Number(whole) }) : decisionFailed();
    }
    case ValueTag.String: {
      // dynamic-only: `Integer.parseInt` reads Unicode decimal digits the kernel does not decide
      if (!isAscii(value.value)) return failed(FailureTag.Unsupported, "decision-conversion-text");
      const parsed = parseInt(value.value);
      return parsed === null ? decisionFailed() : committed({ tag: ValueTag.Int, value: parsed });
    }
    case ValueTag.Bool:
      return decisionFailed();
    case ValueTag.Null:
    case ValueTag.List:
    case ValueTag.Map:
    case ValueTag.StringList:
      return committed(value);
  }
  return assertNever(value);
}

function toBoolean(value: Value): Result<Value> {
  switch (value.tag) {
    case ValueTag.Bool:
      return committed(value);
    case ValueTag.String: {
      // dynamic-only: `equalsIgnoreCase` folds non-ASCII letters (`ſ` as `s`), which the kernel does not decide
      if (!isAscii(value.value)) return failed(FailureTag.Unsupported, "decision-conversion-text");
      const folded = value.value.toLowerCase();
      if (folded === "true") return committed({ tag: ValueTag.Bool, value: true });
      return folded === "false" ? committed({ tag: ValueTag.Bool, value: false }) : decisionFailed();
    }
    case ValueTag.Int:
    case ValueTag.Decimal:
      return decisionFailed();
    case ValueTag.Null:
    case ValueTag.List:
    case ValueTag.Map:
    case ValueTag.StringList:
      return committed(value);
  }
  return assertNever(value);
}

function toText(value: Value): Result<Value> {
  switch (value.tag) {
    case ValueTag.String:
      return committed(value);
    case ValueTag.Bool:
      return committed({ tag: ValueTag.String, value: value.value ? "true" : "false" });
    case ValueTag.Int:
      return committed({ tag: ValueTag.String, value: String(value.value) });
    case ValueTag.Decimal:
      // dynamic-only: `String.valueOf` of a BigDecimal is a Java text form the kernel does not decide
      return failed(FailureTag.Unsupported, "decision-conversion-kind");
    case ValueTag.Null:
    case ValueTag.List:
    case ValueTag.Map:
    case ValueTag.StringList:
      return committed(value);
  }
  return assertNever(value);
}

/**
 * An input's value: the visible binding nearest its scope occurrence, converted by its `typeRef`. An absent variable
 * reads as null, as `feel-scala` resolves an unknown name to null (`NO_VARIABLE_FOUND` is a suppressed failure since
 * 1.17, pinned `1.19.3`).
 */
function readInput(variables: Entries, input: DecisionInput): Result<Value> {
  switch (input.expression.tag) {
    case InputExpressionTag.Variable: {
      if (input.typeRef === null) return failed(FailureTag.Unsupported, "decision-input-type");
      const name = input.expression.name;
      return convert(input.typeRef, variables.find(([key]) => key === name)?.[1] ?? { tag: ValueTag.Null });
    }
    case InputExpressionTag.Foreign:
      return failed(FailureTag.Unsupported, "decision-input-expression");
  }
  return assertNever(input.expression);
}

/** A literal as the value FEEL yields: a whole number within `int` is a Java integral number. */
function literalValue(literal: FeelLiteral): Result<Value> {
  switch (literal.tag) {
    case FeelLiteralTag.Null:
      return committed({ tag: ValueTag.Null });
    case FeelLiteralTag.Bool:
      return committed({ tag: ValueTag.Bool, value: literal.value });
    case FeelLiteralTag.String:
      return committed({ tag: ValueTag.String, value: literal.value });
    case FeelLiteralTag.Number:
      return literal.scale === 0 && withinJavaInt(literal.coefficient)
        ? committed({ tag: ValueTag.Int, value: Number(literal.coefficient) })
        : failed(FailureTag.Unsupported, "decision-number");
  }
  return assertNever(literal);
}

/** Three-valued FEEL comparison of a converted input with a number literal: `null` is FEEL's null. */
function ordering(value: Value, bound: FeelLiteral): number | null {
  if (value.tag !== ValueTag.Int || bound.tag !== FeelLiteralTag.Number) return null;
  const difference = BigInt(value.value) * 10n ** BigInt(bound.scale) - bound.coefficient;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function satisfies(operator: Comparison, order: number): boolean {
  switch (operator) {
    case Comparison.Lt:
      return order < 0;
    case Comparison.Le:
      return order <= 0;
    case Comparison.Gt:
      return order > 0;
    case Comparison.Ge:
      return order >= 0;
  }
  return assertNever(operator);
}

/** Equality of a non-null literal with an input of its kind, which admission makes the only kind (`decision.testKind`). */
function equalsLiteral(value: Value, literal: FeelLiteral): boolean {
  switch (literal.tag) {
    case FeelLiteralTag.Null:
      return value.tag === ValueTag.Null;
    case FeelLiteralTag.Number:
      return ordering(value, literal) === 0;
    case FeelLiteralTag.String:
      return value.tag === ValueTag.String && value.value === literal.value;
    case FeelLiteralTag.Bool:
      return value.tag === ValueTag.Bool && value.value === literal.value;
  }
  return assertNever(literal);
}

/**
 * Item 5: equality against null is two-valued (`null` matches only null), a comparison or interval against null is
 * null, and a literal compares by value with an input of its kind.
 */
function test(value: Value, unary: UnaryTest): boolean | null {
  switch (unary.tag) {
    case UnaryTestTag.Literal:
      return equalsLiteral(value, unary.value);
    case UnaryTestTag.Compare: {
      const order = ordering(value, unary.bound);
      return order === null ? null : satisfies(unary.operator, order);
    }
    case UnaryTestTag.Interval: {
      const range = unary.value;
      const low = ordering(value, range.low);
      const high = ordering(value, range.high);
      if (low === null || high === null) return null;
      return (range.lowClosed ? low >= 0 : low > 0) && (range.highClosed ? high <= 0 : high < 0);
    }
  }
  return assertNever(unary);
}

/** A test list is the three-valued disjunction of its tests; `not` swaps true and false and keeps null. */
function entryHolds(value: Value, entry: InputEntry): Result<boolean> {
  switch (entry.tag) {
    case InputEntryTag.Any:
      return committed(true);
    case InputEntryTag.Foreign:
      return failed(FailureTag.Unsupported, "decision-feel");
    case InputEntryTag.Tests: {
      const results = [entry.value.first, ...entry.value.rest].map((unary) => test(value, unary));
      const disjunction = results.includes(true) ? true : results.includes(null) ? null : false;
      return committed(entry.value.negated ? disjunction === false : disjunction === true);
    }
  }
  return assertNever(entry);
}

/** A rule matches only when every input entry is true. */
function ruleMatches(values: readonly Value[], rule: DecisionRule): Result<boolean> {
  let all = true;
  for (const [index, value] of values.entries()) {
    const entry = rule.inputs[index];
    if (entry === undefined) continue;
    const held = entryHolds(value, entry);
    if (!held.ok) return held;
    all &&= held.value;
  }
  return committed(all);
}

function outputLiteral(entry: OutputEntry): Result<Value> {
  switch (entry.tag) {
    case OutputEntryTag.Literal:
      return literalValue(entry.value);
    case OutputEntryTag.Blank:
      return failed(FailureTag.Unsupported, "decision-blank-output");
    case OutputEntryTag.Foreign:
      return failed(FailureTag.Unsupported, "decision-feel");
  }
  return assertNever(entry);
}

/** One matching rule's entry map, each output entry converted by its output's `typeRef`, in output order. */
function ruleEntries(outputs: readonly DecisionOutput[], rule: DecisionRule): Result<Entries> {
  const entries: Binding[] = [];
  for (const [index, output] of outputs.entries()) {
    const entry = rule.outputs[index];
    if (entry === undefined) continue;
    const literal = outputLiteral(entry);
    if (!literal.ok) return literal;
    const value = output.typeRef === null ? literal : convert(output.typeRef, literal.value);
    if (!value.ok) return value;
    entries.push([output.name ?? "", value.value]);
  }
  return committed(entries);
}

/** Value equality as CIB's typed values compare (`DmnEvaluatedOutputImpl.java:69-80`), over the kinds an output holds. */
function sameValue(left: Value, right: Value): boolean {
  switch (left.tag) {
    case ValueTag.Null:
      return right.tag === ValueTag.Null;
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.String:
      return right.tag === left.tag && right.value === left.value;
    case ValueTag.Decimal:
    case ValueTag.StringList:
    case ValueTag.List:
    case ValueTag.Map:
      return false;
  }
  return assertNever(left);
}

const sameEntries = (left: Entries, right: Entries): boolean =>
  left.length === right.length && left.every(([name, value], index) => {
    const other = right[index];
    return other !== undefined && other[0] === name && sameValue(value, other[1]);
  });

/** Item 5: the hit policy over every matching rule's entry map, in rule order. */
function select(table: DecisionTable, results: readonly Entries[]): Result<readonly Entries[]> {
  if (table.aggregation !== null) return failed(FailureTag.Unsupported, "decision-hit-policy");
  const [first, ...rest] = results;
  switch (table.hitPolicy) {
    case HitPolicy.Unique:
      return results.length > 1 ? decisionFailed() : committed(results);
    case HitPolicy.First:
      return committed(first === undefined ? [] : [first]);
    case HitPolicy.Any:
      if (first === undefined) return committed([]);
      return rest.every((entries) => sameEntries(first, entries)) ? committed([first]) : decisionFailed();
    case HitPolicy.RuleOrder:
    case HitPolicy.Collect:
      return committed(results);
    case HitPolicy.Priority:
    case HitPolicy.OutputOrder:
      return failed(FailureTag.Unsupported, "decision-hit-policy");
  }
  return assertNever(table.hitPolicy);
}

/** The selected entry maps of `table` against the variables visible from the task's scope occurrence. */
function tableResults(table: DecisionTable, variables: Entries): Result<readonly Entries[]> {
  const values: Value[] = [];
  for (const input of table.inputs) {
    const value = readInput(variables, input);
    if (!value.ok) return value;
    values.push(value.value);
  }
  const matching: DecisionRule[] = [];
  for (const rule of table.rules) {
    const matched = ruleMatches(values, rule);
    if (!matched.ok) return matched;
    if (matched.value) matching.push(rule);
  }
  const results: Entries[] = [];
  for (const rule of matching) {
    const entries = ruleEntries(table.outputs, rule);
    if (!entries.ok) return entries;
    results.push(entries.value);
  }
  return select(table, results);
}

/** A Map value in the Data semantics' key order; CIB's entry maps are `HashMap`s, whose order is no fact. */
const entryMap = (entries: Entries): Value =>
  ({ tag: ValueTag.Map, entries: [...entries].sort((left, right) => compareStrings(left[0], right[0])) });

/**
 * The mapper CIB applies to the result (`SingleEntryDecisionResultMapper`, `SingleResultDecisionResultMapper`,
 * `CollectEntriesDecisionResultMapper`, `ResultListDecisionTableResultMapper`, `DmnDecisionResultImpl.java:51-105`).
 */
function mapResult(mapping: DecisionResultMapping, results: readonly Entries[]): Result<Value> {
  const [only, ...others] = results;
  switch (mapping) {
    case DecisionResultMapping.SingleEntry: {
      if (only === undefined) return committed({ tag: ValueTag.Null });
      const [entry, ...more] = only;
      return others.length === 0 && entry !== undefined && more.length === 0 ? committed(entry[1]) : decisionFailed();
    }
    case DecisionResultMapping.SingleResult:
      if (only === undefined) return committed({ tag: ValueTag.Null });
      return others.length === 0 ? committed(entryMap(only)) : decisionFailed();
    case DecisionResultMapping.CollectEntries:
      if (new Set(results.flatMap((entries) => entries.map(([name]) => name))).size > 1) return decisionFailed();
      return committed({ tag: ValueTag.List, items: results.flatMap((entries) => entries.map(([, value]) => value)) });
    case DecisionResultMapping.ResultList:
      return committed({ tag: ValueTag.List, items: results.map(entryMap) });
  }
  return assertNever(mapping);
}

/**
 * The writes a Business Rule Task's decision makes: `(resultVariable, mapped value)`, or none without a result
 * variable, since CIB applies no mapper then and its `decisionResult` is transient (`DecisionEvaluationUtil.java:79-87`).
 */
export function run(program: Program, work: RuleWork, variables: Entries): Result<Entries> {
  if (work.decision.tag !== ValueSourceTag.Literal) return failed(FailureTag.Unsupported, "work-rule-decision-expression");
  const decision = programDecision(program, work.decision.value);
  if (decision === null) return failed(FailureTag.Unsupported, "work-rule-decision-missing");
  if (decision.logic.tag !== DecisionLogicTag.Table) return failed(FailureTag.Unsupported, "decision-logic");
  const results = tableResults(decision.logic.value, variables);
  if (!results.ok) return results;
  if (work.resultVariable === null) return committed([]);
  const mapped = mapResult(work.resultMapping, results.value);
  return mapped.ok ? committed([[work.resultVariable, mapped.value]]) : mapped;
}
