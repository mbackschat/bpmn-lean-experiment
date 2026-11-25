/**
 * Compensation: the records a completed Sub-Process keeps, transcribed from `Kernel/Feature/Compensation/Kept.lean`.
 *
 * How a completed Sub-Process's record keeps the records retained in it, flat, each under its group key
 * (`CompensableChild.group`), and how its handler's or group's begin hands them back as records of their own, each with
 * the ones it keeps in turn. `feature/compensation.ts` retains and begins records; this module only moves them between
 * the two forms.
 */
import { type Compensable, type CompensableChild, type ScopeOccurrenceId } from "../../state.js";

/** `record` as its new holder keeps it: itself, directly, then what it keeps, one group deeper, under its completion number. */
export function keptRecords(record: Compensable): CompensableChild[] {
  const { subject, handler, occurrence, completion, closure, snapshot } = record;
  return [
    { subject, handler, occurrence, completion, closure, snapshot, group: [] },
    ...record.children.map((child) => ({ ...child, group: [completion, ...child.group] })),
  ];
}

/**
 * The records `direct` a begun holder kept directly, each now retained in `context` and keeping the records of `below`
 * whose group key starts with its completion number, one group shallower; each takes them before the next one looks, so
 * no kept record goes to two.
 */
function releaseKept(context: ScopeOccurrenceId, direct: readonly CompensableChild[], below: readonly CompensableChild[]): Compensable[] {
  const [child, ...others] = direct;
  if (child === undefined) return [];
  const isInside = (record: CompensableChild): boolean => record.group[0] === child.completion;
  const inside = below.filter(isInside);
  const rest = below.filter((record) => !isInside(record));
  const { subject, handler, occurrence, completion, closure, snapshot } = child;
  return [
    { subject, handler, scope: context, occurrence, completion, closure, snapshot, children: inside.map((record) => ({ ...record, group: record.group.slice(1) })) },
    ...releaseKept(context, others, rest),
  ];
}

/** The records `record` keeps directly, retained in `context` once its handler or group begins there, each with the records it keeps in turn. */
export function begunChildren(record: Compensable, context: ScopeOccurrenceId): Compensable[] {
  return releaseKept(context, record.children.filter((child) => child.group.length === 0), record.children.filter((child) => child.group.length > 0));
}
