import { sameActivityOccurrence } from "./activity-occurrence.js";
import { analyzeSequentialScopeData, sequentialScopeStartDataAdmitted } from "./sequential-scope-data-admission.js";
import { VariableValueKind } from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { EnterSequentialMultiInstanceScopeOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { sequentialScopeBindingForEntry, sequentialScopeBindingForOwner } from "./sequential-scope-binding.js";
import { sequentialMultiInstanceCollectionWithinLimits } from "./sequential-multi-instance-command-data-admission.js";
import { sequentialMultiInstanceLimits } from "./sequential-multi-instance-contract.js";
import { nestedScopeFramesValid } from "./nested-scope-data.js";

/** SMIS-IDENTITY-01 and SMIS-ENTER-01 bind both directions and retain the captured collection index. */
export function sequentialScopeStateValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  const entries = program.operations.filter((operation): operation is EnterSequentialMultiInstanceScopeOperation =>
    operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope);
  return (state.sequentialScopeControllers ?? []).every(controller => {
    const declarations = entries.filter(entry => entry.origin.elementId === controller.id.activityElementId);
    const entry = declarations[0];
    if (declarations.length !== 1 || entry === undefined) return false;
    const binding = sequentialScopeBindingForEntry(entry, state);
    return binding !== undefined && sameActivityOccurrence(binding.controller.id, controller.id);
  }) && entries.every(entry => {
    const activities = state.activityOccurrences.filter(activity => activity.operationId === entry.id);
    const bodies = state.scopeOccurrences.filter(({ id }) => id.definitionScopeId === entry.childScopeId);
    if (activities.length === 0 && bodies.length === 0) return true;
    if (activities.length !== 1 || bodies.length !== 1) return false;
    const binding = sequentialScopeBindingForEntry(entry, state);
    const collections = state.variables.process.bindings.filter(({ name }) => name === entry.collectionName);
    const collection = collections[0]?.value;
    return binding !== undefined && collections.length === 1 && collection?.kind === VariableValueKind.StringList &&
      sequentialMultiInstanceCollectionWithinLimits({ limits: sequentialMultiInstanceLimits }, collection.value) &&
      binding.controller.total === collection.value.length &&
      collection.value[binding.controller.completed] === binding.controller.currentItem;
  });
}

/** SMIS-IDENTITY-01 and SMIS-DATA-01 require reconstructible body locals and non-reused live identities at restoration. */
export function sequentialScopeCheckpointValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  const selected = program.operations.some(operation => operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope);
  if (!selected) return state.sequentialScopeControllers === undefined && nestedScopeFramesValid(program, state);
  const analysis = analyzeSequentialScopeData(program);
  if (analysis === undefined || !sequentialScopeStartDataAdmitted(analysis, state.variables.process.bindings) ||
      !sequentialScopeStateValid(program, state)) return false;
  return state.variables.scopes.every(frame => {
    const binding = sequentialScopeBindingForOwner(program, state, frame.owner);
    return binding !== undefined && binding.locals === frame &&
      frame.bindings.length === binding.entry.bodyInputs.length &&
      new Set(frame.bindings.map(value => value.name)).size === frame.bindings.length &&
      frame.bindings.every(value => binding.entry.bodyInputs.some(input => input.target === value.name) &&
        (value.value.kind === VariableValueKind.String || value.value.kind === VariableValueKind.Null));
  }) && state.scopeOccurrences.every(({ id }) => id.activation <=
    (state.scopeActivations.find(counter => counter.elementId === id.definitionScopeId)?.count ?? 0)) &&
    [...state.effectWaits, ...state.effectIncidents.map(incident => incident.wait)].every(({ id }) => id.activation <=
      (state.effectActivations.find(counter => counter.elementId === id.elementId)?.count ?? 0));
}
