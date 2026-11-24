module

public import Kernel.State

/-! # Laws of the step function: counters that only rise

`Raised before after` says `after` holds `before`'s scope occurrences, occurrences and items with every counter at or
above `before`'s; `Kernel.Laws.Step.Commit` shows each step of the commit's counter advance raises
(`advance_raised`). It reads no executable body. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel

/-- `after` holds `before`'s scope occurrences, occurrences and items, and every counter of `before` at or above. -/
structure Raised (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  items : after.openItems = before.openItems
  scopeOrdinals : ∀ slot, before.scopeOrdinals.getD slot 0 ≤ after.scopeOrdinals.getD slot 0
  occurrenceOrdinals : ∀ slot, before.occurrenceOrdinals.getD slot 0 ≤ after.occurrenceOrdinals.getD slot 0
  itemOrdinals : ∀ occurrence, before.itemOrdinals.getD occurrence 0 ≤ after.itemOrdinals.getD occurrence 0

theorem Raised.refl (state : State) : Raised state state :=
  ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩

theorem Raised.trans {a b c : State} (first : Raised a b) (second : Raised b c) : Raised a c :=
  ⟨second.scopes.trans first.scopes, second.occurrences.trans first.occurrences, second.items.trans first.items,
    fun slot => Nat.le_trans (first.scopeOrdinals slot) (second.scopeOrdinals slot),
    fun slot => Nat.le_trans (first.occurrenceOrdinals slot) (second.occurrenceOrdinals slot),
    fun slot => Nat.le_trans (first.itemOrdinals slot) (second.itemOrdinals slot)⟩

theorem foldl_raised {β : Type} {g : State → β → State} (step : ∀ state x, Raised state (g state x)) :
    ∀ (entries : List β) (state : State), Raised state (entries.foldl g state)
  | [], state => .refl state
  | x :: rest, state => (step state x).trans (foldl_raised step rest _)

end Kernel.Laws.Step
