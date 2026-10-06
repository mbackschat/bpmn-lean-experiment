import { EffectExecutionResultKind, VariableValueKind } from "./contract.js";
import type { EffectExecutionResult, OccurrenceId, VariableBinding } from "./contract.js";
import { MultiInstanceScopeWriteKind, writeBoundMultiInstanceScopeValues } from "./multi-instance-scope-write.js";
import { parallelScopeBinding } from "./parallel-scope-runtime.js";
import { selectScopeVariables } from "./scope-variable-data.js";
import { evaluateInputMappings, projectActivityVariableScopeResult } from "./semantic-process-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { addToken, sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopedVariables, ScopeOccurrenceId } from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";

export function hasParallelScopeDefinition(program: Pick<SemanticProcessProgram, "operations">,
  owner: ScopeOccurrenceId): boolean {
  return program.operations.some(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope &&
    operation.childScopeId === owner.definitionScopeId);
}

/** PMIS-DATA-01 resolves local presence, then the captured item, then Process data in one immutable context. */
function parallelScopeDataBinding(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId) {
  const entries = program.operations.filter(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope &&
    operation.childScopeId === owner.definitionScopeId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterParallelMultiInstanceScope) return null;
  const binding = parallelScopeBinding({ ...entry, elementId: entry.origin.elementId }, state, owner);
  if (binding === null) return null;
  const iteration = binding.iterations.find(candidate => sameScopeOccurrence(candidate.scope, owner));
  const locals = selectScopeVariables(state.variables, owner);
  if (iteration === undefined || locals === undefined) return null;
  return { entry, iteration, locals };
}

/** PMIS-DATA-01 reads one immutable body context; mapping targets cannot supply later mapping inputs. */
export function evaluateParallelScopeInputs(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId, mappings: readonly VariableMapping[]): readonly VariableBinding[] | null {
  const binding = parallelScopeDataBinding(program, state, owner);
  if (binding === null) return null;
  const { entry, iteration, locals } = binding;
  const handlers = new Set(program.operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect
    ? [operation.effect.descriptor.operation] : []));
  if (mappings.some(({ expression }) => expression.kind === MappingExpressionKind.LocalVariable ||
      (expression.kind === MappingExpressionKind.EnclosingVariable && handlers.has(expression.name)))) return null;
  const localNames = new Set(locals.bindings.map(({ name }) => name));
  const context: readonly VariableBinding[] = [
    ...locals.bindings,
    ...(localNames.has(entry.itemName) ? [] : [{ name: entry.itemName,
      value: { kind: VariableValueKind.String, value: iteration.item } } as const]),
    ...state.variables.process.bindings.filter(({ name }) => !localNames.has(name) && name !== entry.itemName),
  ];
  return evaluateInputMappings(mappings, context);
}

export function writeParallelScopeValues(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId, values: readonly VariableBinding[],
  kind: MultiInstanceScopeWriteKind): ScopedVariables | null {
  const binding = parallelScopeDataBinding(program, state, owner);
  return binding === null ? null : writeBoundMultiInstanceScopeValues(program, state, owner, binding.entry, values, kind);
}

/** PMIS-DATA-01 commits mapped success, exact effect-frame disposal and body continuation atomically. */
export function completeParallelScopeEffect(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, effectId: OccurrenceId, result: EffectExecutionResult): RuntimeState | null {
  const matches = state.effectWaits.filter(wait => sameOccurrence(wait.id, effectId));
  const wait = matches[0];
  if (matches.length !== 1 || wait === undefined || wait.id.processInstanceId !== wait.owner.processInstanceId ||
      wait.bpmnErrorRoute !== null || result.kind !== EffectExecutionResultKind.Success) return null;
  const projected = projectActivityVariableScopeResult(state.variables, wait.id, wait.outputMappings, result.localPatch, true);
  if (projected === null) return null;
  const variables = writeParallelScopeValues(program, { ...state, variables: projected.variables }, wait.owner,
    projected.outputs, MultiInstanceScopeWriteKind.ServiceTask);
  return variables === null ? null : { ...state, variables,
    effectWaits: state.effectWaits.filter(candidate => candidate !== wait),
    controlTokens: addToken(state.controlTokens, wait.output, wait.owner) };
}
