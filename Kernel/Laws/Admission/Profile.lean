module

public import Kernel.Admission.Profile
import all Kernel.Admission.Profile

/-! # Laws of profile admission

The premise the order-invariance argument takes from admission (DC28): under `BranchSchedule.orderInvariant` an admitted
option set selects the order-free value of every option `Kernel.Admission.Profile.orderClasses` lists as order-dependent,
so the argument reads no option whose meaning depends on run order, whatever option set a program carries.
-/

public section

namespace Kernel.Laws.Admission.Profile

open Kernel Kernel.Admission.Profile

/-- The order-free value of every option `orderClasses` lists as order-dependent. -/
def OrderFree (selected : ProfileOptions) : Prop :=
  selected.unhandledError = .failsInstance ∧ selected.raisedCallOutputs = .none ∧ selected.signalNames = .identifier ∧
    selected.messageNames = .description ∧ selected.multiInstanceCounters = .none ∧
    selected.inclusiveJoinReach = .withBoundaries

/-- An option set no order-dependent value of which needs another schedule than `orderInvariant` is order-free. -/
theorem orderFree_of_orderDependent {selected : ProfileOptions} (admitted : orderDependent selected = none)
    (invariant : selected.branchSchedule = .orderInvariant) : OrderFree selected := by
  simp only [orderDependent, List.findSome?_eq_none_iff, orderClasses, List.mem_cons, List.not_mem_nil, or_false,
    forall_eq_or_imp, forall_eq, invariant] at admitted
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · cases found : selected.unhandledError <;> simp_all
  · cases found : selected.raisedCallOutputs <;> simp_all
  · cases found : selected.signalNames <;> simp_all
  · cases found : selected.messageNames <;> simp_all
  · cases found : selected.multiInstanceCounters <;> simp_all
  · cases found : selected.inclusiveJoinReach <;> simp_all

/-- **The profile premise (DC28).** Profile admission refuses every order-dependent option value under
`orderInvariant`, so an option set it admits with that schedule is order-free. -/
theorem orderFree_of_options {reach : Reach} {selected : ProfileOptions} (admitted : options reach selected = none)
    (invariant : selected.branchSchedule = .orderInvariant) : OrderFree selected := by
  refine orderFree_of_orderDependent ?_ invariant
  cases found : orderDependent selected with
  | none => trivial
  | some code => simp [options, found] at admitted

end Kernel.Laws.Admission.Profile
