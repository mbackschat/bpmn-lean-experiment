/**
 * The run log and the choice of a closure's next unit (DC4), transcribed from `Kernel/Step/Order.lean`. A closure's
 * queued work is content keyed by unit key, which holds no order of entry; when each unit ran is the run log's, which
 * lives outside `State`, in the value `settle` in `step.ts` threads, so no unit's body can read it: the token scheduler
 * and, under `declarationDepthFirst`, the position order (`issuerOrder`, DC13) read it only through `orderKey`, the
 * commit's journal only through `runPosition` (`byRun` in `step/commit.ts`). Signals run in
 * breadth-first key order, which reads no log. Every choice picks the least entry under a strict total order that ends in
 * the unit key itself, so no choice reads the iteration order of a unit-keyed map (KD7).
 */
import { assertNever, BranchSchedule } from "../il/types.js";
import { type Ctx } from "../hooks.js";
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

/**
 * Lean's `RunLog.runPosition`: the position at which `unit` ran, the log's one reader. A unit that has not run reads the
 * log's size, the position it takes once it has, so the running unit, which `settle` records after its micro-step, ranks
 * after every unit that ran (DC13).
 */
export function runPosition(log: RunLog, unit: UnitKey): number {
  return orderedGet(log.positions, unit, compareUnitKey) ?? orderedSize(log.positions);
}

/**
 * Lean's `orderKey`: the place of the `index`th thing the unit `unit` made, a queued entry or an issue (DC4, DC13): the
 * position at which `unit` ran, then `index`.
 */
export function orderKey(log: RunLog, unit: UnitKey, index: number): readonly [number, number] {
  return [runPosition(log, unit), index];
}

/**
 * Lean's `queuedKey`: a queued entry's place in the order the closure runs tokens, its `orderKey` under the unit that
 * queued it, at its index in that unit's batch; a root key, which no unit queued, its own run position.
 */
function queuedKey(log: RunLog, key: UnitKey): readonly [number, number] {
  return key.parent === null || key.step === null ? orderKey(log, key, 0) : orderKey(log, key.parent, key.step.index);
}

/** Lean's `tokenBefore`: by `queuedKey`, then by the unit key itself, a strict total order. */
function tokenBefore(log: RunLog, a: UnitKey, b: UnitKey): boolean {
  const [positionA, indexA] = queuedKey(log, a);
  const [positionB, indexB] = queuedKey(log, b);
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

/**
 * Lean's `issuerOrder`: the closure's order of units under `schedule`, which orders the pending positions its units issued
 * (DC13, `issueNotAfter`): under `orderInvariant` breadth first, which reads no log, so no body's order depends on the
 * schedule; under `declarationDepthFirst` the order the units ran (`orderKey`), then the key itself, a total order.
 */
export function issuerOrder(schedule: BranchSchedule, log: RunLog): (a: UnitKey, b: UnitKey) => number {
  switch (schedule) {
    case BranchSchedule.OrderInvariant:
      return breadthUnitKey;
    case BranchSchedule.DeclarationDepthFirst:
      return (a, b) => orderKey(log, a, 0)[0] - orderKey(log, b, 0)[0] || compareUnitKey(a, b);
  }
  return assertNever(schedule);
}

/** Lean's `unitCtx`: `ctx` for a unit of the closure that ran the units `log` records, with its unit order (`issuerOrder`). */
export function unitCtx(ctx: Ctx, log: RunLog): Ctx {
  return { ...ctx, issuerOrder: issuerOrder(ctx.program.options.branchSchedule, log) };
}
