import { VariableValueKind } from "./contract.js";
import type {
  EffectOccurrenceId,
  VariableBinding,
} from "./contract.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import {
  compareCanonicalStrings,
} from "./wire.js";
import { cloneVariableBinding } from "./variable-value.js";
import {
  sameOccurrence,
} from "./semantic-process-state.js";
import type {
  ScopedVariables,
} from "./semantic-process-state.js";
import { compareActivityVariableScopes } from "./runtime-state-collection-ordering.js";

export function evaluateInputMappings(
  mappings: ReadonlyArray<VariableMapping>,
): ReadonlyArray<VariableBinding> {
  return mappings.map((mapping): VariableBinding => {
    switch (mapping.expression.kind) {
      case MappingExpressionKind.StringLiteral:
        return {
          name: mapping.target,
          value: {
            kind: VariableValueKind.String,
            value: mapping.expression.value,
          },
        };
      case MappingExpressionKind.LocalVariable:
        throw new TypeError(
          "Local-variable expressions are not admitted as effect inputs",
        );
      default:
        return assertNever(mapping.expression);
    }
  }).sort(compareBindings);
}

/**
 * Adds the input-mapping scope for one newly activated effect occurrence.
 *
 * Duplicate complete owners indicate invalid internal state and throw before a transition is committed.
 */
export function addActivityVariableScope(
  variables: ScopedVariables,
  owner: EffectOccurrenceId,
  bindings: ReadonlyArray<VariableBinding>,
): ScopedVariables {
  if (variables.activities.some((scope) => sameOccurrence(scope.owner, owner))) {
    throw new TypeError("Activity-variable scope owner must be unique");
  }
  return {
    ...variables,
    activities: [
      ...variables.activities,
      { owner, bindings: [...bindings] },
    ].sort(compareActivityVariableScopes),
  };
}

/**
 * Validates one effect result against its unique occurrence-owned local scope, applies the
 * committed output mapping to Process scope, and removes only that local scope atomically.
 *
 * Missing or duplicate owners and invalid patches return `null` without changing the input state.
 */
export function completeActivityVariableScope(
  variables: ScopedVariables,
  owner: EffectOccurrenceId,
  outputMappings: ReadonlyArray<VariableMapping>,
  localPatch: ReadonlyArray<VariableBinding>,
  allowNull: boolean,
): ScopedVariables | null {
  const matching = variables.activities.filter((scope) =>
    sameOccurrence(scope.owner, owner)
  );
  if (matching.length !== 1) {
    return null;
  }
  const activity = matching[0];
  if (activity === undefined) {
    return null;
  }
  const processBindings = applyEffectPatch(
    activity.bindings,
    outputMappings,
    variables.process.bindings,
    localPatch,
    allowNull,
  );
  if (processBindings === null) {
    return null;
  }
  return {
    process: { bindings: processBindings },
    activities: variables.activities.filter((scope) => scope !== activity),
  };
}

function applyEffectPatch(
  arguments_: ReadonlyArray<VariableBinding>,
  outputMappings: ReadonlyArray<VariableMapping>,
  processBindings: ReadonlyArray<VariableBinding>,
  localPatch: ReadonlyArray<VariableBinding>,
  allowNull: boolean,
): ReadonlyArray<VariableBinding> | null {
  const requiredLocalNames = outputMappings.map((mapping) => {
    const expression = mapping.expression;
    switch (expression.kind) {
      case MappingExpressionKind.LocalVariable:
        return expression.name;
      case MappingExpressionKind.StringLiteral:
        throw new TypeError(
          "String literals are not admitted as effect outputs",
        );
      default:
        return assertNever(expression);
    }
  }).sort(compareCanonicalStrings);
  const patch = validatePatch(
    localPatch,
    requiredLocalNames,
    allowNull,
  );
  if (patch === null) {
    return null;
  }
  const localVariables = mergeProcessVariableBindings(arguments_, patch);
  const projected = outputMappings.map((mapping) => {
    const expression = mapping.expression;
    if (expression.kind !== MappingExpressionKind.LocalVariable) {
      throw new TypeError("Unsupported effect output expression");
    }
    const value = localVariables.find(
      ({ name }) => name === expression.name,
    )?.value;
    if (value === undefined) {
      throw new TypeError("Validated effect output variable is missing");
    }
    return { name: mapping.target, value };
  });
  return mergeProcessVariableBindings(processBindings, projected);
}

function validatePatch(
  patch: ReadonlyArray<VariableBinding>,
  requiredNames: ReadonlyArray<string>,
  allowNull: boolean,
): ReadonlyArray<VariableBinding> | null {
  if (patch.length !== requiredNames.length) {
    return null;
  }
  const sorted = [...patch].sort(compareBindings);
  for (let index = 0; index < sorted.length; index += 1) {
    const binding = sorted[index];
    if (
      binding === undefined ||
      binding.name !== requiredNames[index] ||
      !isPermittedValue(binding, allowNull)
    ) {
      return null;
    }
  }
  return sorted;
}

function isPermittedValue(
  binding: VariableBinding,
  allowNull: boolean,
): boolean {
  switch (binding.value.kind) {
    case VariableValueKind.Boolean:
      return false;
    case VariableValueKind.String:
      return true;
    case VariableValueKind.Null:
      return allowNull;
    default:
      return false;
  }
}

/** Applies a canonical create-or-replace patch to Process bindings without mutating either input. */
export function mergeProcessVariableBindings(
  existing: ReadonlyArray<VariableBinding>,
  replacements: ReadonlyArray<VariableBinding>,
): ReadonlyArray<VariableBinding> {
  const replacedNames = new Set(replacements.map(({ name }) => name));
  return [
    ...existing.filter(({ name }) => !replacedNames.has(name)),
    ...replacements.map(cloneVariableBinding),
  ].sort(compareBindings);
}

function compareBindings(
  left: VariableBinding,
  right: VariableBinding,
): number {
  return compareCanonicalStrings(left.name, right.name);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported data variant: ${JSON.stringify(value)}`);
}
