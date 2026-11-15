module

/-! # Laws of `Except`: what a successful run of a monadic step ran

The two facts the feature Laws modules read off a hook body's `Except` steps when the hook succeeded: a bind ran both
steps and a map mapped a success (`Kernel.Laws.Propagation`, `Kernel.Laws.Subscriptions`). They read no kernel module.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws

/-- A bind that succeeded ran both steps. -/
theorem ok_bind {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

/-- A map that succeeded mapped a success. -/
theorem ok_map {α β ε : Type} {x : Except ε α} {f : α → β} {b : β} (ran : x.map f = .ok b) :
    ∃ a, x = .ok a ∧ b = f a := by
  cases x with
  | error failure => simp [Except.map] at ran
  | ok a => exact ⟨a, rfl, (Except.ok.inj ran).symm⟩

end Kernel.Laws
