module

public import Kernel.State.Root
import all Kernel.State.Root

/-! # Laws of the kernel state: the parts of a unit key

What `Kernel.State.Root`'s unit steps are: two steps of one batch compare as their indexes (`compare_signal`), and
distinct steps have distinct codes (`UnitStep.stepCode_inj`), the Cantor pairing being injective, so a spine's
fingerprint step tells them apart below 2^64 (`UnitStep.code_inj`). This is the one module that sees
`Kernel.State.Root`'s bodies; `Kernel.Laws.State.Key` re-exports it. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

namespace UnitKey

/-- Two steps of one batch compare as their kinds, then their indexes. -/
theorem compare_signal (a b : Nat) : compare (UnitStep.signal a) (UnitStep.signal b) = compare a b := by
  show compareLex (compareOn fun step : UnitStep => step.stepRank.1)
    (compareLex (compareOn fun step : UnitStep => step.stepRank.2.1) (compareOn fun step : UnitStep => step.stepRank.2.2))
    _ _ = _
  simp only [compareLex, compareOn, UnitStep.stepRank, Ordering.then, Std.ReflCmp.compare_self]
  split <;> simp_all

@[simp] theorem batchIndex_token (index : Nat) : (UnitStep.token index).batchIndex = index := by
  simp [UnitStep.batchIndex, UnitStep.stepRank]

end UnitKey

namespace UnitStep

/-- The triangle numbers' step: the next one adds `n + 1`. -/
theorem triangle_succ (n : Nat) : (n + 1) * (n + 1 + 1) / 2 = n * (n + 1) / 2 + n + 1 := by
  have h : (n + 1) * (n + 1 + 1) = n * (n + 1) + 2 * (n + 1) := by
    simp only [Nat.add_mul, Nat.mul_add, Nat.mul_one, Nat.one_mul]
    omega
  rw [h]
  omega

theorem triangle_mono {n m : Nat} (le : n ≤ m) : n * (n + 1) / 2 ≤ m * (m + 1) / 2 := by
  induction le with
  | refl => exact Nat.le_refl _
  | step _ ih =>
    rename_i m _
    show _ ≤ (m + 1) * (m + 1 + 1) / 2
    rw [triangle_succ]
    omega

/-- **The Cantor pairing is injective**: the pair's sum is the triangle below the code, and the round the rest. -/
theorem cantorPair_inj {i r i' r' : Nat} (same : cantorPair i r = cantorPair i' r') : i = i' ∧ r = r' := by
  unfold cantorPair at same
  have a := triangle_succ (i + r)
  have b := triangle_succ (i' + r')
  rcases Nat.lt_trichotomy (i + r) (i' + r') with lt | eq | gt
  · have := triangle_mono (show i + r + 1 ≤ i' + r' from lt)
    omega
  · rw [eq] at same
    omega
  · have := triangle_mono (show i' + r' + 1 ≤ i + r from gt)
    omega

/-- **Distinct unit steps have distinct codes** (`UnitStep.stepCode`). -/
theorem stepCode_inj {a b : UnitStep} (same : a.stepCode = b.stepCode) : a = b := by
  have ra : a.stepRank.1 < 6 := by cases a <;> simp [UnitStep.stepRank]
  have rb : b.stepRank.1 < 6 := by cases b <;> simp [UnitStep.stepRank]
  unfold UnitStep.stepCode at same
  have ranks : a.stepRank.1 = b.stepRank.1 := by omega
  have pairs : cantorPair a.stepRank.2.1 a.stepRank.2.2 = cantorPair b.stepRank.2.1 b.stepRank.2.2 := by omega
  obtain ⟨indexes, rounds⟩ := cantorPair_inj pairs
  have ranked : a.stepRank = b.stepRank := Prod.ext ranks (Prod.ext indexes rounds)
  cases a <;> cases b <;> simp_all [UnitStep.stepRank]

/-- Distinct unit steps whose codes are below 2^64 have distinct fingerprint codes. -/
theorem code_inj {a b : UnitStep} (small : a.stepCode < 2 ^ 64) (small' : b.stepCode < 2 ^ 64)
    (same : SpineStep.code a = SpineStep.code b) : a = b := by
  change UInt64.ofNat a.stepCode = UInt64.ofNat b.stepCode at same
  have := congrArg UInt64.toNat same
  rw [UInt64.toNat_ofNat_of_lt' small, UInt64.toNat_ofNat_of_lt' small'] at this
  exact stepCode_inj this

end UnitStep

end Kernel.Laws.State
