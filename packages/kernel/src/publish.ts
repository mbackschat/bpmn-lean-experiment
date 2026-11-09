/**
 * Publish, transcribed from `Kernel/Publish.lean`: what the public state observation of the canonical result reads from
 * runtime state besides `host.ts`'s view, the status name, the instance root's variables and every other variable scope
 * with its variables, each in name order, so that variables keep their scope. The open waits and the failure come from
 * `hostView`, which `run.ts` renders. Every sort is Lean's stable `List.mergeSort` with Lean's `String` order.
 */
import { assertNever, compareStrings, mergeSort, programPublicId, type ElementId, type Program } from "./il/types.js";
import {
  ActivationRole,
  InstanceStatus,
  instanceOf,
  occurrenceOf,
  root,
  type Binding,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "./state.js";

export function statusName(status: InstanceStatus): string {
  switch (status) {
    case InstanceStatus.Running:
      return "running";
    case InstanceStatus.Completed:
      return "completed";
    case InstanceStatus.Cancelled:
      return "cancelled";
    case InstanceStatus.Failed:
      return "failed";
  }
  return assertNever(status);
}

function byName(entries: readonly Binding[]): readonly Binding[] {
  return mergeSort(entries, (left, right) => compareStrings(left[0], right[0]) <= 0);
}

/** The instance root's variables, ordered by name. */
export function variables(state: State): readonly Binding[] {
  return byName(state.variables.find((vars) => vars.scope === root)?.entries ?? []);
}

/**
 * What a published variable scope is. A scope is named by the occurrence it belongs to: `activity` is an Activity
 * occurrence's own scope (a Sub-Process's, or an Activity's local variables), `multiInstanceBody` a Multi-Instance
 * body's; a `multiInstanceInstance` and a `compensationContext` (the restored context a compensation handler runs in)
 * have no occurrence of their own and are named by the one they host. A called instance's root is a `processInstance`.
 */
export enum ScopeRole {
  ProcessInstance = "processInstance",
  Activity = "activity",
  MultiInstanceBody = "multiInstanceBody",
  MultiInstanceInstance = "multiInstanceInstance",
  CompensationContext = "compensationContext",
}

export function scopeRoleName(role: ScopeRole): string {
  switch (role) {
    case ScopeRole.ProcessInstance:
      return "processInstance";
    case ScopeRole.Activity:
      return "activity";
    case ScopeRole.MultiInstanceBody:
      return "multiInstanceBody";
    case ScopeRole.MultiInstanceInstance:
      return "multiInstanceInstance";
    case ScopeRole.CompensationContext:
      return "compensationContext";
  }
  return assertNever(role);
}

function scopeRoleRank(role: ScopeRole): number {
  switch (role) {
    case ScopeRole.ProcessInstance:
      return 0;
    case ScopeRole.Activity:
      return 1;
    case ScopeRole.MultiInstanceBody:
      return 2;
    case ScopeRole.MultiInstanceInstance:
      return 3;
    case ScopeRole.CompensationContext:
      return 4;
  }
  return assertNever(role);
}

/** A variable scope other than the instance root, by its process instance, the element and activation of the
 * occurrence that names it (none for a `processInstance`) and its role, with its variables in name order. */
export interface PublishedScope {
  readonly processInstanceId: string;
  readonly element: ElementId | null;
  readonly activation: number;
  readonly role: ScopeRole;
  readonly variables: readonly Binding[];
}

/** Canonical order: process instance, element (none first), activation, role. */
function publishedScopeLe(left: PublishedScope, right: PublishedScope): boolean {
  const name = (scope: PublishedScope): string => scope.element ?? "";
  if (left.processInstanceId !== right.processInstanceId) return compareStrings(left.processInstanceId, right.processInstanceId) < 0;
  if (name(left) !== name(right)) return compareStrings(name(left), name(right)) < 0;
  if (left.activation !== right.activation) return left.activation < right.activation;
  return scopeRoleRank(left.role) <= scopeRoleRank(right.role);
}

function ownedByBody(state: State, scope: ScopeOccurrenceId): boolean {
  const owner = state.scopes.find((candidate) => candidate.id === scope)?.occurrence ?? null;
  return owner !== null && occurrenceOf(state, owner)?.role === ActivationRole.MultiInstanceBody;
}

/** `scope` as published, `null` for the instance root, which `variables` publishes. */
function publishedScope(state: State, scope: ScopeOccurrence, entries: readonly Binding[]): PublishedScope | null {
  const processInstanceId = instanceOf(state, scope.id);
  if (scope.calledInstance !== null) {
    return { processInstanceId, element: null, activation: 0, role: ScopeRole.ProcessInstance, variables: entries };
  }
  const element = scope.element;
  if (element === null) return null;
  if (scope.occurrence !== null) {
    const owner = occurrenceOf(state, scope.occurrence);
    return {
      processInstanceId,
      element: owner?.element ?? element,
      activation: owner?.activation ?? 0,
      role: owner?.role === ActivationRole.MultiInstanceBody ? ScopeRole.MultiInstanceBody : ScopeRole.Activity,
      variables: entries,
    };
  }
  const hosted = state.occurrences.find((occurrence) => occurrence.scope === scope.id && occurrence.element === element);
  const role = scope.parent !== null && ownedByBody(state, scope.parent) ? ScopeRole.MultiInstanceInstance : ScopeRole.CompensationContext;
  return { processInstanceId, element, activation: hosted?.activation ?? 0, role, variables: entries };
}

/** Every variable scope other than the instance root that holds a variable, by public element identifiers, in
 * canonical order. */
export function scopes(program: Program, state: State): readonly PublishedScope[] {
  const published = state.scopes.flatMap((scope) => {
    const entries = state.variables.find((vars) => vars.scope === scope.id)?.entries ?? [];
    const found = entries.length === 0 ? null : publishedScope(state, scope, byName(entries));
    return found === null ? [] : [{ ...found, element: found.element === null ? null : programPublicId(program, found.element) }];
  });
  return mergeSort(published, publishedScopeLe);
}
