import type { VariableBinding, VariableValue } from "./contract.js";
import { EffectMappingValuePolicy, effectMappingAcceptsValue } from "./effect-mapping-value-policy.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { EffectProtocol, MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { compareCanonicalStrings, isWellFormedWireString, utf8ByteLength } from "./wire.js";
import { isAssignmentFormUserTaskMetadata } from "./user-task-metadata.js";

const reservedNames = new Set([
  "null", "true", "false", "empty", "div", "mod", "not", "and", "or", "le", "lt", "eq", "ne", "ge", "gt", "instanceof",
  "execution", "caseExecution", "task", "externalTask", "authenticatedUserId",
]);

/** Whether a serial business chain must, or may not, contain a Human Task. */
export const SerialChainHumanTasks = { Required: "required", Forbidden: "forbidden" } as const;
export type SerialChainHumanTasks = typeof SerialChainHumanTasks[keyof typeof SerialChainHumanTasks];

/**
 * What one serial-chain profile admits beyond the shared chain grammar. Derived from the exact profile and never from
 * a wire field, so a command cannot select a wider rule set for itself.
 */
export type SerialChainRules = Readonly<{
  humanTasks: SerialChainHumanTasks;
  /** UTF-8 byte ceiling of a String literal input, or `null` for the legacy unbounded-by-profile literal. */
  literalByteLimit: number | null;
  valuePolicy: EffectMappingValuePolicy;
}>;

/** The grammar CIB-EXT-0015 originally selected: at least one Human Task, String literals and scalar values. */
export const serialBusinessTaskRules: SerialChainRules = Object.freeze({
  humanTasks: SerialChainHumanTasks.Required, literalByteLimit: null, valuePolicy: EffectMappingValuePolicy.Scalar,
});

// The literal ceiling keeps every value an input can reference inside the SingletonBusinessItem root String bound.
const effectDataRules: SerialChainRules = Object.freeze({
  humanTasks: SerialChainHumanTasks.Forbidden, literalByteLimit: 1024, valuePolicy: EffectMappingValuePolicy.SingletonBusinessItem,
});

/** The rules of a serial-chain profile; any other profile that reuses the grammar keeps the serial rules. */
export function serialChainRulesForProfile(semanticProfile: string): SerialChainRules {
  return semanticProfile === SemanticProfileId.PortableBusinessEffectData ? effectDataRules : serialBusinessTaskRules;
}

/** Profiles whose Program and checked graph are one serial chain, as opposed to profiles that merely reuse its mappings. */
export function isSerialChainProfile(semanticProfile: string): boolean {
  return semanticProfile === SemanticProfileId.SerialBusinessTaskComposition ||
    semanticProfile === SemanticProfileId.PortableBusinessEffectData;
}

/** CIB-EXT-0015 excludes JUEL keywords and context names before variable/bean resolution. */
export function isSerialBusinessIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) && !reservedNames.has(value);
}

/** BPD-METADATA-01 keeps a legacy form key within the inherited writable business namespace. */
export function serialBusinessUserTaskMetadataAdmitted(task: Readonly<Record<string, unknown>>, handlers: ReadonlySet<string>): boolean {
  if (!Object.hasOwn(task, "metadata")) return true;
  const metadata = task.metadata;
  return isAssignmentFormUserTaskMetadata(metadata) && metadata.form.fields[0].type === "string" &&
    isSerialBusinessIdentifier(metadata.form.fields[0].key) && !handlers.has(metadata.form.fields[0].key);
}

export function serialBusinessMappingsAdmitted(value: unknown, input: boolean, handlers: ReadonlySet<string> = new Set(),
  rules: SerialChainRules = serialBusinessTaskRules): value is readonly VariableMapping[] {
  if (!Array.isArray(value)) return false;
  return value.every((mapping, index) => {
    if (!isRecord(mapping) || !hasOnlyKeys(mapping, ["target", "expression"]) ||
        !isSerialBusinessIdentifier(mapping.target) || handlers.has(mapping.target) ||
        (index > 0 && compareCanonicalStrings(value[index - 1].target, mapping.target) >= 0) || !isRecord(mapping.expression)) return false;
    const expression = mapping.expression;
    switch (expression.kind) {
      case MappingExpressionKind.StringLiteral:
        return input && hasOnlyKeys(expression, ["kind", "value"]) && isWellFormedWireString(expression.value) &&
          expression.value.length > 0 && expression.value.trim() === expression.value && !/[#$]\{/u.test(expression.value) &&
          (rules.literalByteLimit === null || utf8ByteLength(expression.value) <= rules.literalByteLimit);
      case MappingExpressionKind.EnclosingVariable:
      case MappingExpressionKind.LocalVariable:
        return expression.kind === (input ? MappingExpressionKind.EnclosingVariable : MappingExpressionKind.LocalVariable) &&
          hasOnlyKeys(expression, ["kind", "name"]) && isSerialBusinessIdentifier(expression.name) && !handlers.has(expression.name);
      default: return false;
    }
  });
}

export function serialBusinessEffectAdmitted(value: unknown, handlers: ReadonlySet<string> = new Set(),
  rules: SerialChainRules = serialBusinessTaskRules): boolean {
  if (!isRecord(value) || !isRecord(value.descriptor)) return false;
  return hasOnlyKeys(value.descriptor, ["protocol", "operation"]) && value.descriptor.protocol === EffectProtocol.Activity &&
    isSerialBusinessIdentifier(value.descriptor.operation) && value.descriptor.operation.length <= 1024 && serialBusinessMappingsAdmitted(value.inputMappings, true, handlers, rules) &&
    serialBusinessMappingsAdmitted(value.outputMappings, false, handlers, rules);
}

const scalarBinding = (value: VariableValue): boolean => effectMappingAcceptsValue(EffectMappingValuePolicy.Scalar, value, true);

/** Names must be identifiers outside the handler namespace in strictly increasing order; `admits` decides each value. */
export function serialBusinessBindingsAdmitted(bindings: readonly VariableBinding[], handlers: ReadonlySet<string>,
  admits: (value: VariableValue) => boolean = scalarBinding): boolean {
  return bindings.every(({ name, value }, index) => isSerialBusinessIdentifier(name) && !handlers.has(name) &&
    (index === 0 || compareCanonicalStrings(bindings[index - 1]!.name, name) < 0) && admits(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
