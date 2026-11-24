module

/-! # The orientation of the scope-led key orders

`keyOrderOpposite` is `false`, so the scope-led key orders (`Kernel.State.Key`, `Kernel.State.Items`) order as written;
each reads its scope-led head through an oriented order and orients the rest of its comparison (`orientCmp`). The
opposite-key-order test build sets the constant to `true` in a copy of the tree
(`packages/differential/test/kernel-targets.ts`, `oppositeKeyOrderKernelRun`) and requires every output to stay
byte-identical, since the storage order of a scope-keyed map never reaches an output (KD7, promise row 810). A build
selects the constant and nothing a host or a model supplies can; its body stays hidden, so the test build rebuilds this
module alone, and a law reads its value only through `Kernel.Laws.State.KeyOrder`. `packages/kernel/src/state/key-order.ts`
holds the constant alone, which the TypeScript build substitutes, and `key.ts` the orientation. Part of the State
layer, below `Kernel.State.Key`.
-/

public section

namespace Kernel

/-- Whether the scope-led key orders are reversed: only in the opposite-key-order test build. Reversed, a scope
subtree is still one key range, but its root is the range's last key, not its first; so removal by key range (DC21)
must take its bounds from the oriented order, never assume the subtree's root opens it. -/
def keyOrderOpposite : Bool := false

/-- `order` as the scope-led key orders give it, or its opposite in the opposite-key-order test build
(`keyOrderOpposite`). Every scope-led key's order reads its scope-led head through an oriented order and orients the
rest of its comparison, so that build reverses the whole order of every map keyed by such a key. -/
def orientKeyOrder (order : Ordering) : Ordering := bif keyOrderOpposite then order.swap else order

/-- `cmp`, oriented (`orientKeyOrder`), with the fact the orders' lawfulness reads proved inline: orienting keeps which
comparisons tie. -/
def orientCmp {α : Type} (cmp : α → α → Ordering) :
    { oriented : α → α → Ordering // ∀ a b, oriented a b = .eq ↔ cmp a b = .eq } :=
  ⟨fun a b => orientKeyOrder (cmp a b), fun a b => by
    rcases Bool.eq_false_or_eq_true keyOrderOpposite with opposite | opposite <;>
      simp only [orientKeyOrder, opposite, Bool.cond_true, Bool.cond_false, Ordering.swap_eq_eq]⟩

/-- Orienting keeps an order transitive: it is the order or its opposite. -/
instance {α : Type} {cmp : α → α → Ordering} [Std.TransCmp cmp] : Std.TransCmp (orientCmp cmp).val := by
  cases opposite : keyOrderOpposite
  · have same : (orientCmp cmp).val = cmp := by funext a b; simp [orientCmp, orientKeyOrder, opposite]
    rw [same]
    infer_instance
  · have flipped : (orientCmp cmp).val = fun a b => cmp b a := by
      funext a b
      simp only [orientCmp, orientKeyOrder, opposite, Bool.cond_true]
      exact Std.OrientedCmp.eq_swap.symm
    rw [flipped]
    exact Std.TransCmp.opposite

end Kernel
