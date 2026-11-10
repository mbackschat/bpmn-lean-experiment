/**
 * Work: the scope-chain submission rule, transcribed from `Kernel/Feature/Work/Submission.lean`.
 *
 * `ProfileOptions.scopeChainSubmissionBytes` selects `NSD-TASK-01` of the nested embedded scope data specification
 * (CIB-EXT-0020): a User Task completion may name only variables a scope occurrence on the task's chain, its own frame
 * included (UTL-TASK-01), declares, below the root of its process instance, or, inside a called instance, the names its
 * Call copies across (`submissionNames`, CVM-TASK-01), each at most once, and the canonical JSON of the submission may
 * take at most the selected number of UTF-8 bytes. The name restriction is a profile admission restriction, not CIB
 * behaviour, which would create a root binding for an undeclared name. Anything else is `rejected` and changes nothing.
 */
import { distinctCount } from "../../il/types.js";
import {
  FailureTag,
  committed,
  failed,
  instanceRoot,
  type Binding,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";
import { arrayBytes, entriesBytes, type Ctx } from "../../hooks.js";
import { submissionNames } from "./call.js";

/** The names the scope occurrences from `scope` up to, but not including, the root of its process instance declare. */
function declared(state: State, scope: ScopeOccurrenceId): readonly string[] {
  const top = instanceRoot(state, scope);
  const names: string[] = [];
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null && current !== top; fuel -= 1) {
    const at: ScopeOccurrenceId = current;
    names.push(...(state.variables.find((entry) => entry.scope === at)?.entries ?? []).map(([name]) => name));
    current = state.scopes.find((candidate) => candidate.id === at)?.parent ?? null;
  }
  return names;
}

/** Check a submission to the User Task whose item runs in `scope` against `NSD-TASK-01` with the byte limit `limit`. */
export function check(ctx: Ctx, state: State, scope: ScopeOccurrenceId, limit: number, values: readonly Binding[]): Result<null> {
  const names = values.map(([name]) => name);
  const known = [...declared(state, scope), ...submissionNames(ctx, state, scope)];
  if (distinctCount(names) !== names.length) return failed(FailureTag.Rejected, "submission-duplicate-name");
  if (names.some((name) => !known.includes(name))) return failed(FailureTag.Rejected, "submission-undeclared-name");
  const sizes = entriesBytes(values);
  if (sizes === null) return failed(FailureTag.Rejected, "submission-value-domain");
  return arrayBytes(sizes) <= limit ? committed(null) : failed(FailureTag.Rejected, "submission-too-large");
}
