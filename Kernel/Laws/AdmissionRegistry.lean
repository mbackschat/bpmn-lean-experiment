module

public import Kernel.AdmissionRegistry
public import Kernel.Laws.Admission.Profile
import all Kernel.AdmissionRegistry

/-! # Laws of the admission registry

What every admitted program satisfies because admission refused the alternative, for the proofs that take it as a
premise rather than a guard over the profile catalog: a program carries its options as free IL data, so a forged option
set is caught here, whatever profile, if any, produced it.
-/

public section

namespace Kernel.Laws.AdmissionRegistry

open Kernel Kernel.AdmissionRegistry Kernel.Laws.Admission.Profile

/-- **The order premise (DC28).** An admitted program whose options select `BranchSchedule.orderInvariant` selects the
order-free value of every option whose meaning depends on run order. -/
theorem orderFree_of_admit {program : Program} (admitted : AdmissionRegistry.admit program = none)
    (invariant : program.options.branchSchedule = .orderInvariant) : OrderFree program.options := by
  let reach : Admission.Profile.Reach :=
    { abnormalScope := abnormalScope program, loops := loops program, errorExit := errorExit program
      loopedHandler := loopedHandler program }
  refine orderFree_of_options (reach := reach) ?_ invariant
  cases found : Admission.Profile.options reach program.options with
  | none => trivial
  | some code =>
    simp only [reach] at found
    simp [AdmissionRegistry.admit, admitLocated, unlocated, found] at admitted

end Kernel.Laws.AdmissionRegistry
