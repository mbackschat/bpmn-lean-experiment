import { EffectExecutionResultKind, StimulusKind, VariableValueKind } from "./contract.js";
import type { Stimulus, VariableBinding } from "./contract.js";
import { SemanticOperationKind as Op } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { isSerialBusinessIdentifier, serialBusinessBindingsAdmitted, serialBusinessEffectAdmitted } from "./serial-business-task-policy.js";
import { SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { sequentialMultiInstanceCollectionWithinLimits } from "./sequential-multi-instance-command-data-admission.js";
import { sequentialMultiInstanceLimits } from "./sequential-multi-instance-contract.js";
import { compareCanonicalStrings, isWellFormedWireString } from "./wire.js";

export type SequentialScopeDataAnalysis = Readonly<{
  collectionName: string;
  itemName: string;
  completionBooleanName: string | null;
  handlerNames: ReadonlySet<string>;
  requiredProcessScalars: readonly string[];
}>;

/** CIB 2.2.0 BpmnParseUtil.parseParamValueProvider trims only U+0000–U+0020; body literals retain other whitespace. */
export function sequentialScopeBodyMappingsAdmitted(mappings: unknown, handlers: ReadonlySet<string> = new Set()): mappings is readonly VariableMapping[] {
  if (!Array.isArray(mappings)) return false;
  return mappings.every((mapping, index) => {
    if (!recordWithKeys(mapping, ["target", "expression"]) || !isSerialBusinessIdentifier(mapping.target) || handlers.has(mapping.target) ||
        (index > 0 && compareCanonicalStrings(mappings[index - 1].target, mapping.target) >= 0)) return false;
    const expression = mapping.expression;
    if (!isRecord(expression)) return false;
    switch (expression.kind) {
      case MappingExpressionKind.StringLiteral:
        return recordWithKeys(expression, ["kind", "value"]) && isWellFormedWireString(expression.value) && expression.value.length > 0 &&
          !/^[\u0000-\u0020]|[\u0000-\u0020]$/u.test(expression.value) && !/[#$]\{/u.test(expression.value);
      case MappingExpressionKind.EnclosingVariable:
        return recordWithKeys(expression, ["kind", "name"]) && isSerialBusinessIdentifier(expression.name) && !handlers.has(expression.name);
      default: return false;
    }
  });
}

function recordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** SMIS-DATA-01 separates pre-entry initialization from local/item/Process resolution inside the body. */
export function analyzeSequentialScopeData(program: Pick<SemanticProcessProgram, "operations" | "operationScopes">): SequentialScopeDataAnalysis | undefined {
  return analyzeRepeatedScopeData(program, Op.EnterSequentialMultiInstanceScope);
}

/** PMIS-DATA-01 uses the same pre-entry mapping domain; concurrent execution remains separately qualified. */
export function analyzeParallelScopeData(program: Pick<SemanticProcessProgram, "operations" | "operationScopes">): SequentialScopeDataAnalysis | undefined {
  return analyzeRepeatedScopeData(program, Op.EnterParallelMultiInstanceScope);
}

function analyzeRepeatedScopeData(program: Pick<SemanticProcessProgram, "operations" | "operationScopes">,
  entryKind: Op.EnterSequentialMultiInstanceScope | Op.EnterParallelMultiInstanceScope): SequentialScopeDataAnalysis | undefined {
  const entries = program.operations.filter(operation =>
    (operation.kind === Op.EnterSequentialMultiInstanceScope || operation.kind === Op.EnterParallelMultiInstanceScope)).filter(operation => operation.kind === entryKind);
  const entry = entries[0];
  if (entries.length !== 1 || entry === undefined) return undefined;
  const effects = program.operations.filter(operation => operation.kind === Op.AwaitEffect);
  const handlerNames = new Set(effects.map(operation => operation.effect.descriptor.operation));
  const protectedNames = [entry.collectionName, entry.itemName, ...(entry.completionBooleanName === null ? [] : [entry.completionBooleanName])];
  if (new Set(protectedNames).size !== protectedNames.length ||
      !protectedNames.every(name => isSerialBusinessIdentifier(name) && !handlerNames.has(name)) ||
      !sequentialScopeBodyMappingsAdmitted(entry.bodyInputs, handlerNames) ||
      entry.bodyInputs.some(mapping => protectedNames.includes(mapping.target))) return undefined;
  const required = new Set<string>();
  const { collectionName, completionBooleanName, itemName } = entry;
  const locals = new Set(entry.bodyInputs.map(mapping => mapping.target));
  function collect(mappings: readonly VariableMapping[], body: boolean): boolean {
    for (const { expression } of mappings) {
      if (expression.kind !== MappingExpressionKind.EnclosingVariable) continue;
      const name = expression.name;
      if (name === collectionName || name === completionBooleanName) return false;
      if (!body || (!locals.has(name) && name !== itemName)) required.add(name);
    }
    return true;
  }
  if (!collect(entry.bodyInputs, false)) return undefined;
  for (const operation of effects) {
    const owners = program.operationScopes.filter(owner => owner.operationId === operation.id);
    if (owners.length !== 1 || !serialBusinessEffectAdmitted(operation.effect, handlerNames) ||
        operation.effect.outputMappings.some(mapping => protectedNames.includes(mapping.target)) ||
        !collect(operation.effect.inputMappings, owners[0]!.scopeId === entry.childScopeId)) return undefined;
  }
  return { collectionName: entry.collectionName, itemName: entry.itemName, completionBooleanName: entry.completionBooleanName,
    handlerNames, requiredProcessScalars: [...required].sort(compareCanonicalStrings) };
}

/** SMIS-ADMIT-01 requires scalar availability at Start even when an empty batch would skip initialization. */
export function sequentialScopeStartDataAdmitted(analysis: SequentialScopeDataAnalysis, bindings: readonly VariableBinding[]): boolean {
  if (!bindings.every(({ name, value }, index) => isSerialBusinessIdentifier(name) && !analysis.handlerNames.has(name) &&
      (index === 0 || compareCanonicalStrings(bindings[index - 1]!.name, name) < 0) &&
      (name === analysis.collectionName ? value.kind === VariableValueKind.StringList &&
        sequentialMultiInstanceCollectionWithinLimits({ limits: sequentialMultiInstanceLimits }, value.value)
        : name === analysis.completionBooleanName ? value.kind === VariableValueKind.Boolean
        : value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null))) return false;
  const names = new Set(bindings.map(binding => binding.name));
  return names.has(analysis.collectionName) && (analysis.completionBooleanName === null || names.has(analysis.completionBooleanName)) &&
    analysis.requiredProcessScalars.every(name => names.has(name));
}

/** SMIS-ADMIT-01 protects Process names for every human command, including parent tasks outside the repeated body. */
export function sequentialScopeStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (program.identity.semanticProfile !== SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID) return true;
  const analysis = analyzeSequentialScopeData(program);
  if (analysis === undefined) return false;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return stimulus.instanceId.length > 0 && sequentialScopeStartDataAdmitted(analysis, stimulus.initialVariables);
    case StimulusKind.CompleteUserTaskInstance:
      return stimulus.submittedValues.every(({ name, value }, index) =>
        isSerialBusinessIdentifier(name) && !analysis.handlerNames.has(name) &&
        name !== analysis.collectionName && name !== analysis.itemName &&
        (index === 0 || compareCanonicalStrings(stimulus.submittedValues[index - 1]!.name, name) < 0) &&
        (name === analysis.completionBooleanName ? value.kind === VariableValueKind.Boolean
          : value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null));
    case StimulusKind.CompleteEffect:
      return stimulus.result.kind === EffectExecutionResultKind.Success && serialBusinessBindingsAdmitted(stimulus.result.localPatch, analysis.handlerNames);
    default: return false;
  }
}
