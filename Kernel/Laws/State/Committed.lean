module

public import Kernel.State

/-! # Laws of the kernel state: a committed state

What every committed state has and a state inside a closure need not: no unit key outlives its closure, so no unit has
a transition (DC4), and every identity the closure issued was compacted to its committed form, so the issue table is
empty (DC12). An input step starts from a committed state (`State.initial` or a commit's result), so the laws of one
step take `Committed` of its before-state where a clause names the before-state's identities or its unit keys. -/

public section

namespace Kernel.Laws.State

/-- A committed state: no unit has a transition (DC4), the issue table is empty (DC12), and every occurrence's key leads
with the scope occurrence it stands in (DC26's `KeysAgree` occurrence clause, which the input's closure starts from). -/
structure Committed (s : State) : Prop where
  closed : s.transitions = ∅
  issued : s.issued = ∅
  keyed : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope

end Kernel.Laws.State
