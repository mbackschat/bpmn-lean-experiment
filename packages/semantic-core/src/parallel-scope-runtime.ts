import { ActivityBodyKind, activityBodyScopeClaims, compareActivityOccurrences, sameActivityOccurrence } from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ParallelScopeRetirementKind, retireParallelScopeIteration, validParallelScopePopulation } from "./parallel-scope-population.js";
import type { ParallelScopeController, ParallelScopeIteration } from "./parallel-scope-population.js";
import { initializeScopeVariables, removeScopeVariables, selectScopeVariables } from "./scope-variable-data.js";
import { removeScopeOccurrenceSubtree } from "./semantic-process-scope-cancellation.js";
import { isScopeOccurrenceQuiescent } from "./semantic-process-scope-runtime.js";
import { addToken, compareScopeOccurrenceIds, ControlStateKind, nextActivation, ownedTokenMultiplicity,
  removeToken, sameScopeOccurrence, setActivationCount } from "./semantic-process-state.js";
import type { RuntimeScopeOccurrence, RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { sequentialMultiInstanceCollectionWithinLimits } from "./sequential-multi-instance-command-data-admission.js";
import { sequentialMultiInstanceLimits } from "./sequential-multi-instance-contract.js";

/** Immutable paired-entry facts from PMIS-ENTER-01; no membership is duplicated here. */
export type ParallelScopeEntry = Readonly<{
  id: string; elementId: string; input: string; childEntry: string; childScopeId: string; normalOutput: string;
  collectionName: string; itemName: string; completionBooleanName: string | null;
  bodyInputs: readonly VariableMapping[];
}>;

/** PMIS-SELECT-01 preserves the selected operation and complete occurrence through paired IL binding. */
export function applyParallelScopeOperation(program: Pick<SemanticProcessProgram, "operations" | "operationScopes">,
  operationId: string, state: RuntimeState, owner: ScopeOccurrenceId): RuntimeState | null {
  const selected = program.operations.filter(operation => operation.id === operationId);
  const operation = selected[0];
  if (selected.length !== 1 || operation === undefined) return null;
  let entryId: string;
  switch (operation.kind) {
    case SemanticOperationKind.EnterParallelMultiInstanceScope: entryId = operation.id; break;
    case SemanticOperationKind.CompleteParallelMultiInstanceScope: entryId = operation.entryOperationId; break;
    default: return null;
  }
  const entries = program.operations.filter(candidate => candidate.id === entryId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterParallelMultiInstanceScope) return null;
  const completions = program.operations.filter(candidate => candidate.kind === SemanticOperationKind.CompleteParallelMultiInstanceScope &&
    candidate.entryOperationId === entry.id);
  const completion = completions[0];
  if (completions.length !== 1 || completion === undefined || completion.origin.elementId !== entry.origin.elementId) return null;
  const entryOwners = program.operationScopes.filter(candidate => candidate.operationId === entry.id);
  const completionOwners = program.operationScopes.filter(candidate => candidate.operationId === completion.id);
  const parentScopeId = entryOwners[0]?.scopeId;
  if (entryOwners.length !== 1 || parentScopeId === undefined || completionOwners.length !== 1 ||
      completionOwners[0]?.scopeId !== entry.childScopeId) return null;
  const descriptor: ParallelScopeEntry = { id: entry.id, elementId: entry.origin.elementId,
    input: entry.input, childEntry: entry.childEntry, childScopeId: entry.childScopeId, normalOutput: entry.normalOutput,
    collectionName: entry.collectionName, itemName: entry.itemName, bodyInputs: entry.bodyInputs,
    completionBooleanName: entry.completionBooleanName };
  switch (operation.kind) {
    case SemanticOperationKind.EnterParallelMultiInstanceScope:
      return owner.definitionScopeId === parentScopeId ? enterParallelScope(descriptor, state, owner) : null;
    case SemanticOperationKind.CompleteParallelMultiInstanceScope: {
      const bodies = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner));
      return operation.id === completion.id && owner.definitionScopeId === entry.childScopeId && bodies.length === 1 &&
        bodies[0]?.parent?.definitionScopeId === parentScopeId ? completeParallelScope(descriptor, state, owner) : null;
    }
  }
}

