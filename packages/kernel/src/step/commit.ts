/**
 * How a micro-step's effects become the input's journal, transcribed from `Kernel/Step/Commit.lean`: `journalDraft`
 * turns the draft into one `Transition` of the closure, keyed by the unit that ran it, and `orderJournal` commits a
 * settled closure: its transitions and intents in run order, read from the run log (`runPosition`), and every family
 * keyed by a unit key emptied, so no unit key outlives its closure (DC4). `step.ts#conclude` applies the first before it
 * tells the features what the micro-step removed and wrote, since only `step.ts` calls those hooks (guard 17).
 */
import type { ElementId } from "../il/types.js";
import {
  compareUnitKey, emptyDraft, orderedEntries, orderedInsert, type BroadcastIntent, type Cause, type OrderedMap, type ScopeOccurrenceId,
  type State, type Transition, type UnitKey,
} from "../state.js";
import { runPosition, type RunLog } from "./order.js";

/** The draft as the transition of the unit `unit`, the draft and the write log emptied. */
export function journalDraft(unit: UnitKey, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId, state: State): State {
  const { draft } = state;
  const transition: Transition = { cause, element, owner, started: draft.started, ended: draft.ended, ready: draft.ready };
  return { ...state, transitions: orderedInsert(state.transitions, unit, transition, compareUnitKey), draft: emptyDraft, writes: [] };
}

/** Lean's `byRun`: the entries of a unit-keyed family in run order, by position, then by key. */
function byRun<T>(log: RunLog, entries: OrderedMap<UnitKey, T>): T[] {
  return orderedEntries(entries).map(([unit, value]) => [runPosition(log, unit), unit, value] as const)
    .sort((a, b) => a[0] - b[0] || compareUnitKey(a[1], b[1])).map(([, , value]) => value);
}

/**
 * Lean's `orderJournal`: commit a settled closure, its transitions as the journal and its batches' intents as the input's intents, each in
 * the order its units ran, and every family keyed by a unit key emptied. Queued work an instance that ended mid-closure
 * left behind is dropped with them: no input runs on an ended instance.
 */
export function orderJournal(state: State, log: RunLog): State {
  return {
    ...state, journal: byRun(log, state.transitions), intents: byRun<readonly BroadcastIntent[]>(log, state.outboxes).flat(),
    transitions: null, outboxes: null, queuedTokens: null, queuedSignals: null,
  };
}
