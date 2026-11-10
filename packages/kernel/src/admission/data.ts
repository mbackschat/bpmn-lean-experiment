/**
 * Admission of data, transcribed from `Kernel/Admission/Data.lean`: expressions, mappings, conditions, element origins
 * and the shared envelope. A refusal carries a stable code.
 *
 * Every expression the kernel reads is Simple Boolean, a literal or a variable read; nothing else has an evaluator.
 */
import { ExpressionTag, assertNever, type Envelope, type Expression, type Flow, type Header, type Mapping } from "../il/types.js";


export function mapping(entry: Mapping): string | null {
  switch (entry.source.tag) {
    case ExpressionTag.Foreign:
      return "mapping.expression";
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
    case ExpressionTag.Variable:
      return null;
  }
  return assertNever(entry.source);
}

export function mappings(list: readonly Mapping[]): string | null {
  for (const entry of list) {
    const refused = mapping(entry);
    if (refused !== null) return refused;
  }
  return null;
}

/**
 * An Activity's default flow is read by `feature/flow.ts` `ownFlows` (PC-CF-07). The asynchronous continuations are
 * admitted: `step.ts` reads them as transaction boundaries (CIB-EXT-0027).
 */
export function envelope(fields: Envelope): string | null {
  return mappings(fields.inputs) ?? mappings(fields.outputs);
}

/** A Sequence Flow condition must be Simple Boolean: the exclusive and inclusive split evaluates it in the kernel. */
export function flowCondition(flow: Flow): string | null {
  if (flow.condition === null) return null;
  switch (flow.condition.tag) {
    case ExpressionTag.SimpleBoolean:
      return null;
    case ExpressionTag.Literal:
    case ExpressionTag.Variable:
    case ExpressionTag.Foreign:
      return "flow.condition.foreign";
  }
  return assertNever(flow.condition);
}

/**
 * `origin.sourceId` is what publication shows, so a program whose `Header.id` differs would publish another name; no
 * program binds an element to a definition until PC-SCOPE-03.
 */
export function origin(header: Header): string | null {
  if (header.origin.sourceId !== header.id) return "element.origin.sourceId";
  if (header.origin.definition !== null) return "element.origin.definition";
  return null;
}
