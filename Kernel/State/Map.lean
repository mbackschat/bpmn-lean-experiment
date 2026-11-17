module

public import Std.Data.ExtTreeMap

/-! # Kernel maps

The kernel's one import of a container from outside the kernel (guard 4): a transparent alias of `Std.ExtTreeMap`,
the extensional ordered map the state's maps are (KD1), so they keep its lemmas and its equality. Part of
`Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

universe u v

/-- An ordered map from `α` to `β` under `cmp`, equal when its entries are. -/
abbrev TreeMap (α : Type u) (β : Type v) (cmp : α → α → Ordering) := Std.ExtTreeMap α β cmp

end Kernel
