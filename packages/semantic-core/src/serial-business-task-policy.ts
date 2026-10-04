import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { EffectProtocol, MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { compareCanonicalStrings, isWellFormedWireString } from "./wire.js";

const reservedNames = new Set([
  "null", "true", "false", "empty", "div", "mod", "not", "and", "or", "le", "lt", "eq", "ne", "ge", "gt", "instanceof",
  "execution", "caseExecution", "task", "externalTask", "authenticatedUserId",
]);

/** CIB-EXT-0015 excludes JUEL keywords and context names before variable/bean resolution. */
export function isSerialBusinessIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) && !reservedNames.has(value);
}

export function serialBusinessMappingsAdmitted(value: unknown, input: boolean, handlers: ReadonlySet<string> = new Set()): value is readonly VariableMapping[] {
  if (!Array.isArray(value)) return false;
  return value.every((mapping, index) => {
    if (!isRecord(mapping) || !hasOnlyKeys(mapping, ["target", "expression"]) ||
        !isSerialBusinessIdentifier(mapping.target) || handlers.has(mapping.target) ||
        (index > 0 && compareCanonicalStrings(value[index - 1].target, mapping.target) >= 0) || !isRecord(mapping.expression)) return false;
    const expression = mapping.expression;
    switch (expression.kind) {
      case MappingExpressionKind.StringLiteral:
        return input && hasOnlyKeys(expression, ["kind", "value"]) && isWellFormedWireString(expression.value) &&
          expression.value.length > 0 && expression.value.trim() === expression.value && !/[#$]\{/u.test(expression.value);
      case MappingExpressionKind.EnclosingVariable:
      case MappingExpressionKind.LocalVariable:
        return expression.kind === (input ? MappingExpressionKind.EnclosingVariable : MappingExpressionKind.LocalVariable) &&
          hasOnlyKeys(expression, ["kind", "name"]) && isSerialBusinessIdentifier(expression.name) && !handlers.has(expression.name);
      default: return false;
    }
  });
}

export function serialBusinessEffectAdmitted(value: unknown, handlers: ReadonlySet<string> = new Set()): boolean {
  if (!isRecord(value) || !isRecord(value.descriptor)) return false;
  return hasOnlyKeys(value.descriptor, ["protocol", "operation"]) && value.descriptor.protocol === EffectProtocol.Activity &&
    isSerialBusinessIdentifier(value.descriptor.operation) && value.descriptor.operation.length <= 1024 && serialBusinessMappingsAdmitted(value.inputMappings, true, handlers) &&
    serialBusinessMappingsAdmitted(value.outputMappings, false, handlers);
}

export function serialBusinessBindingsAdmitted(bindings: readonly VariableBinding[], handlers: ReadonlySet<string>): boolean {
  return bindings.every(({ name, value }, index) => isSerialBusinessIdentifier(name) && !handlers.has(name) &&
    (index === 0 || compareCanonicalStrings(bindings[index - 1]!.name, name) < 0) &&
    (value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
