/**
 * Work: the scope-chain submission rule, transcribed from `Kernel/Feature/Work/Submission.lean`.
 *
 * `ProfileOptions.scopeChainSubmissionBytes` selects `NSD-TASK-01` of the nested embedded scope data specification
 * (CIB-EXT-0020): a User Task completion may name only variables a scope occurrence on the task's chain declares, below
 * the root of its process instance, or, inside a called instance, the names its Call copies across
 * (`submissionNames`, CVM-TASK-01), each at most once, and the canonical JSON of the submission may take at most the
 * selected number of UTF-8 bytes. The name restriction is a profile admission restriction, not CIB behaviour, which
 * would create a root binding for an undeclared name. Anything else is `rejected` and changes nothing.
 */
import { ValueTag, assertNever, distinctCount, utf8ByteSize, type Value } from "../../il/types.js";
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
import type { Ctx } from "../../hooks.js";
import { submissionNames } from "./call.js";

/**
 * Bytes `JSON.stringify` emits for `text` as a JSON string, quotes included: a quote, a backslash and the five named
 * controls take two bytes, every other control six (`\u00XX`). Every escaped byte is ASCII, so the census runs over the
 * UTF-8 bytes.
 */
export function stringBytes(text: string): number {
  let total = 2;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const named = code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x22 || code === 0x5c;
    total += code >= 0x80 ? utf8ByteSize(char) : named ? 2 : code < 0x20 ? 6 : 1;
  }
  return total;
}

/** Bytes of a JSON array whose members take `sizes`, brackets and separators included. */
export function arrayBytes(sizes: readonly number[]): number {
  return 2 + sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, sizes.length - 1);
}

const shellBytes = (shell: string): number => utf8ByteSize(shell);

/**
 * The canonical JSON bytes of a portable value: no whitespace, `kind` before `value` (or `coefficient` and `scale`),
 * Map entries `name` before `value` (NSD-TASK-01). A String List is outside the portable value arms and has no measure.
 */
export function valueBytes(value: Value): number | null {
  switch (value.tag) {
    case ValueTag.Null:
      return shellBytes("{\"kind\":\"null\"}");
    case ValueTag.Bool:
      return shellBytes("{\"kind\":\"boolean\",\"value\":}") + utf8ByteSize(String(value.value));
    case ValueTag.Int:
      return shellBytes("{\"kind\":\"integer\",\"value\":}") + utf8ByteSize(String(value.value));
    case ValueTag.Decimal:
      return shellBytes("{\"kind\":\"decimal\",\"coefficient\":,\"scale\":}") + stringBytes(value.coefficient.toString()) +
        utf8ByteSize(String(value.scale));
    case ValueTag.String:
      return shellBytes("{\"kind\":\"string\",\"value\":}") + stringBytes(value.value);
    case ValueTag.StringList:
      return null;
    case ValueTag.List: {
      const items = itemsBytes(value.items);
      return items === null ? null : shellBytes("{\"kind\":\"list\",\"value\":}") + arrayBytes(items);
    }
    case ValueTag.Map: {
      const entries = entriesBytes(value.entries);
      return entries === null ? null : shellBytes("{\"kind\":\"map\",\"value\":}") + arrayBytes(entries);
    }
  }
  return assertNever(value);
}

function itemsBytes(items: readonly Value[]): readonly number[] | null {
  const sizes: number[] = [];
  for (const item of items) {
    const size = valueBytes(item);
    if (size === null) return null;
    sizes.push(size);
  }
  return sizes;
}

/** Each entry as `{"name":…,"value":…}`. */
export function entriesBytes(entries: readonly Binding[]): readonly number[] | null {
  const sizes: number[] = [];
  for (const [name, value] of entries) {
    const size = valueBytes(value);
    if (size === null) return null;
    sizes.push(shellBytes("{\"name\":,\"value\":}") + stringBytes(name) + size);
  }
  return sizes;
}

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
