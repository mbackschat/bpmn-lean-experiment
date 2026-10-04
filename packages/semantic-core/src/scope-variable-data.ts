import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { evaluateInputMappings, mergeProcessVariableBindings } from "./semantic-process-data.js";
import { compareScopeOccurrenceIds, sameScopeOccurrence } from "./semantic-process-state.js";
import type { ScopedVariables, ScopeOccurrenceId, ScopeVariableScope } from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";

/** SMIS-DATA-01 selects complete ownership before binding availability, so duplicates cannot hide behind missing data. */
export function selectScopeVariables(variables: ScopedVariables, owner: ScopeOccurrenceId): ScopeVariableScope | undefined {
  const matching = variables.scopes.filter(scope => sameScopeOccurrence(scope.owner, owner));
  return matching.length === 1 ? matching[0] : undefined;
}

/** Body inputs read the same pre-entry Process context; newly declared locals cannot supply later inputs (SMIS-DATA-01). */
export function initializeScopeVariables(variables: ScopedVariables, owner: ScopeOccurrenceId,
  mappings: readonly VariableMapping[]): ScopedVariables | null {
  if (variables.scopes.some(scope => sameScopeOccurrence(scope.owner, owner)) ||
      mappings.some(mapping => mapping.expression.kind === MappingExpressionKind.LocalVariable)) return null;
  const bindings = evaluateInputMappings(mappings, variables.process.bindings);
  if (bindings === null) return null;
  const insertion = variables.scopes.findIndex(scope => compareScopeOccurrenceIds(owner, scope.owner) < 0);
  const index = insertion < 0 ? variables.scopes.length : insertion;
  return { ...variables, scopes: [...variables.scopes.slice(0, index),
    { owner: { ...owner }, bindings }, ...variables.scopes.slice(index)] };
}

/** A present local null shadows Process data; an ambiguous declaration refuses lookup (SMIS-DATA-01). */
export function readScopeVariable(variables: ScopedVariables, owner: ScopeOccurrenceId,
  name: string): VariableBinding | undefined {
  const scope = selectScopeVariables(variables, owner);
  if (scope === undefined) return undefined;
  const local = scope.bindings.filter(binding => binding.name === name);
  const candidates = local.length === 0 ? variables.process.bindings.filter(binding => binding.name === name) : local;
  const binding = candidates[0];
  return candidates.length === 1 && binding !== undefined && scalar(binding) ? binding : undefined;
}

/** Declared body names remain local; absent names update or create Process bindings (SMIS-DATA-01). */
export function writeScopeVariables(variables: ScopedVariables, owner: ScopeOccurrenceId,
  patch: readonly VariableBinding[]): ScopedVariables | null {
  const scope = selectScopeVariables(variables, owner);
  if (scope === undefined || !uniqueNames(scope.bindings) || !uniqueNames(patch) || !patch.every(scalar)) return null;
  const names = new Set(scope.bindings.map(binding => binding.name));
  const locals = patch.filter(binding => names.has(binding.name));
  const enclosing = patch.filter(binding => !names.has(binding.name));
  return { ...variables,
    process: { bindings: mergeProcessVariableBindings(variables.process.bindings, enclosing) },
    scopes: variables.scopes.map(candidate => candidate === scope
      ? { ...scope, bindings: mergeProcessVariableBindings(scope.bindings, locals) } : candidate) };
}

export function removeScopeVariables(variables: ScopedVariables, owner: ScopeOccurrenceId): ScopedVariables | null {
  const selected = selectScopeVariables(variables, owner);
  return selected === undefined ? null : { ...variables, scopes: variables.scopes.filter(scope => scope !== selected) };
}

function uniqueNames(bindings: readonly VariableBinding[]): boolean {
  return new Set(bindings.map(binding => binding.name)).size === bindings.length;
}

function scalar(binding: VariableBinding): boolean {
  switch (binding.value.kind) {
    case VariableValueKind.String:
    case VariableValueKind.Null: return true;
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.StringList: return false;
  }
}
