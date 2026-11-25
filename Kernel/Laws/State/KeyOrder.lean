module

public import Kernel.State.KeyOrder
import all Kernel.State.KeyOrder

/-! # Laws of the kernel state: the key orders' orientation

Outside the opposite-key-order test build the scope-led key orders are not reversed: orienting is the identity
(`orientCmp_eq`), so a law about a key order reads the order as its key module writes it. The opposite build builds
`kernelRun` only, never a law. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- The key orders are not reversed in this build. -/
theorem keyOrderOpposite_eq : keyOrderOpposite = false := by
  unfold keyOrderOpposite
  rfl

/-- Orienting an order is the order itself. -/
theorem orientCmp_eq {α : Type} (cmp : α → α → Ordering) (a b : α) : (orientCmp cmp).val a b = cmp a b := by
  simp [orientCmp, orientKeyOrder, keyOrderOpposite_eq]

end Kernel.Laws.State
