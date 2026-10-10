import { ActivityBodyKind } from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import { candidateProcessId } from "./flow-node-occurrence-candidates.js";
import { internalOccurrenceReservationStateIsValid } from "./internal-operation-occurrence.js";
import { committedStateCollectionDefects } from "./runtime-state-collection-ordering.js";
import { parallelScopeProgramStartCapacity } from "./parallel-scope-program-capacity.js";
import { parallelScopeBinding } from "./parallel-scope-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** PMIS-IDENTITY-01 binds the entire live population to its captured collection and issued wait identities. */
export function parallelScopeStateValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  if (committedStateCollectionDefects(state).length > 0 || !internalOccurrenceReservationStateIsValid(state)) return false;
  const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  if (entry?.kind !== SemanticOperationKind.EnterParallelMultiInstanceScope) return false;
  const activities = state.activityOccurrences.filter(activity => activity.operationId === entry.id ||
    activity.id.activityElementId === entry.origin.elementId || activity.body.kind === ActivityBodyKind.ParallelChildScopes);
  const bodies = state.scopeOccurrences.filter(({ id }) => id.definitionScopeId === entry.childScopeId);
  const controllers = state.parallelScopeControllers ?? [];
  if (activities.length === 0) return bodies.length === 0 && controllers.length === 0 && state.variables.scopes.length === 0;
  const activity = activities[0];
  if (activities.length !== 1 || activity?.body.kind !== ActivityBodyKind.ParallelChildScopes || controllers.length !== 1) return false;
  const first = activity.body.iterations[0];
  if (first === undefined) return false;
  const bound = parallelScopeBinding({ ...entry, elementId: entry.origin.elementId }, state, first.scope);
  const collection = state.variables.process.bindings.find(binding => binding.name === entry.collectionName)?.value;
  if (bound === null || collection?.kind !== VariableValueKind.StringList || bound.activity !== activity ||
      bound.controller.total !== collection.value.length || bodies.length !== bound.iterations.length ||
      state.variables.scopes.length !== bound.iterations.length || candidateProcessId(program, state, first.scope) === null ||
      bound.iterations.some(({ item, loopCounter }) => collection.value[loopCounter] !== item)) return false;
  return true;
}

/** PMIS-DATA-01 and PMIS-IDENTITY-01 require declared scalar locals and retained identity high-water marks at restoration. */
export function parallelScopeCheckpointValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  if (parallelScopeProgramStartCapacity(program, state.variables.process.bindings) === undefined ||
      !parallelScopeStateValid(program, state)) return false;
  const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  if (entry?.kind !== SemanticOperationKind.EnterParallelMultiInstanceScope) return false;
  return state.sequentialScopeControllers === undefined && state.sequentialMultiInstanceControllers === undefined &&
    state.parallelMultiInstanceControllers === undefined &&
    state.activityOccurrences.every(activity => activity.operationId === entry.id &&
      activity.body.kind === ActivityBodyKind.ParallelChildScopes) &&
    state.variables.scopes.every(frame => frame.owner.definitionScopeId === entry.childScopeId &&
      frame.bindings.length === entry.bodyInputs.length &&
      new Set(frame.bindings.map(value => value.name)).size === frame.bindings.length &&
      frame.bindings.every(value => entry.bodyInputs.some(input => input.target === value.name) &&
        (value.value.kind === VariableValueKind.String || value.value.kind === VariableValueKind.Null))) &&
    state.scopeOccurrences.every(({ id }) => candidateProcessId(program, state, id) !== null &&
      id.activation <= (state.scopeActivations.find(counter => counter.elementId === id.definitionScopeId)?.count ?? 0));
}
