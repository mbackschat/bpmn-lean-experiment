/**
 * Work: the scope-chain submission rule, transcribed from `Kernel/Feature/Work/Submission.lean`.
 *
 * `ProfileOptions.scopeChainSubmissionBytes` selects `NSD-TASK-01` of the nested embedded scope data specification
 * (CIB-EXT-0020): a User Task completion may name only variables a scope occurrence on the task's chain declares,
 * below the root of its process instance, or, inside a called instance, the names its Call copies across
 * (`submissionNames`, CVM-TASK-01), each at most once, and the canonical JSON of the submission may take at most the
 * selected number of UTF-8 bytes. The name restriction is a profile admission restriction, not CIB behaviour, which
 * would create a root binding for an undeclared name. Anything else is `rejected` and changes nothing.
 */
import type { Ctx } from "../../hooks.js";
import { ValueTag, assertNever, type Value } from "../../il/types.js";
import {
  FailureTag,
  committed,
  failed,
  instanceRoot,
  utf8ByteSize,
  type Binding,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";
import { submissionNames } from "./call.js";

const namedEscapes: ReadonlySet<number> = new Set([0x08, 0x09, 0x0a, 0x0c, 0x0d, 0x22, 0x5c]);

/**
 * Bytes `JSON.stringify` emits for `text` as a JSON string, quotes included: a quote, a backslash and the five named
 * controls take two bytes, every other control six (`\u00XX`). Every escaped byte is ASCII, so a non-ASCII code
 * point takes its UTF-8 bytes unescaped.
 */
export function stringBytes(text: string): number {
  let total = 2;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    total += code >= 0x80 ? utf8ByteSize(character) : namedEscapes.has(code) ? 2 : code < 0x20 ? 6 : 1;
  }
  return total;
}

/** Bytes of a JSON array whose members take `sizes`, brackets and separators included. */
export function arrayBytes(sizes: readonly number[]): number {
  return 2 + sizes.reduce((total, size) => total + size, 0) + Math.max(sizes.length - 1, 0);
}

/**
 * The canonical JSON bytes of a portable value: no whitespace, `kind` before `value` (or `coefficient` and `scale`),
 * Map entries `name` before `value` (`BpmnSemantics.SemanticProcess.CanonicalBusinessValue`). A String List is
 * outside the portable value arms and has no measure.
 */
export function valueBytes(value: Value): number | null {
  switch (value.tag) {
    case ValueTag.Null:
      return utf8ByteSize('{"kind":"null"}');
    case ValueTag.Bool:
      return utf8ByteSize('{"kind":"boolean","value":}') + utf8ByteSize(String(value.value));
    case ValueTag.Int:
      return utf8ByteSize('{"kind":"integer","value":}') + utf8ByteSize(String(value.value));
    case ValueTag.Decimal:
      return (
        utf8ByteSize('{"kind":"decimal","coefficient":,"scale":}') +
        stringBytes(String(value.coefficient)) +
        utf8ByteSize(String(value.scale))
      );
    case ValueTag.String:
      return utf8ByteSize('{"kind":"string","value":}') + stringBytes(value.value);
    case ValueTag.StringList:
      return null;
    case ValueTag.List: {
      const sizes = itemsBytes(value.items);
      return sizes === null ? null : utf8ByteSize('{"kind":"list","value":}') + arrayBytes(sizes);
    }
    case ValueTag.Map: {
      const sizes = entriesBytes(value.entries);
      return sizes === null ? null : utf8ByteSize('{"kind":"map","value":}') + arrayBytes(sizes);
    }
  }
  return assertNever(value);
}

export function itemsBytes(items: readonly Value[]): number[] | null {
  const sizes: number[] = [];
  for (const item of items) {
    const size = valueBytes(item);
    if (size === null) {
      return null;
    }
    sizes.push(size);
  }
  return sizes;
}

/** Each entry as `{"name":…,"value":…}`. */
export function entriesBytes(entries: readonly Binding[]): number[] | null {
  const sizes: number[] = [];
  for (const [name, value] of entries) {
    const size = valueBytes(value);
    if (size === null) {
      return null;
    }
    sizes.push(utf8ByteSize('{"name":,"value":}') + stringBytes(name) + size);
  }
  return sizes;
}

/** The names the scope occurrences from `scope` up to, but not including, the root of its process instance declare. */
export function declared(state: State, scope: ScopeOccurrenceId): readonly string[] {
  const top = instanceRoot(state, scope);
  const names: string[] = [];
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null && current !== top; fuel -= 1) {
    const id: ScopeOccurrenceId = current;
    names.push(...(state.variables.find((vars) => vars.scope === id)?.entries.map((entry) => entry[0]) ?? []));
    current = state.scopes.find((occurrence) => occurrence.id === id)?.parent ?? null;
  }
  return names;
}

/** Check a submission to the User Task whose item runs in `scope` against `NSD-TASK-01` with the byte limit `limit`. */
export function check(
  ctx: Ctx,
  state: State,
  scope: ScopeOccurrenceId,
  limit: number,
  values: readonly Binding[],
): Result<null> {
  const names = values.map((binding) => binding[0]);
  const known = [...declared(state, scope), ...submissionNames(ctx, state, scope)];
  if (new Set(names).size !== names.length) {
    return failed(FailureTag.Rejected, "submission-duplicate-name");
  }
  if (names.some((name) => !known.includes(name))) {
    return failed(FailureTag.Rejected, "submission-undeclared-name");
  }
  const sizes = entriesBytes(values);
  if (sizes === null) {
    return failed(FailureTag.Rejected, "submission-value-domain");
  }
  return arrayBytes(sizes) <= limit ? committed(null) : failed(FailureTag.Rejected, "submission-too-large");
}
