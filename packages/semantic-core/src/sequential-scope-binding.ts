import { ActivityBodyKind, sameActivityOccurrence } from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { selectScopeVariables } from "./scope-variable-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { EnterSequentialMultiInstanceScopeOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, RuntimeScopeOccurrence, ScopeOccurrenceId, ScopeVariableScope } from "./semantic-process-state.js";
import { sequentialMultiInstanceLimits } from "./sequential-multi-instance-contract.js";
import type { SequentialScopeController } from "./sequential-scope-controller.js";

export type SequentialScopeBinding = Readonly<{
  entry: EnterSequentialMultiInstanceScopeOperation;
  activity: ActivityOccurrence;
  controller: SequentialScopeController;
  body: RuntimeScopeOccurrence;
  locals: ScopeVariableScope;
}>;

/** SMIS-IDENTITY-01 binds the complete current child, outer Activity and controller before any data or lifecycle change. */
export function sequentialScopeBindingForEntry(entry: EnterSequentialMultiInstanceScopeOperation,
  state: RuntimeState): SequentialScopeBinding | undefined {
  if (state.control.kind !== ControlStateKind.Running) return undefined;
  const activities = state.activityOccurrences.filter(activity => activity.operationId === entry.id);
  const activity = activities[0];
  if (activities.length !== 1 || activity === undefined || activity.body.kind !== ActivityBodyKind.ChildScope ||
      activity.id.processInstanceId !== state.control.instanceId || activity.id.activityElementId !== entry.origin.elementId ||
      activity.owner.processInstanceId !== activity.id.processInstanceId || activity.attachedHandlers.length !== 0) return undefined;
  const child = activity.body.scope;
  if (child.definitionScopeId !== entry.childScopeId || child.processInstanceId !== activity.id.processInstanceId) return undefined;
  const bodies = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, child));
  const body = bodies[0];
  const controllers = (state.sequentialScopeControllers ?? []).filter(({ id }) => sameActivityOccurrence(id, activity.id));
  const controller = controllers[0];
  const locals = selectScopeVariables(state.variables, child);
  if (bodies.length !== 1 || body === undefined || body.parent === null || !sameScopeOccurrence(body.parent, activity.owner) ||
      !state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, activity.owner)) ||
      controllers.length !== 1 || controller === undefined || locals === undefined ||
      !Number.isSafeInteger(controller.total) || controller.total > sequentialMultiInstanceLimits.maximumItems ||
      !Number.isSafeInteger(controller.completed) || controller.completed < 0 || controller.completed >= controller.total) return undefined;
  return { entry, activity, controller, body, locals };
}

export function sequentialScopeBindingForOwner(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId): SequentialScopeBinding | undefined {
  const entries = program.operations.filter(operation => operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope &&
    operation.childScopeId === owner.definitionScopeId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterSequentialMultiInstanceScope) return undefined;
  const binding = sequentialScopeBindingForEntry(entry, state);
  return binding !== undefined && sameScopeOccurrence(binding.body.id, owner) ? binding : undefined;
}

export function hasSequentialScopeDefinition(program: Pick<SemanticProcessProgram, "operations">,
  owner: ScopeOccurrenceId): boolean {
  return program.operations.some(operation => operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope &&
    operation.childScopeId === owner.definitionScopeId);
}