/** PMIS-ENTER-01 issues the entire population against one pre-entry Process snapshot, or nothing. */
export function enterParallelScope(entry: ParallelScopeEntry, state: RuntimeState,
  parent: ScopeOccurrenceId): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running || state.control.instanceId !== parent.processInstanceId ||
      ownedTokenMultiplicity(state.controlTokens, entry.input, parent) !== 1 ||
      state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, parent)).length !== 1 ||
      state.scopeOccurrences.some(({ id }) => id.definitionScopeId === entry.childScopeId) ||
      state.activityOccurrences.some(({ id }) => id.activityElementId === entry.elementId)) return null;
  const collections = state.variables.process.bindings.filter(({ name }) => name === entry.collectionName);
  const collection = collections[0]?.value;
  if (collections.length !== 1 || collection?.kind !== VariableValueKind.StringList ||
      !sequentialMultiInstanceCollectionWithinLimits({ limits: sequentialMultiInstanceLimits }, collection.value)) return null;
  const consumed = removeToken(state.controlTokens, entry.input, parent);
  if (collection.value.length === 0) return { ...state, controlTokens: addToken(consumed, entry.normalOutput, parent) };
  const activation = nextActivation(state.activityActivations, entry.elementId);
  if (!Number.isSafeInteger(activation) || activation < 1) return null;
  const iterations: ParallelScopeIteration[] = [];
  let successor: RuntimeState = { ...state, controlTokens: consumed };
  for (const [loopCounter, item] of collection.value.entries()) {
    const scope = { processInstanceId: parent.processInstanceId, definitionScopeId: entry.childScopeId,
      activation: nextActivation(successor.scopeActivations, entry.childScopeId) };
    if (!Number.isSafeInteger(scope.activation) || scope.activation < 1) return null;
    const variables = initializeScopeVariables(successor.variables, scope, entry.bodyInputs);
    if (variables === null) return null;
    iterations.push({ scope, loopCounter, item });
    successor = { ...successor, variables,
      scopeOccurrences: [...successor.scopeOccurrences, { id: scope, parent }]
        .sort(({ id: left }, { id: right }) => compareScopeOccurrenceIds(left, right)),
      scopeActivations: setActivationCount(successor.scopeActivations, entry.childScopeId, scope.activation),
      controlTokens: addToken(successor.controlTokens, entry.childEntry, scope) };
  }
  const first = iterations[0];
  if (first === undefined) return null;
  const activity: ActivityOccurrence = {
    id: { processInstanceId: parent.processInstanceId, activityElementId: entry.elementId, activation },
    operationId: entry.id, owner: parent, attachedHandlers: [],
    body: { kind: ActivityBodyKind.ParallelChildScopes, iterations: [first, ...iterations.slice(1)] },
  };
  return { ...successor,
    activityOccurrences: [...successor.activityOccurrences, activity].sort(compareActivityOccurrences),
    activityActivations: setActivationCount(successor.activityActivations, entry.elementId, activation),
    parallelScopeControllers: [...(successor.parallelScopeControllers ?? []),
      { id: activity.id, total: iterations.length, completed: 0 }],
  };
}

export type ParallelScopeBinding = Readonly<{
  activity: ActivityOccurrence;
  controller: ParallelScopeController;
  iterations: readonly [ParallelScopeIteration, ...ParallelScopeIteration[]];
  bodies: readonly RuntimeScopeOccurrence[];
  body: RuntimeScopeOccurrence;
}>;

