/**
 * Data: expression evaluation and variable writes, transcribed from `Kernel/Feature/Data.lean`.
 *
 * The kernel evaluates the Simple Boolean subset, plain variable references and, under `Evaluator.juel`, the Core JUEL
 * level (`data/juel.ts`); admission refuses every other expression. Variables are looked up innermost scope first. This feature is the only writer of variables (guard 17):
 * writes reach it through the completion pipeline and `Signal.write`.
 */
import {
  ExpressionTag,
  SimpleBooleanTag,
  UndeclaredWrite,
  ValueTag,
  assertNever,
  programDeclares,
  programItemScope,
  type Expression,
  type SimpleBoolean,
  type Value,
} from "../il/types.js";
import { evaluateJuel } from "./data/juel.js";
import {
  FailureTag,
  WriteRule,
  committed,
  declaring,
  failed,
  instanceRoot,
  owner,
  removeVariable,
  setVariable,
  type Binding,
  type EvalContext,
  type Outcome,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";
import { EvaluationTag, type Ctx, type Evaluation } from "../hooks.js";

export function lookup(variables: readonly Binding[], name: string): Value | null {
  return variables.find(([key]) => key === name)?.[1] ?? null;
}

/** Decision table: presence includes an explicit null; `stringEquals` is false for absence and null. */
export function simpleBoolean(variables: readonly Binding[], body: SimpleBoolean): boolean {
  switch (body.tag) {
    case SimpleBooleanTag.Literal:
      return body.value;
    case SimpleBooleanTag.IsPresent:
      return lookup(variables, body.name) !== null;
    case SimpleBooleanTag.IsNull:
      return lookup(variables, body.name)?.tag === ValueTag.Null;
    case SimpleBooleanTag.StringEquals: {
      const actual = lookup(variables, body.name);
      return actual?.tag === ValueTag.String && actual.value === body.value;
    }
  }
  return assertNever(body);
}

export function evaluate(context: EvalContext, expression: Expression): Evaluation {
  switch (expression.tag) {
    case ExpressionTag.Literal:
      return { tag: EvaluationTag.Value, result: expression.value };
    case ExpressionTag.SimpleBoolean:
      return { tag: EvaluationTag.Value, result: { tag: ValueTag.Bool, value: simpleBoolean(context.variables, expression.body) } };
    case ExpressionTag.Variable: {
      const value = lookup(context.variables, expression.name);
      return value === null ? { tag: EvaluationTag.Failure, code: "unknown-variable" } : { tag: EvaluationTag.Value, result: value };
    }
    case ExpressionTag.Juel:
      return evaluateJuel(context, expression.nodes);
    case ExpressionTag.Foreign:
      // Admission refuses it (`expression.outsideSimpleBoolean`, `mapping.expression`, `flow.condition.foreign`), so it
      // is `unsupported` like every refused shape (guard 20).
      return { tag: EvaluationTag.Unsupported, code: "expression.outsideSimpleBoolean" };
  }
  return assertNever(expression);
}

/**
 * Where a write or removal of `name` from `scope` acts by element identity: for an item a Scope declares, the nearest
 * occurrence of that Scope (`declaring`), set or unset, never another frame's binding of the identifier (BPMN 2.0.2
 * §10.4.1); `null` for any other name, or for a site no occurrence of the declaring Scope encloses, which admission
 * refuses for a Data Association (`data.itemInaccessible`, `data.scopedItem`) and which then acts by name.
 */
function itemOwner(ctx: Ctx, state: State, scope: ScopeOccurrenceId, name: string): ScopeOccurrenceId | null {
  const element = programItemScope(ctx.program, name);
  return element === null ? null : declaring(state, scope, element);
}

/**
 * One write seen from `scope`. Outward, an item a Scope declares goes to its declaring occurrence (`itemOwner`); a name
 * no scope binds goes to the instance root when the instance's process declares it, since a target is a declared item
 * (BPMN 2.0.2 §10.4.1); any other name is the profile's choice: refused, or created at the instance root as CIB does
 * (`UndeclaredWrite`, `AbstractVariableScope.setVariable`).
 */
function write(ctx: Ctx, rule: WriteRule, scope: ScopeOccurrenceId, state: State, [name, value]: Binding): Outcome {
  switch (rule) {
    case WriteRule.Own:
      return committed(setVariable(state, scope, name, value));
    case WriteRule.Outward: {
      const target = itemOwner(ctx, state, scope, name) ?? owner(state, scope, name);
      if (target !== null) return committed(setVariable(state, target, name, value));
      const root = instanceRoot(state, scope);
      const definition = state.slots.instances.find((instance) => instance.root === root)?.definition ?? null;
      if (programDeclares(ctx.program, definition, name)) return committed(setVariable(state, root, name, value));
      switch (ctx.program.options.undeclaredWrite) {
        case UndeclaredWrite.Refused:
          return failed(FailureTag.SemanticFailure, "undeclared-write");
        case UndeclaredWrite.AtInstanceRoot:
          return committed(setVariable(state, root, name, value));
      }
      return assertNever(ctx.program.options.undeclaredWrite);
    }
  }
  return assertNever(rule);
}

/** `Hooks.writeOutputs`: apply writes from a scope occurrence, under the writing feature's rule. */
export function writeOutputs(ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], rule: WriteRule, state: State): Outcome {
  let current = state;
  for (const binding of writes) {
    const next = write(ctx, rule, scope, current, binding);
    if (!next.ok) return next;
    current = next.value;
  }
  return committed(current);
}

/**
 * `Hooks.removeVariables`: delete each name from its declaring occurrence when it is a Scope's item (`itemOwner`), else
 * from the innermost scope that declares it; an undeclared name is nothing to delete.
 */
export function removeVariables(ctx: Ctx, scope: ScopeOccurrenceId, names: readonly string[], state: State): Outcome {
  return committed(names.reduce((current, name) => {
    const target = itemOwner(ctx, current, scope, name) ?? owner(current, scope, name);
    return target === null ? current : removeVariable(current, target, name);
  }, state));
}
