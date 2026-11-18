module

public import Kernel.Step.Commit
import all Kernel.Step.Commit

/-! # Laws of the step function: commit

What `Kernel.Step.Commit` does, read from its bodies: a micro-step's draft is journalled as one transition
(`journalDraft_eq`), and a committed input's journal is put in run order (`orderJournal_ok`). This is the one module
that sees `Kernel.Step.Commit`'s bodies ([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
`Kernel.Laws.Step` composes these facts with `Kernel.Step`'s bodies. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- The draft journalled as one `Transition` at the head of the journal, the draft and the write log emptied. -/
theorem journalDraft_eq {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId} {state : State} :
    journalDraft cause element owner state = { state with
      journal := { cause, element, owner, started := state.draft.started, ended := state.draft.ended } :: state.journal,
      draft := {}, writes := [] } := by
  simp only [journalDraft]

/-- The journal put in run order. -/
theorem orderJournal_ok {outcome : Outcome} {after : State} (ran : orderJournal outcome = .ok after) :
    ∃ settled, outcome = .ok settled ∧ after = { settled with journal := settled.journal.reverse } := by
  cases outcome with
  | error failure => simp [orderJournal, Except.map] at ran
  | ok settled => exact ⟨settled, rfl, (Except.ok.inj ran).symm⟩

end Kernel.Laws.Step
