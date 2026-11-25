/**
 * Publish, transcribed from `Kernel/Publish.lean`: what the public state observation of the canonical result reads from
 * runtime state besides `host.ts`'s view, the status name, the instance root's variables and every other variable scope
 * with its variables, each in name order, so that variables keep their scope. The open waits and the failure come from
 * `hostView`, which `run.ts` renders. Every sort is Lean's stable `List.mergeSort` with Lean's `String` order.
 */
import { assertNever, compareStrings, mergeSort, programPublicId, type ElementId, type Program } from "./il/types.js";
import {
  ActivationRole,
  committed,
  compensationsRestoredIn,
  InstanceStatus,
  instanceOf,
  occurrenceOf,
  root,
  scopeOccurrenceParent,
  SemanticCause,
  semanticFailure,
  type Binding,
  type Result,
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
 * body's; a `multiInstanceInstance` has no occurrence of its own and is named by the instance occurrence it hosts. A
 * restored compensation context, a handler's or a group's, is named by the subject occurrence whose snapshot it restores
 * (its record's `occurrence`): `compensationContext` for an Activity's or a Multi-Instance instance's,
 * `multiInstanceBodyCompensationContext` for a Multi-Instance body's, whose first instance shares its element and
 * activation. A called instance's root is a `processInstance`.
 */
export enum ScopeRole {
  ProcessInstance = "processInstance",
  Activity = "activity",
  MultiInstanceBody = "multiInstanceBody",
  MultiInstanceInstance = "multiInstanceInstance",
  MultiInstanceBodyCompensationContext = "multiInstanceBodyCompensationContext",
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
    case ScopeRole.MultiInstanceBodyCompensationContext:
      return "multiInstanceBodyCompensationContext";
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
    case ScopeRole.MultiInstanceBodyCompensationContext:
      return 4;
    case ScopeRole.CompensationContext:
      return 5;
  }
  return assertNever(role);
}

/** The role of a restored context whose subject occurrence the counter `role` numbered. */
function contextRole(role: ActivationRole): ScopeRole {
  switch (role) {
    case ActivationRole.Element:
      return ScopeRole.CompensationContext;
    case ActivationRole.MultiInstanceBody:
      return ScopeRole.MultiInstanceBodyCompensationContext;
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

/**
 * Canonical order: process instance, element (none first), activation, role. The four are the scope's identity, which
 * no two published scopes share (`publishedScopes` fails otherwise), so the order is total and never reads the order
 * the state stores scopes in (KD7).
 */
function publishedScopeLe(a: PublishedScope, b: PublishedScope): boolean {
  const name = (scope: PublishedScope): string => scope.element ?? "";
  if (a.processInstanceId !== b.processInstanceId) return compareStrings(a.processInstanceId, b.processInstanceId) < 0;
  if (name(a) !== name(b)) return compareStrings(name(a), name(b)) < 0;
  if (a.activation !== b.activation) return a.activation < b.activation;
  return scopeRoleRank(a.role) <= scopeRoleRank(b.role);
}

/** Whether `a` and `b` publish one identity. */
function sameIdentity(a: PublishedScope, b: PublishedScope): boolean {
  return a.processInstanceId === b.processInstanceId && a.element === b.element && a.activation === b.activation &&
    scopeRoleRank(a.role) === scopeRoleRank(b.role);
}

function ownedByBody(state: State, scope: ScopeOccurrenceId): boolean {
  const owner = state.scopes.find((candidate) => candidate.id === scope)?.occurrence ?? null;
  return owner !== null && occurrenceOf(state, owner)?.role === ActivationRole.MultiInstanceBody;
}

/** A scope's published name, or the invariant code that says it is not there (Lean's `Except String`). */
type Named = Readonly<{ ok: true; value: PublishedScope | null }> | Readonly<{ ok: false; code: string }>;

const named = (value: PublishedScope | null): Named => ({ ok: true, value });
const unnamed = (code: string): Named => ({ ok: false, code });

/**
 * `scope` as published, `null` for the instance root, which `variables` publishes, or the invariant code that says its
 * name is not there. A scope occurrence with an element and no occurrence of its own is a restored compensation context
 * while a run holds it (`compensationsRestoredIn`), and otherwise a Multi-Instance instance's, whose parent belongs to
 * the body occurrence and which hosts its instance occurrence once begun. A name that is not there is never published
 * as an activation 0, which names no occurrence, nor as another role.
 */
function publishedScope(state: State, scope: ScopeOccurrence, entries: readonly Binding[]): Named {
  const processInstanceId = instanceOf(state, scope.id);
  if (scope.calledInstance !== null) {
    return named({ processInstanceId, element: null, activation: 0, role: ScopeRole.ProcessInstance, variables: entries });
  }
  const element = scope.element;
  if (element === null) return named(null);
  if (scope.occurrence !== null) {
    const owner = occurrenceOf(state, scope.occurrence);
    if (owner === null) return unnamed("published-scope-owner-gone");
    return named({
      processInstanceId,
      element: owner.element,
      activation: owner.activation,
      role: owner.role === ActivationRole.MultiInstanceBody ? ScopeRole.MultiInstanceBody : ScopeRole.Activity,
      variables: entries,
    });
  }
  const record = compensationsRestoredIn(state.slots.compensation, scope.id);
  if (record !== null) {
    const subject = record.occurrence;
    if (subject === null) return unnamed("published-context-without-subject");
    return named({
      processInstanceId: subject.processInstanceId, element: subject.element, activation: subject.activation,
      role: contextRole(subject.role), variables: entries,
    });
  }
  const parent = scopeOccurrenceParent(scope);
  if (parent === null || !ownedByBody(state, parent)) return unnamed("published-scope-unnamed");
  const hosted = state.occurrences.find((occurrence) => occurrence.scope === scope.id && occurrence.element === element);
  if (hosted === undefined) return unnamed("published-instance-not-begun");
  return named({ processInstanceId, element, activation: hosted.activation, role: ScopeRole.MultiInstanceInstance, variables: entries });
}

/**
 * Every variable scope other than the instance root that holds a variable, by public element identifiers, in canonical
 * order. When a scope's name is not there the least of the invariant codes is the failure, and otherwise two scopes
 * publishing one identity is, so a failure too reads no storage order (KD7).
 */
export function publishedScopes(program: Program, state: State): Result<readonly PublishedScope[]> {
  const names = state.scopes.flatMap((scope): Named[] => {
    const entries = ownVariables(state, scope.id);
    return entries.length === 0 ? [] : [publishedScope(state, scope, entries)];
  });
  const codes = names.flatMap((name) => (name.ok ? [] : [name.code]));
  const [first, ...rest] = codes;
  if (first !== undefined) {
    return semanticFailure(SemanticCause.Invariant, rest.reduce((least, code) => (compareStrings(code, least) < 0 ? code : least), first));
  }
  const published = names.flatMap((name): PublishedScope[] => (!name.ok || name.value === null ? [] : [{
    ...name.value, element: name.value.element === null ? null : programPublicId(program, name.value.element),
  }]));
  const ordered = mergeSort(published, publishedScopeLe);
  if (ordered.some((scope, index) => index > 0 && sameIdentity(ordered[index - 1] as PublishedScope, scope))) {
    return semanticFailure(SemanticCause.Invariant, "published-scope-identity-twice");
  }
  return committed(ordered);
}