/** PMIS-DATA-01 and PMIS-END-01 require the same complete live population before reading or retiring a body. */
export function parallelScopeBinding(entry: ParallelScopeEntry, state: RuntimeState,
  target: ScopeOccurrenceId): ParallelScopeBinding | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const claims = state.activityOccurrences.filter(activity =>
    activityBodyScopeClaims(activity.body).some(scope => sameScopeOccurrence(scope, target)));
  const activity = claims[0];
  if (claims.length !== 1 || activity?.body.kind !== ActivityBodyKind.ParallelChildScopes ||
      activity.operationId !== entry.id || activity.id.activityElementId !== entry.elementId ||
      activity.id.processInstanceId !== state.control.instanceId ||
      activity.owner.processInstanceId !== activity.id.processInstanceId || activity.attachedHandlers.length !== 0 ||
      state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, activity.owner)).length !== 1) return null;
  const controllers = (state.parallelScopeControllers ?? []).filter(({ id }) => sameActivityOccurrence(id, activity.id));
  const controller = controllers[0];
  const iterations = activity.body.iterations;
  if (controllers.length !== 1 || controller === undefined || controller.total > 16 ||
      !validParallelScopePopulation(controller, iterations)) return null;
  const bodies: RuntimeScopeOccurrence[] = [];
  for (const { scope } of iterations) {
    const matches = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, scope));
    const body = matches[0];
    if (scope.definitionScopeId !== entry.childScopeId || matches.length !== 1 || body === undefined ||
        body.parent === null || !sameScopeOccurrence(body.parent, activity.owner) ||
        selectScopeVariables(state.variables, scope) === undefined ||
        state.activityOccurrences.filter(candidate => activityBodyScopeClaims(candidate.body)
          .some(claim => sameScopeOccurrence(claim, scope))).length !== 1) return null;
    bodies.push(body);
  }
  const body = bodies.find(({ id }) => sameScopeOccurrence(id, target));
  return body === undefined ? null : { activity, controller, iterations, bodies, body };
}

/** PMIS-END-01/PMIS-CANCEL-01 retire one exact quiescent body before testing the Process condition. */
export function completeParallelScope(entry: ParallelScopeEntry, state: RuntimeState,
  target: ScopeOccurrenceId): RuntimeState | null {
  const binding = parallelScopeBinding(entry, state, target);
  if (binding === null) return null;
  const { activity, controller, iterations, bodies, body } = binding;
  if (!isScopeOccurrenceQuiescent(state, body) ||
      state.activityOccurrences.some(({ owner }) => sameScopeOccurrence(owner, target))) return null;
  const variables = removeScopeVariables(state.variables, target);
  if (variables === null) return null;
  let condition = false;
  if (entry.completionBooleanName !== null) {
    const bindings = variables.process.bindings.filter(({ name }) => name === entry.completionBooleanName);
    const value = bindings[0]?.value;
    if (bindings.length !== 1 || value?.kind !== VariableValueKind.Boolean) return null;
    condition = value.value;
  }
  const result = retireParallelScopeIteration(controller, iterations, target, condition);
  if (result === null) return null;
  // PMIS-END-01 rewrites the shared owner first; generic child withdrawal must see only surviving claims.
  const detached: RuntimeState = { ...state, variables,
    activityOccurrences: state.activityOccurrences.filter(candidate => candidate !== activity),
    parallelScopeControllers: (state.parallelScopeControllers ?? []).filter(candidate => candidate !== controller) };
  let retired = removeScopeOccurrenceSubtree(detached, body);
  switch (result.kind) {
    case ParallelScopeRetirementKind.Remaining:
      return removeScopeOccurrenceSubtree({ ...state, variables,
        activityOccurrences: state.activityOccurrences.map(candidate => candidate === activity
          ? { ...candidate, body: { kind: ActivityBodyKind.ParallelChildScopes, iterations: result.iterations } } : candidate),
        parallelScopeControllers: (state.parallelScopeControllers ?? []).map(candidate =>
          candidate === controller ? result.controller : candidate) }, body);
    case ParallelScopeRetirementKind.EarlyCompletion:
      for (const cancelled of result.cancelled) {
        const sibling = bodies.find(({ id }) => sameScopeOccurrence(id, cancelled.scope));
        if (sibling === undefined) return null;
        retired = removeScopeOccurrenceSubtree(retired, sibling);
      }
      return { ...retired, controlTokens: addToken(retired.controlTokens, entry.normalOutput, activity.owner) };
    case ParallelScopeRetirementKind.NaturalCompletion:
      return { ...retired, controlTokens: addToken(retired.controlTokens, entry.normalOutput, activity.owner) };
  }
}
