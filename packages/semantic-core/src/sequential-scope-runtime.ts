import { sequentialScopeBindingForEntry } from "./sequential-scope-binding.js";
import { ActivityBodyKind, compareActivityOccurrences } from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import { initializeScopeVariables, removeScopeVariables } from "./scope-variable-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { CompleteSequentialMultiInstanceScopeOperation, EnterSequentialMultiInstanceScopeOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { enterChildScope, issueChildScope, isScopeOccurrenceQuiescent, selectChildScopeEntry } from "./semantic-process-scope-runtime.js";
import { addToken, ControlStateKind, nextActivation, ownedTokenMultiplicity, removeToken,
  sameScopeOccurrence, setActivationCount } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { sequentialMultiInstanceLimits } from "./sequential-multi-instance-contract.js";
import { sequentialMultiInstanceCollectionWithinLimits } from "./sequential-multi-instance-command-data-admission.js";

/** SMIS-ENTER-01 consumes the parent once and issues no identities for an empty collection. */
export function enterSequentialScope(operation: EnterSequentialMultiInstanceScopeOperation,
  state: RuntimeState, parent: ScopeOccurrenceId): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running ||
      state.control.instanceId !== parent.processInstanceId ||
      ownedTokenMultiplicity(state.controlTokens, operation.input, parent) !== 1 ||
      !state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, parent)) ||
      state.activityOccurrences.some(({ operationId }) => operationId === operation.id)) return null;
  const bindings = state.variables.process.bindings.filter(({ name }) => name === operation.collectionName);
  const collection = bindings[0]?.value;
  if (bindings.length !== 1 || collection?.kind !== VariableValueKind.StringList) return null;
  const items = collection.value;
  if (!sequentialMultiInstanceCollectionWithinLimits({ limits: sequentialMultiInstanceLimits }, items)) return null;
  const currentItem = items[0];
  if (currentItem === undefined) return { ...state,
    controlTokens: addToken(removeToken(state.controlTokens, operation.input, parent), operation.normalOutput, parent) };
  const selected = selectChildScopeEntry(state, parent, operation);
  if (selected === null) return null;
  const variables = initializeScopeVariables(state.variables, selected.child, operation.bodyInputs);
  if (variables === null) return null;
  const entered = enterChildScope(state, parent, operation);
  if (entered === null) return null;
  const record: ActivityOccurrence = {
    id: { processInstanceId: parent.processInstanceId, activityElementId: operation.origin.elementId,
      activation: nextActivation(state.activityActivations, operation.origin.elementId) },
    owner: parent, operationId: operation.id,
    body: { kind: ActivityBodyKind.ChildScope, scope: selected.child }, attachedHandlers: [],
  };
  return { ...entered, variables,
    activityOccurrences: [...state.activityOccurrences, record].sort(compareActivityOccurrences),
    activityActivations: setActivationCount(state.activityActivations, record.id.activityElementId, record.id.activation),
    sequentialScopeControllers: [...(state.sequentialScopeControllers ?? []),
      { id: record.id, total: items.length, completed: 0, currentItem }],
  };
}

export function completeSequentialScope(program: Pick<SemanticProcessProgram, "operations">,
  operation: CompleteSequentialMultiInstanceScopeOperation, state: RuntimeState): RuntimeState | null {
  return completeSequentialScopeStep(program, operation, state)?.successor ?? null;
}

export type CompletedSequentialScope = Readonly<{ owner: ScopeOccurrenceId; successor: RuntimeState }>;

/** SMIS-END-01 retains the completed child owner even when turnover replaces or removes it. */
export function completeSequentialScopeStep(program: Pick<SemanticProcessProgram, "operations">,
  operation: CompleteSequentialMultiInstanceScopeOperation, state: RuntimeState): CompletedSequentialScope | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const entries = program.operations.filter(candidate => candidate.id === operation.entryOperationId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterSequentialMultiInstanceScope ||
      entry.origin.elementId !== operation.origin.elementId) return null;
  const binding = sequentialScopeBindingForEntry(entry, state);
  if (binding === undefined) return null;
  const { activity: record, controller, body: occurrence } = binding;
  const child = occurrence.id;
  if (!isScopeOccurrenceQuiescent(state, occurrence) ||
      state.activityOccurrences.some(({ owner }) => sameScopeOccurrence(owner, child))) return null;
  let condition = false;
  if (entry.completionBooleanName !== null) {
    const conditions = state.variables.process.bindings.filter(({ name }) => name === entry.completionBooleanName);
    const value = conditions[0]?.value;
    if (conditions.length !== 1 || value?.kind !== VariableValueKind.Boolean) return null;
    condition = value.value;
  }
  const variables = removeScopeVariables(state.variables, child);
  if (variables === null) return null;
  const retired: RuntimeState = { ...state, variables,
    scopeOccurrences: state.scopeOccurrences.filter(candidate => candidate !== occurrence) };
  const completed = controller.completed + 1;
  if (completed === controller.total || condition) return { owner: child, successor: { ...retired,
    controlTokens: addToken(retired.controlTokens, entry.normalOutput, record.owner),
    activityOccurrences: retired.activityOccurrences.filter(candidate => candidate !== record),
    sequentialScopeControllers: (retired.sequentialScopeControllers ?? []).filter(candidate => candidate !== controller),
  } };
  const collections = state.variables.process.bindings.filter(({ name }) => name === entry.collectionName);
  const collection = collections[0]?.value;
  if (collections.length !== 1 || collection?.kind !== VariableValueKind.StringList) return null;
  const currentItem = collection.value[completed];
  if (currentItem === undefined) return null;
  const selected = selectChildScopeEntry(retired, record.owner, entry);
  if (selected === null) return null;
  const initialized = initializeScopeVariables(retired.variables, selected.child, entry.bodyInputs);
  if (initialized === null) return null;
  const issued = issueChildScope(retired, record.owner, entry);
  if (issued === null) return null;
  return { owner: child, successor: { ...issued, variables: initialized,
    activityOccurrences: issued.activityOccurrences.map(candidate => candidate === record
      ? { ...record, body: { kind: ActivityBodyKind.ChildScope, scope: selected.child } } : candidate),
    sequentialScopeControllers: (issued.sequentialScopeControllers ?? []).map(candidate => candidate === controller
      ? { ...controller, completed, currentItem } : candidate),
  } };
}
