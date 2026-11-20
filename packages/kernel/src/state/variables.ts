/**
 * Writing variables, transcribed from `Kernel/State/Variables.lean`: the frame a write lands in (`declaring`, `owner`)
 * and the two write primitives, `setVariable` and `removeVariable`, which log each write for `Hooks.written`. Part of
 * the State layer, above `state.ts`; its one caller, `feature/data.ts`, the only writer of variables (guard 17), imports
 * it directly.
 */
import { type ElementId, type Value, VariableEvent } from "../il/types.js";
import { type Binding, calledRoot, type ScopeOccurrenceId, scopeParent, type State, stands } from "../state.js";

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
  return state.variables.find((entry) => entry.scope === scope)?.entries.some(([key]) => key === name) ?? false;
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
  const replace = (entries: readonly Binding[]): readonly Binding[] =>
    entries.some(([key]) => key === name)
      ? entries.map((entry) => (entry[0] === name ? ([name, value] as const) : entry))
      : [...entries, [name, value] as const];
  const kind = bindsOwn(state, target, name) ? VariableEvent.Update : VariableEvent.Create;
  const written: State = { ...state, writes: [...state.writes, { scope: target, name, kind }] };
  if (written.variables.some((entry) => entry.scope === target)) {
    return {
      ...written,
      variables: written.variables.map((entry) =>
        entry.scope === target ? { ...entry, entries: replace(entry.entries) } : entry),
    };
  }
  return { ...written, variables: [...written.variables, { scope: target, entries: [[name, value] as const] }] };
}

/** Delete `name` from `target`'s own variables and log the deletion. */
export function removeVariable(state: State, target: ScopeOccurrenceId, name: string): State {
  return {
    ...state,
    writes: [...state.writes, { scope: target, name, kind: VariableEvent.Delete }],
    variables: state.variables.map((entry) =>
      entry.scope === target ? { ...entry, entries: entry.entries.filter(([key]) => key !== name) } : entry),
  };
}
