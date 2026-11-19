module

public import Kernel.Hooks

/-! # Step: commit

How a micro-step's effects become the input's journal: `journalDraft` turns the draft into one `Transition` at the head
of the journal, and `orderJournal` puts a committed input's journal in run order. `Kernel.Step.conclude` applies the
first before it tells the features what the micro-step removed and wrote, since only `Kernel.Step` calls those hooks
(guard 17); neither matches a guarded type.
-/

public section

namespace Kernel.Step

/-- The draft as one `Transition` at the head of the journal, the draft and the write log emptied. -/
def journalDraft (cause : Cause) (element : Option ElementId) (owner : ScopeOccurrenceId) (state : State) : State :=
  let transition : Transition :=
    { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready }
  -- Newest first while the input runs, reversed once by `orderJournal`: appending copied the journal on every micro-step,
  -- which made a closure quadratic in its length (measured 2026-11-10 on `automatic-loop-beyond-bound`).
  { state with journal := transition :: state.journal, draft := {}, writes := [] }

/-- The journal in the order the micro-steps ran (`journalDraft` keeps it newest first). -/
def orderJournal (outcome : Outcome) : Outcome :=
  outcome.map fun state => { state with journal := state.journal.reverse }

end Kernel.Step
