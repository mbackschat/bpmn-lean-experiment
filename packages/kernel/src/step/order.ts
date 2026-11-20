/**
 * The run log and the choice of a closure's next unit (DC4), transcribed from `Kernel/Step/Order.lean`. A closure's
 * queued work is content keyed by unit key, which holds no order of entry; when each unit ran is the run log's, which
 * lives outside `State`, in the value `settle` in `step.ts` threads, so no unit's body can read it: the token scheduler
 * reads it only through `orderKey`, the commit only through `runPosition` (`step/commit.ts`). Signals run in
 * breadth-first key order, which reads no log. Every choice picks the least entry under a strict total order that ends in
 * the unit key itself, so no choice reads the iteration order of a unit-keyed map (KD7).
 */
import {
  breadthUnitKey, compareUnitKey, orderedEntries, orderedGet, orderedInsert, orderedSize, type OrderedMap, type Signal, type Token,
  type UnitKey,
} from "../state.js";

/** Lean's `RunLog`: the position at which each unit of the closure ran, from 0. */
export type RunLog = Readonly<{ positions: OrderedMap<UnitKey, number> }>;

export const emptyRunLog: RunLog = { positions: null };

/** Lean's `RunLog.record`: record that `unit` ran next. */
export function runRecord(log: RunLog, unit: UnitKey): RunLog {
  return { positions: orderedInsert(log.positions, unit, orderedSize(log.positions), compareUnitKey) };
}

/** Lean's `RunLog.runPosition`: the position at which `unit` ran, 0 for a unit that has not run; the log's one reader. */
export function runPosition(log: RunLog, unit: UnitKey): number {
  return orderedGet(log.positions, unit, compareUnitKey) ?? 0;
}

/**
 * Lean's `orderKey`: a queued entry's place in the order the closure runs tokens, the position at which the unit that
 * queued it ran, then its index in that unit's batch.
 */
export function orderKey(log: RunLog, key: UnitKey): readonly [number, number] {
  return key.parent === null || key.step === null ? [runPosition(log, key), 0] : [runPosition(log, key.parent), key.step.index];
}

/** Lean's `tokenBefore`: by `orderKey`, then by the unit key itself, a strict total order. */
function tokenBefore(log: RunLog, a: UnitKey, b: UnitKey): boolean {
  const [positionA, indexA] = orderKey(log, a);
  const [positionB, indexB] = orderKey(log, b);
  return positionA < positionB || positionA === positionB && (indexA < indexB || indexA === indexB && compareUnitKey(a, b) < 0);
}

/** Lean's `least`: the least of `entries` under `before`, `undefined` for none. */
function least<T>(before: (a: UnitKey, b: UnitKey) => boolean, entries: readonly (readonly [UnitKey, T])[]): readonly [UnitKey, T] | undefined {
  let found: readonly [UnitKey, T] | undefined;
  for (const entry of entries) if (found === undefined || before(entry[0], found[0])) found = entry;
  return found;
}

/** Lean's `earliest`: the queued token that was queued first, the oldest under `orderInvariant`. */
export function earliest(log: RunLog, queued: OrderedMap<UnitKey, Token>): readonly [UnitKey, Token] | undefined {
  return least((a, b) => tokenBefore(log, a, b), orderedEntries(queued));
}

/** Lean's `latest`: the queued token that was queued last, the newest under `declarationDepthFirst`. */
export function latest(log: RunLog, queued: OrderedMap<UnitKey, Token>): readonly [UnitKey, Token] | undefined {
  return least((a, b) => tokenBefore(log, b, a), orderedEntries(queued));
}

/** Lean's `firstBreadth`: the queued signal first in breadth-first key order, which reads no log. */
export function firstBreadth(queued: OrderedMap<UnitKey, Signal>): readonly [UnitKey, Signal] | undefined {
  return least((a, b) => breadthUnitKey(a, b) < 0, orderedEntries(queued));
}
