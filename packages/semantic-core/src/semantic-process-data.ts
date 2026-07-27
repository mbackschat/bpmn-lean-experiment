import { VariableValueKind } from "./contract.js";
import type {
  VariableBinding,
} from "./contract.js";
import {
  MappingExpressionKind,
} from "./semantic-process-contract.js";
import type {
  VariableMapping,
} from "./semantic-process-contract.js";
import {
  compareCanonicalStrings,
} from "./wire.js";

export function evaluateInputMappings(
  mappings: ReadonlyArray<VariableMapping>,
): ReadonlyArray<VariableBinding> {
  return mappings.map((mapping) => {
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

export function applyEffectPatch(
  arguments_: ReadonlyArray<VariableBinding>,
  outputMappings: ReadonlyArray<VariableMapping>,
  processVariables: ReadonlyArray<VariableBinding>,
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
  const localVariables = mergeBindings(arguments_, patch);
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
  return mergeBindings(processVariables, projected);
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
    case VariableValueKind.String:
      return true;
    case VariableValueKind.Null:
      return allowNull;
    default:
      return false;
  }
}

function mergeBindings(
  existing: ReadonlyArray<VariableBinding>,
  replacements: ReadonlyArray<VariableBinding>,
): ReadonlyArray<VariableBinding> {
  const replacedNames = new Set(replacements.map(({ name }) => name));
  return [
    ...existing.filter(({ name }) => !replacedNames.has(name)),
    ...replacements,
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
