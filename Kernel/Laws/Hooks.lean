module

public import Kernel.Hooks
import all Kernel.Hooks

/-! # Laws of the hooks module

What `Kernel.Hooks`' shared helpers compute, for the proofs that need a helper's value rather than its name. This is the
one module that sees `Kernel.Hooks`' bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
a helper enters here when a proof first needs it. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Hooks

open Kernel

/-- An expression evaluated from `scope` reads the variables visible from it and the logical time. -/
theorem evalContext_eq (state : State) (program : Program) (scope : ScopeOccurrenceId) :
    state.evalContext program scope = { variables := state.visible program scope, nowMs := state.logicalTimeMs } := by
  simp only [State.evalContext]

/-- The item an input addresses is one of the state's open items. -/
theorem itemDetail?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef}
    {detail : WaitView → Option α} {item : OpenItem} {value : α}
    (found : itemDetail? ctx state occurrence detail = some (item, value)) : item ∈ state.openItems := by
  unfold itemDetail? at found
  obtain ⟨candidate, member, made⟩ := List.exists_of_findSome?_eq_some found
  split at made
  · obtain ⟨_, _, same⟩ := Option.map_eq_some_iff.mp made
    obtain ⟨rfl, _⟩ := Prod.mk.inj same
    exact member
  · simp at made

theorem item?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} (found : item? ctx state occurrence detail = some item) : item ∈ state.openItems := by
  unfold item? at found
  obtain ⟨⟨_, value⟩, made, same⟩ := Option.map_eq_some_iff.mp found
  cases same
  exact itemDetail?_mem made

end Kernel.Laws.Hooks
