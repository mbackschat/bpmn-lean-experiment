import { VariableValueKind } from "./contract.js";
import type {
  EffectOccurrenceId,
  VariableBinding,
} from "./contract.js";
import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import {
  compareCanonicalStrings,
} from "./wire.js";
import { cloneVariableBinding } from "./variable-value.js";
import type {
  ScopedVariables,
} from "./semantic-process-state.js";
import { compareActivityVariableScopes } from "./runtime-state-collection-ordering.js";
import {
  createActivityLocalDataOwner,
  createEffectLocalDataOwner,
  matchesActivityLocalDataOwner,
  matchesEffectLocalDataOwner,
} from "./local-data-owner.js";

export function evaluateInputMappings(
  mappings: ReadonlyArray<VariableMapping>,
  enclosingBindings: ReadonlyArray<VariableBinding> = [],
): ReadonlyArray<VariableBinding> | null {
  const result: VariableBinding[] = [];
  for (const mapping of mappings) {
    if (result.some(({ name }) => name === mapping.target)) return null;
    switch (mapping.expression.kind) {
      case MappingExpressionKind.StringLiteral:
        result.push({
          name: mapping.target,
          value: {
            kind: VariableValueKind.String,
            value: mapping.expression.value,
          },
        });
        break;
      case MappingExpressionKind.EnclosingVariable: {
        const sourceName = mapping.expression.name;
        const matching = enclosingBindings.filter(({ name }) => name === sourceName);
        const source = matching[0];
        if (matching.length !== 1 || source === undefined || !isPermittedValue(source, true)) return null;
        result.push({ ...cloneVariableBinding(source), name: mapping.target });
        break;
      }
      case MappingExpressionKind.LocalVariable:
        throw new TypeError(
          "Local-variable expressions are not admitted as effect inputs",
        );
      default:
        return assertNever(mapping.expression);
    }
  }
  return result.sort(compareBindings);
}

/** SBT-SNAPSHOT-01 captures enclosing reads at activation; projection must not reevaluate mutable Process data. */
export function inputMappingSnapshotMatches(
  mappings: ReadonlyArray<VariableMapping>,
  arguments_: ReadonlyArray<VariableBinding>,
): boolean {
  if (mappings.length !== arguments_.length) return false;
  const ordered = [...mappings].sort((left, right) => compareCanonicalStrings(left.target, right.target));
  return ordered.every((mapping, index) => {
    const binding = arguments_[index];
    if (binding === undefined || binding.name !== mapping.target ||
      (index > 0 && ordered[index - 1]?.target === mapping.target)) return false;
    switch (mapping.expression.kind) {
      case MappingExpressionKind.StringLiteral:
        return binding.value.kind === VariableValueKind.String && binding.value.value === mapping.expression.value;
      case MappingExpressionKind.EnclosingVariable:
        return isPermittedValue(binding, true);
      case MappingExpressionKind.LocalVariable:
        return false;
      default:
        return assertNever(mapping.expression);
    }
  });
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
  if (
    variables.activities.some((scope) =>
      matchesEffectLocalDataOwner(scope.owner, owner)
    )
  ) {
    throw new TypeError("Activity-variable scope owner must be unique");
  }
  return {
    ...variables,
    activities: [
      ...variables.activities,
      { owner: createEffectLocalDataOwner(owner), bindings: [...bindings] },
    ].sort(compareActivityVariableScopes),
  };
}

/**
 * Adds the Activity data-input scope for one newly activated Activity occurrence.
 *
 * Separate from the effect entry point rather than sharing one owner-taking function, because the two
 * families mint different identities: substituting one for the other is exactly the alias this
 * discriminated owner exists to make unrepresentable.
 */
export function addActivityOccurrenceVariableScope(
  variables: ScopedVariables,
  owner: ActivityOccurrenceId,
  bindings: ReadonlyArray<VariableBinding>,
): ScopedVariables {
  if (
    variables.activities.some((scope) =>
      matchesActivityLocalDataOwner(scope.owner, owner)
    )
  ) {
    throw new TypeError("Activity-occurrence local scope owner must be unique");
  }
  return {
    ...variables,
    activities: [
      ...variables.activities,
      {
        owner: createActivityLocalDataOwner(owner),
        bindings: bindings.map(cloneVariableBinding),
      },
    ].sort(compareActivityVariableScopes),
  };
}

/** The bindings of one Activity occurrence's unique local scope, or `undefined`. */
export function activityOccurrenceVariableBindings(
  variables: ScopedVariables,
  owner: ActivityOccurrenceId,
): ReadonlyArray<VariableBinding> | undefined {
  const matching = variables.activities.filter((scope) =>
    matchesActivityLocalDataOwner(scope.owner, owner)
  );
  return matching.length === 1 ? matching[0]?.bindings : undefined;
}

/**
 * Removes one Activity occurrence's local scope, preserving Process scope and every other owner.
 *
 * Returns `null` for a missing or duplicated owner rather than removing what it found, so a state
 * that has lost the join refuses the command instead of committing a partial disposal.
 */
export function removeActivityOccurrenceVariableScope(
  variables: ScopedVariables,
  owner: ActivityOccurrenceId,
): ScopedVariables | null {
  const retained = variables.activities.filter((scope) =>
    !matchesActivityLocalDataOwner(scope.owner, owner)
  );
  return variables.activities.length - retained.length === 1
    ? { ...variables, activities: retained }
    : null;
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
  const result = projectActivityVariableScopeResult(variables, owner, outputMappings, localPatch, allowNull);
  return result === null ? null : {
    ...result.variables,
    process: { bindings: mergeProcessVariableBindings(variables.process.bindings, result.outputs) },
  };
}

/** Separates validated effect outputs from their destination; SMIS-DATA-01 requires nearest-scope writes. */
export function projectActivityVariableScopeResult(
  variables: ScopedVariables,
  owner: EffectOccurrenceId,
  outputMappings: ReadonlyArray<VariableMapping>,
  localPatch: ReadonlyArray<VariableBinding>,
  allowNull: boolean,
): Readonly<{ variables: ScopedVariables; outputs: ReadonlyArray<VariableBinding> }> | null {
  const matching = variables.activities.filter((scope) => matchesEffectLocalDataOwner(scope.owner, owner));
  const activity = matching[0];
  if (matching.length !== 1 || activity === undefined) return null;
  const outputs = projectEffectPatch(activity.bindings, outputMappings, localPatch, allowNull);
  if (outputs === null) return null;
  return {
    variables: { ...variables, activities: variables.activities.filter((scope) => scope !== activity) },
    outputs,
  };
}

function projectEffectPatch(
  arguments_: ReadonlyArray<VariableBinding>,
  outputMappings: ReadonlyArray<VariableMapping>,
  localPatch: ReadonlyArray<VariableBinding>,
  allowNull: boolean,
): ReadonlyArray<VariableBinding> | null {
  const requiredLocalNames = [...new Set(outputMappings.map((mapping) => {
    const expression = mapping.expression;
    switch (expression.kind) {
      case MappingExpressionKind.LocalVariable:
        return expression.name;
      case MappingExpressionKind.StringLiteral:
      case MappingExpressionKind.EnclosingVariable:
        throw new TypeError(
          "Only local-variable expressions are admitted as effect outputs",
        );
      default:
        return assertNever(expression);
    }
  }))].sort(compareCanonicalStrings);
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
  return mergeProcessVariableBindings([], projected);
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
