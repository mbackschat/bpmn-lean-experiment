/**
 * Writing variables, transcribed from `Kernel/State/Variables.lean`: the frame a write lands in (`declaring`, `owner`)
 * and the two write primitives, `setVariable` and `removeVariable`, which log each write for `Hooks.written`. Part of
 * the State layer, above `state.ts`; its one caller, `feature/data.ts`, the only writer of variables (guard 17), imports
 * it directly.
 */
import { type ElementId, type Value, VariableEvent } from "../il/types.js";
import {
  calledRoot, compareScopeOccurrenceId, insertVariable, type ScopeOccurrenceId, scopeParent, ownVariables, type State, stands,
  treeMapInsert,
} from "../state.js";

/**
 * The nearest occurrence of the Scope `element` from `scope` outward, up to the root of its process instance: the
 * occurrence whose frame holds the items `element` declares for a site in `scope`.
 */
export function declaring(state: State, scope: ScopeOccurrenceId, element: ElementId): ScopeOccurrenceId | null {
  for (let current: ScopeOccurrenceId | null = scope; current !== null; current = scopeParent(current)) {
    const frame = current;
    if (state.scopes.find((candidate) => candidate.id === frame)?.element === element) return frame;
    if (calledRoot(state, frame) || !stands(state, frame)) return null;
  }
  return null;
}

/** Whether the own variables of `scope` bind `name`. */
export function bindsOwn(state: State, scope: ScopeOccurrenceId, name: string): boolean {
  return ownVariables(state, scope).some(([key]) => key === name);
}

/** The innermost scope visible from `scope` that declares `name`, up to the root of its process instance. */
export function owner(state: State, scope: ScopeOccurrenceId, name: string): ScopeOccurrenceId | null {
  for (let current: ScopeOccurrenceId | null = scope; current !== null; current = scopeParent(current)) {
    if (bindsOwn(state, current, name)) return current;
    if (calledRoot(state, current) || !stands(state, current)) return null;
  }
  return null;
}

/** Set `name` in `target`'s own variables and log the write. */
export function setVariable(state: State, target: ScopeOccurrenceId, name: string, value: Value): State {
  const current = ownVariables(state, target);
  const kind = current.some(([key]) => key === name) ? VariableEvent.Update : VariableEvent.Create;
  return {
    ...state,
    writes: [...state.writes, { scope: target, name, kind }],
    variables: treeMapInsert(state.variables, target, insertVariable(current, name, value), compareScopeOccurrenceId),
  };
}

/** Delete `name` from `target`'s own variables and log the deletion. */
export function removeVariable(state: State, target: ScopeOccurrenceId, name: string): State {
  return {
    ...state,
    writes: [...state.writes, { scope: target, name, kind: VariableEvent.Delete }],
    // Lean's `TreeMap.modify` of `TreeMap.erase`: a scope that holds no variables stays without an entry, and a filter
    // keeps the name order.
    variables: state.variables.map(([scope, entries]) =>
      scope === target ? [scope, entries.filter(([key]) => key !== name)] as const : [scope, entries] as const),
  };
}
