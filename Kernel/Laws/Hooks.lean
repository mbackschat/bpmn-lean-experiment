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

/-- A held occurrence joins `FeatureSlots.held`; nothing else changes. -/
theorem hold_eq (state : State) (held : Held) :
    state.hold held = { state with slots := { state.slots with held := state.slots.held ++ [held] } } := by
  simp only [State.hold]

/-- The item an input addresses is one of the state's open items, and its element, its occurrence's activation and
its instance are the ones the input's reference names. -/
theorem itemDetail?_some {α : Type} {ctx : Ctx} {state : State} {ref : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} {value : α} (found : itemDetail? ctx state ref detail = some (item, value)) :
    item ∈ state.openItems ∧ ctx.program.publicId item.element = ref.element ∧
      (state.occurrence? item.occurrence).map (·.activation) = some ref.activation ∧
      state.instanceOf item.scope = ref.processInstanceId := by
  unfold itemDetail? at found
  obtain ⟨candidate, member, made⟩ := List.exists_of_findSome?_eq_some found
  split at made
  · rename_i matches_
    obtain ⟨_, _, same⟩ := Option.map_eq_some_iff.mp made
    obtain ⟨rfl, _⟩ := Prod.mk.inj same
    simp only [Bool.and_eq_true, beq_iff_eq] at matches_
    exact ⟨member, matches_.1.1, matches_.1.2, matches_.2⟩
  · simp at made

theorem itemDetail?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef}
    {detail : WaitView → Option α} {item : OpenItem} {value : α}
    (found : itemDetail? ctx state occurrence detail = some (item, value)) : item ∈ state.openItems :=
  (itemDetail?_some found).1

theorem item?_mem {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} (found : item? ctx state occurrence detail = some item) : item ∈ state.openItems := by
  unfold item? at found
  obtain ⟨⟨_, value⟩, made, same⟩ := Option.map_eq_some_iff.mp found
  cases same
  exact itemDetail?_mem made

/-- The item an input addresses has the detail it was looked up by. -/
theorem itemDetail?_view {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef}
    {detail : WaitView → Option α} {item : OpenItem} {value : α}
    (found : itemDetail? ctx state occurrence detail = some (item, value)) : detail item.kind.view = some value := by
  unfold itemDetail? at found
  obtain ⟨candidate, _, made⟩ := List.exists_of_findSome?_eq_some found
  split at made
  · obtain ⟨_, same, pair⟩ := Option.map_eq_some_iff.mp made
    obtain ⟨rfl, rfl⟩ := Prod.mk.inj pair
    exact same
  · simp at made

theorem item?_view {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    {item : OpenItem} (found : item? ctx state occurrence detail = some item) : (detail item.kind.view).isSome = true := by
  unfold item? at found
  obtain ⟨⟨_, value⟩, made, same⟩ := Option.map_eq_some_iff.mp found
  cases same
  simp [itemDetail?_view made]

/-- How a boundary fires (`Boundary.fire`): an interrupting one cancels its host first, if it names one; then the
reservation completes, or a fresh occurrence occurs. -/
theorem fire_eq (boundary : Boundary) (host reserved : Option Nat) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : boundary.fire host reserved scope writes state =
      (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state).signal
        (reserved.elim (.occur boundary.id scope (.flows boundary.outgoing) writes .outward)
          (.complete · (.flows boundary.outgoing) writes .outward)) := by
  unfold Boundary.fire
  cases boundary.interrupting <;> cases host <;> cases reserved <;> rfl

/-- No item is found where no item detail is. -/
theorem item?_none {α : Type} {ctx : Ctx} {state : State} {occurrence : OccurrenceRef} {detail : WaitView → Option α}
    (none_ : itemDetail? ctx state occurrence detail = none) : item? ctx state occurrence detail = none := by
  simp [item?, none_]

/-- Admitting command values fails only by rejecting a value outside the value domain. -/
theorem admitValues_error {values : List Value} {failure : Failure} (refused : admitValues values = .error failure) :
    failure = .rejected "value-outside-domain" := by
  unfold admitValues at refused
  split at refused
  · cases refused
  · exact (Except.error.inj refused).symm

/-- A List's members are its items and a String List's are its texts as Strings, in order. -/
theorem collectionItems_lists {value : Value} {outputs : List Value}
    (lists : value = .list outputs ∨ ∃ texts, value = .stringList texts ∧ texts.map .string = outputs) :
    collectionItems value = some outputs := by
  rcases lists with rfl | ⟨texts, rfl, rfl⟩ <;> rfl

end Kernel.Laws.Hooks
