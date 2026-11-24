/**
 * Publish, transcribed from `Kernel/Publish.lean`: what the public state observation of the canonical result reads from
 * runtime state besides `host.ts`'s view, the status name, the instance root's variables and every other variable scope
 * with its variables, each in name order, so that variables keep their scope. The open waits and the failure come from
 * `hostView`, which `run.ts` renders. Every sort is Lean's stable `List.mergeSort` with Lean's `String` order.
 */
import { assertNever, compareStrings, mergeSort, programPublicId, type ElementId, type Program } from "./il/types.js";
import {
  breadthUnitKey,
  issueNotAfter,
  scopeOccurrenceParent,
  scopeParent,
  ActivationRole,
  InstanceStatus,
  instanceOf,
  occurrenceOf,
  root,
  type Binding,
  type Issue,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State, ownVariables,
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

/** The instance root's variables, in name order (`ownVariables`). */
export function variables(state: State): readonly Binding[] {
  return ownVariables(state, root);
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

/** A published scope with the scope occurrence it was read from, whose depth and order position break a tie. */
type Ranked = Readonly<{ published: PublishedScope; depth: number; position: Issue }>;

/** The number of scope occurrences enclosing `scope`, the root's included (Lean's `segments.length`). */
function scopeDepth(scope: ScopeOccurrenceId): number {
  let depth = 0;
  for (let at = scopeParent(scope); at !== null; at = scopeParent(at)) depth += 1;
  return depth;
}

/**
 * Canonical order: process instance, element (none first), activation, role. Two scope occurrences may publish one
 * identity (a compensated Multi-Instance body's restored context and its instance's), so a tie is broken by the scope
 * tree, the enclosing one first, then by order position (DC25), as `hostView` orders open waits; never by the order the
 * state stores them in (KD7).
 */
function publishedScopeLe(state: State, left: Ranked, right: Ranked): boolean {
  const [a, b] = [left.published, right.published];
  const name = (scope: PublishedScope): string => scope.element ?? "";
  if (a.processInstanceId !== b.processInstanceId) return compareStrings(a.processInstanceId, b.processInstanceId) < 0;
  if (name(a) !== name(b)) return compareStrings(name(a), name(b)) < 0;
  if (a.activation !== b.activation) return a.activation < b.activation;
  if (a.role !== b.role) return scopeRoleRank(a.role) < scopeRoleRank(b.role);
  if (left.depth !== right.depth) return left.depth < right.depth;
  return issueNotAfter(breadthUnitKey, state.issued, left.position, right.position);
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
  const parent = scopeOccurrenceParent(scope);
  const role = parent !== null && ownedByBody(state, parent) ? ScopeRole.MultiInstanceInstance : ScopeRole.CompensationContext;
  return { processInstanceId, element, activation: hosted?.activation ?? 0, role, variables: entries };
}

/** Every variable scope other than the instance root that holds a variable, by public element identifiers, in
 * canonical order. */
export function publishedScopes(program: Program, state: State): readonly PublishedScope[] {
  const published = state.scopes.flatMap((scope): Ranked[] => {
    const entries = ownVariables(state, scope.id);
    const found = entries.length === 0 ? null : publishedScope(state, scope, entries);
    return found === null ? [] : [{
      published: { ...found, element: found.element === null ? null : programPublicId(program, found.element) },
      depth: scopeDepth(scope.id), position: scope.position,
    }];
  });
  return mergeSort(published, (left, right) => publishedScopeLe(state, left, right)).map((ranked) => ranked.published);
}
