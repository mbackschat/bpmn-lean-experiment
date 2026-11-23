module

public import Kernel.Laws.Step.CompactedKeys

/-! # Laws of the commit: occurrence keys stay keyed (DC12, DC26)

A commit renames an occurrence's key and the scope occurrence it stands in through the same scope renaming
(`renameId` renames the key's scope occurrence by `renameScope`), so an occurrence whose key leads with its scope
occurrence still does after the commit: what `Laws.State.Committed.keyed` reads of a committed state. Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

/-- **A commit keeps every occurrence keyed in its scope occurrence.** -/
theorem orderJournal_keyed {start s : State} {log : RunLog} {after : State}
    (ran : orderJournal schedule start (.ok (s, log)) = .ok after)
    (keys : ∀ o ∈ s.occurrences, o.id.scope = o.scope) : ∀ o ∈ after.occurrences, o.id.scope = o.scope := by
  intro o member
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of (orderJournal_of ran) member
  have id := mapped.id
  have scope := mapped.scope
  rw [id, scope, renameId_eq, keys old inside]

end Kernel.Laws.Step
