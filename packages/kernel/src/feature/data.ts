/**
 * Data: in-kernel expression evaluation, transcribed from `Kernel/Feature/Data.lean`.
 *
 * The kernel evaluates literals, the [Simple Boolean subset](../../../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)
 * and plain variable references; every other expression is answered by the profile's host evaluator. Variables
 * are looked up innermost scope first.
 */
import {
  ExpressionTag,
  SimpleBooleanTag,
  ValueTag,
  assertNever,
  type Expression,
  type SimpleBoolean,
  type Value,
} from "../il/types.js";
import { EvaluationTag, type Evaluation } from "../hooks.js";
import type { Binding } from "../state.js";

function lookup(variables: readonly Binding[], name: string): Value | undefined {
  return variables.find((entry) => entry[0] === name)?.[1];
}

/** Decision table: presence includes an explicit null; `stringEquals` is false for absence and null. */
function simpleBoolean(variables: readonly Binding[], body: SimpleBoolean): boolean {
  switch (body.tag) {
    case SimpleBooleanTag.Literal:
      return body.value;
    case SimpleBooleanTag.IsPresent:
      return lookup(variables, body.name) !== undefined;
    case SimpleBooleanTag.IsNull:
      return lookup(variables, body.name)?.tag === ValueTag.Null;
    case SimpleBooleanTag.StringEquals: {
      const actual = lookup(variables, body.name);
      return actual?.tag === ValueTag.String && actual.value === body.value;
    }
  }
  return assertNever(body);
}

export function evaluate(variables: readonly Binding[], expression: Expression): Evaluation {
  switch (expression.tag) {
    case ExpressionTag.Literal:
      return { tag: EvaluationTag.Value, result: expression.value };
    case ExpressionTag.SimpleBoolean:
      return { tag: EvaluationTag.Value, result: { tag: ValueTag.Bool, value: simpleBoolean(variables, expression.body) } };
    case ExpressionTag.Variable: {
      const value = lookup(variables, expression.name);
      return value === undefined
        ? { tag: EvaluationTag.Failure, code: "unknown-variable" }
        : { tag: EvaluationTag.Value, result: value };
    }
    case ExpressionTag.Foreign:
      return { tag: EvaluationTag.NeedsHost };
  }
  return assertNever(expression);
}
