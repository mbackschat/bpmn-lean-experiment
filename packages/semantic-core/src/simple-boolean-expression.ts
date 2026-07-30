import {
  VariableValueKind,
} from "./contract.js";
import type {
  VariableBinding,
} from "./contract.js";
import {
  SimpleBooleanExpressionKind,
} from "./semantic-process-contract.js";
import type {
  SimpleBooleanExpression,
} from "./semantic-process-contract.js";

/** Evaluates one admitted Simple Boolean v1 AST over complete Process bindings. */
export function evaluateSimpleBooleanExpression(
  expression: SimpleBooleanExpression,
  bindings: ReadonlyArray<VariableBinding>,
): boolean {
  switch (expression.kind) {
    case SimpleBooleanExpressionKind.Literal:
      return expression.value;
    case SimpleBooleanExpressionKind.IsPresent:
      return binding(bindings, expression.variable) !== undefined;
    case SimpleBooleanExpressionKind.IsNull:
      return (
        binding(bindings, expression.variable)?.value.kind ===
        VariableValueKind.Null
      );
    case SimpleBooleanExpressionKind.StringEquals: {
      const value = binding(bindings, expression.variable)?.value;
      return (
        value?.kind === VariableValueKind.String &&
        value.value === expression.value
      );
    }
    default:
      return assertNever(expression);
  }
}

function binding(
  bindings: ReadonlyArray<VariableBinding>,
  name: string,
): VariableBinding | undefined {
  const matches = bindings.filter((candidate) => candidate.name === name);
  if (matches.length > 1) {
    throw new TypeError(`Process variable ${name} has duplicate bindings`);
  }
  return matches[0];
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Simple Boolean expression: ${JSON.stringify(value)}`,
  );
}
