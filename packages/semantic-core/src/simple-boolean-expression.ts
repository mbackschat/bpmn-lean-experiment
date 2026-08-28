import {
  VariableValueKind,
} from "./contract.js";
import type {
  VariableBinding,
} from "./contract.js";
import { SimpleBooleanExpressionKind } from "./semantic-value-contract.js";
import type { SimpleBooleanExpression } from "./semantic-value-contract.js";

/** Evaluates one admitted Simple Boolean v1 AST over complete Process bindings. */
export function evaluateSimpleBooleanExpression(
  expression: SimpleBooleanExpression,
  bindings: ReadonlyArray<VariableBinding>,
): boolean {
  return evaluateSimpleBooleanExpressionWithRead(expression, bindings).value;
}

export type SimpleBooleanExpressionEvaluation = Readonly<{
  value: boolean;
  readVariable: string | null;
}>;

/** Evaluates one expression and retains its exact Process-variable dependency. */
export function evaluateSimpleBooleanExpressionWithRead(
  expression: SimpleBooleanExpression,
  bindings: ReadonlyArray<VariableBinding>,
): SimpleBooleanExpressionEvaluation {
  switch (expression.kind) {
    case SimpleBooleanExpressionKind.Literal:
      return { value: expression.value, readVariable: null };
    case SimpleBooleanExpressionKind.IsPresent:
      return {
        value: binding(bindings, expression.variable) !== undefined,
        readVariable: expression.variable,
      };
    case SimpleBooleanExpressionKind.IsNull:
      return {
        value: binding(bindings, expression.variable)?.value.kind ===
          VariableValueKind.Null,
        readVariable: expression.variable,
      };
    case SimpleBooleanExpressionKind.StringEquals: {
      const value = binding(bindings, expression.variable)?.value;
      return {
        value: value?.kind === VariableValueKind.String &&
          value.value === expression.value,
        readVariable: expression.variable,
      };
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
