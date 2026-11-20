module

public import Kernel.Step.Order

/-! # Step: commit

How a micro-step's effects become the input's journal: `journalDraft` turns the draft into one `Transition` of the
closure, keyed by the unit that ran it, and `orderJournal` commits a settled closure: its transitions and intents in run
order, read from the run log (`RunLog.runPosition`), and every family keyed by a unit key emptied, so no unit key outlives
its closure (DC4). `Kernel.Step.conclude` applies the first before it tells the features what the micro-step removed and
wrote, since only `Kernel.Step` calls those hooks (guard 17); neither matches a guarded type.
-/

public section

namespace Kernel.Step

/-- The draft as the transition of the unit `unit`, the draft and the write log emptied. -/
def journalDraft (unit : UnitKey) (cause : Cause) (element : Option ElementId) (owner : ScopeOccurrenceId) (state : State) :
    State :=
  let transition : Transition :=
    { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready }
  { state with transitions := state.transitions.insert unit transition, draft := {}, writes := [] }

/-- The entries of a unit-keyed family in run order: by the position at which each unit ran, then by key, so the order
never depends on the map's (KD7). -/
def byRun {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) : List α :=
  ((entries.toList.map fun (unit, value) => (log.runPosition unit, unit, value)).mergeSort fun a b =>
    a.1 < b.1 || a.1 == b.1 && compare a.2.1 b.2.1 != .gt).map (·.2.2)

/-- Commit a settled closure: its transitions as the journal and its batches' intents as the input's intents, each in the order its units
ran, and every family keyed by a unit key emptied, so no unit key outlives its closure (DC4). Queued work an instance
that ended mid-closure left behind is dropped with them: no input runs on an ended instance (`Step.onRunning`). -/
def orderJournal (outcome : Except Failure (State × RunLog)) : Outcome :=
  outcome.map fun (state, log) =>
    { state with
        journal := byRun log state.transitions, intents := (byRun log state.outboxes).flatten
        transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅ }

end Kernel.Step
