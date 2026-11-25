/**
 * Entering a called process instance, transcribed from `Kernel/State/Called.lean`: the scope occurrence a Call
 * Activity's called process instance roots in, and the name it takes (`calledBy`). Part of the State layer,
 * above `state.ts`; its one caller, `feature/work/call.ts`, imports it directly.
 */
import { type DefinitionRef, type Program, programPublicId } from "../il/types.js";
import { type Binding, calledBy, enterScope, instanceOf, type Occurrence, type ScopeOccurrenceId, type State } from "../state.js";

/**
 * Enter the called process instance of the Call occurrence `call`, with the given variables: a scope occurrence that
 * is the called instance's root, recording the definition the Call bound for this instance. The instance is named by the
 * Call's authored identifier (`programPublicId`), so a Call in another deployment's process that a program carries as a
 * renamed copy names its instance as that process's own deployment does (PC-SCOPE-03).
 */
export function enterCalled(
  state: State,
  program: Program,
  call: Occurrence,
  variables: readonly Binding[],
  definition: DefinitionRef,
): readonly [State, ScopeOccurrenceId] {
  const caller = instanceOf(state, call.scope);
  const [entered, id] = enterScope(state, call.element, call.scope, variables, call.id);
  const calledInstance = calledBy(caller, programPublicId(program, call.element), call.activation);
  return [
    {
      ...entered,
      scopes: entered.scopes.map((occurrence) => (occurrence.id === id ? { ...occurrence, calledInstance } : occurrence)),
      slots: { ...entered.slots, instances: [...entered.slots.instances, { root: id, businessKey: null, definition }] },
    },
    id,
  ];
}
