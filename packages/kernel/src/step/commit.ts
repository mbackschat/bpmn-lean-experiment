/**
 * How a micro-step's effects become the input's journal, transcribed from `Kernel/Step/Commit.lean`: `journalDraft`
 * turns the draft into one `Transition` on the journal. `step.ts#conclude` applies it before it tells the features what
 * the micro-step removed and wrote, since only `step.ts` calls those hooks (guard 17). Lean's `orderJournal` has no
 * counterpart: the journal is appended in run order here, so it needs no reversal.
 */
import type { ElementId } from "../il/types.js";
import { emptyDraft, type Cause, type ScopeOccurrenceId, type State, type Transition } from "../state.js";

/** The draft as one `Transition` on the journal, the draft and the write log emptied. */
export function journalDraft(cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId, state: State): State {
  const { draft } = state;
  const transition: Transition = { cause, element, owner, started: draft.started, ended: draft.ended, ready: draft.ready };
  // Appends in place: copying the journal on every micro-step made a closure quadratic in its length (measured
  // 2026-11-10 on `automatic-loop-beyond-bound`). Each input starts a fresh journal (`initial`, `onRunning`) and
  // `journalDraft` is its only writer, so no state another input or a rolled-back stage keeps sees the push.
  (state.journal as Transition[]).push(transition);
  return { ...state, draft: emptyDraft, writes: [] };
}
