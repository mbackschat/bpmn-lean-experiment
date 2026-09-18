import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProgramBindingFacts

/-! # Bounded Called-Process reachability

These laws reason about the executable Call closure used by association validity. Duplicate-free
seeds justify its equal-length stopping condition; record sorting and extension preserve reachable
instances without assuming successor validity or changing the evaluator's fuel policy.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private abbrev expand (records : List CalledProcessOccurrence) (seed : List SemanticId) :=
  (seed ++ records.filterMap fun record =>
    if seed.contains record.caller.processInstanceId then
      some record.calledRoot.processInstanceId
    else none).eraseDups

private theorem mem_expand (records : List CalledProcessOccurrence) (seed : List SemanticId)
    (instanceId : SemanticId) :
    instanceId ∈ expand records seed ↔ instanceId ∈ seed ∨
      ∃ record ∈ records, record.caller.processInstanceId ∈ seed ∧
        record.calledRoot.processInstanceId = instanceId := by
  simp only [expand, List.mem_eraseDups, List.mem_append, List.mem_filterMap]
  apply or_congr Iff.rfl
  apply exists_congr
  intro record
  by_cases member : record.caller.processInstanceId ∈ seed <;> simp [member]

private theorem seed_subset_expand (records : List CalledProcessOccurrence)
    (seed : List SemanticId) : seed ⊆ expand records seed := by
  intro instanceId member
  exact (mem_expand records seed instanceId).mpr (.inl member)

private theorem eraseDups_nodup (values : List SemanticId) : values.eraseDups.Nodup := by
  cases values with
  | nil => simp
  | cons head tail =>
      rw [List.eraseDups_cons, List.nodup_cons]
      exact ⟨by simp, eraseDups_nodup _⟩
termination_by values.length
decreasing_by have := List.length_filter_le (fun b => !b == head) tail; simp_all; omega

private theorem expand_nodup (records : List CalledProcessOccurrence)
    (seed : List SemanticId) : (expand records seed).Nodup := eraseDups_nodup _

private theorem expand_subset (leftRecords rightRecords : List CalledProcessOccurrence)
    (leftSeed rightSeed : List SemanticId) (records : leftRecords ⊆ rightRecords)
    (seeds : leftSeed ⊆ rightSeed) : expand leftRecords leftSeed ⊆ expand rightRecords rightSeed := by
  intro instanceId member
  rcases (mem_expand _ _ _).mp member with member | ⟨record, present, caller, called⟩
  · exact (mem_expand _ _ _).mpr (.inl (seeds member))
  · exact (mem_expand _ _ _).mpr (.inr ⟨record, records present, seeds caller, called⟩)

theorem processInstanceClosureWithin_seed_subset
    (records : List CalledProcessOccurrence) (seed : List SemanticId) (fuel : Nat) :
    seed ⊆ processInstanceClosureWithin records seed fuel := by
  induction fuel generalizing seed with
  | zero => exact List.Subset.refl _
  | succ fuel ih =>
      change seed ⊆ if (expand records seed).length = seed.length then expand records seed
        else processInstanceClosureWithin records (expand records seed) fuel
      split
      · exact seed_subset_expand records seed
      · exact (seed_subset_expand records seed).trans (ih _)

private theorem closure_subset_of_closed (records : List CalledProcessOccurrence)
    (seed target : List SemanticId) (fuel : Nat) (seeds : seed ⊆ target)
    (closed : expand records target ⊆ target) :
    processInstanceClosureWithin records seed fuel ⊆ target := by
  induction fuel generalizing seed with
  | zero => exact seeds
  | succ fuel ih =>
      have expanded : expand records seed ⊆ target :=
        (expand_subset _ _ _ _ (List.Subset.refl _) seeds).trans closed
      change (if (expand records seed).length = seed.length then expand records seed
        else processInstanceClosureWithin records (expand records seed) fuel) ⊆ target
      split
      · exact expanded
      · exact ih _ expanded

/-- More records and a larger duplicate-free seed preserve bounded reachability. The seed
condition makes the evaluator's equal-length early termination a genuine fixed point. -/
theorem processInstanceClosureWithin_mono (leftRecords rightRecords : List CalledProcessOccurrence)
    (leftSeed rightSeed : List SemanticId) (fuel : Nat)
    (records : leftRecords ⊆ rightRecords) (seeds : leftSeed ⊆ rightSeed)
    (rightUnique : rightSeed.Nodup) :
    processInstanceClosureWithin leftRecords leftSeed fuel ⊆
      processInstanceClosureWithin rightRecords rightSeed fuel := by
  induction fuel generalizing leftSeed rightSeed with
  | zero => exact seeds
  | succ fuel ih =>
      have expanded := expand_subset _ _ _ _ records seeds
      change (if (expand leftRecords leftSeed).length = leftSeed.length then _ else _) ⊆
        (if (expand rightRecords rightSeed).length = rightSeed.length then _ else _)
      split <;> split
      · exact expanded
      · exact expanded.trans (processInstanceClosureWithin_seed_subset _ _ _)
      · next stable =>
          have fixed : expand rightRecords rightSeed ⊆ rightSeed :=
            nodup_subset_of_nodup_subset_length_eq rightUnique (expand_nodup _ _)
              (seed_subset_expand _ _) stable.symm
          have leftClosed : expand leftRecords rightSeed ⊆ rightSeed :=
            (expand_subset _ _ _ _ records (List.Subset.refl _)).trans fixed
          exact (closure_subset_of_closed _ _ _ _ (expanded.trans fixed) leftClosed).trans
            (seed_subset_expand _ _)
      · exact ih _ _ expanded (expand_nodup _ _)

/-- Increasing the evaluator's fuel never removes an already reached instance. -/
theorem processInstanceClosureWithin_fuel_mono (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (small large : Nat) (bounded : small ≤ large) :
    processInstanceClosureWithin records seed small ⊆
      processInstanceClosureWithin records seed large := by
  induction small generalizing seed large with
  | zero => exact processInstanceClosureWithin_seed_subset _ _ _
  | succ small ih =>
      cases large with
      | zero => omega
      | succ large =>
          simp only [processInstanceClosureWithin]
          split
          · exact List.Subset.refl _
          · exact ih _ _ (by omega)

/-- Record storage order cannot change membership in the bounded closure. -/
theorem processInstanceClosureWithin_perm (left right : List CalledProcessOccurrence)
    (seed : List SemanticId) (fuel : Nat) (records : left.Perm right)
    (unique : seed.Nodup) (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin left seed fuel ↔
      instanceId ∈ processInstanceClosureWithin right seed fuel :=
  ⟨fun member => processInstanceClosureWithin_mono _ _ _ _ fuel
      records.subset (List.Subset.refl _) unique member,
    fun member => processInstanceClosureWithin_mono _ _ _ _ fuel
      records.symm.subset (List.Subset.refl _) unique member⟩

/-- A direct outgoing Call edge is reached in the first expansion, independently of record order. -/
theorem processInstanceClosureWithin_direct (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (record : CalledProcessOccurrence) (fuel : Nat)
    (present : record ∈ records) (caller : record.caller.processInstanceId ∈ seed) :
    record.calledRoot.processInstanceId ∈ processInstanceClosureWithin records seed (fuel + 1) := by
  have reached : record.calledRoot.processInstanceId ∈ expand records seed :=
    (mem_expand _ _ _).mpr (.inr ⟨record, present, caller, rfl⟩)
  change record.calledRoot.processInstanceId ∈
    if (expand records seed).length = seed.length then expand records seed
      else processInstanceClosureWithin records (expand records seed) fuel
  split
  · exact reached
  · exact processInstanceClosureWithin_seed_subset _ _ _ reached

/-- One unit of fuel follows only edges whose caller was already in the seed. -/
theorem processInstanceClosureWithin_one (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin records seed 1 ↔ instanceId ∈ seed ∨
      ∃ record ∈ records, record.caller.processInstanceId ∈ seed ∧
        record.calledRoot.processInstanceId = instanceId := by
  simpa only [processInstanceClosureWithin, ite_self] using mem_expand records seed instanceId

/-- The two-edge discriminator prevents fuel monotonicity from being read as unbounded closure. -/
theorem processInstanceClosureWithin_two_edge_fuel (first second : CalledProcessOccurrence)
    (linked : second.caller.processInstanceId = first.calledRoot.processInstanceId)
    (middleFresh : first.calledRoot.processInstanceId ≠ first.caller.processInstanceId)
    (lastFresh : second.calledRoot.processInstanceId ≠ first.caller.processInstanceId)
    (lastDifferent : second.calledRoot.processInstanceId ≠ first.calledRoot.processInstanceId) :
    second.calledRoot.processInstanceId ∉
      processInstanceClosureWithin [first, second] [first.caller.processInstanceId] 1 ∧
    second.calledRoot.processInstanceId ∈
      processInstanceClosureWithin [first, second] [first.caller.processInstanceId] 2 := by
  constructor
  · rw [processInstanceClosureWithin_one]
    simp [linked, middleFresh, lastFresh, Ne.symm lastDifferent]
  · simp only [processInstanceClosureWithin]
    simp [linked, middleFresh, Ne.symm middleFresh, lastFresh, lastDifferent, List.eraseDups_cons]

theorem insertCallRecord_perm (record : CalledProcessOccurrence)
    (records : List CalledProcessOccurrence) :
    (insertCallRecord record records).Perm (record :: records) := by
  induction records with
  | nil => exact List.Perm.refl _
  | cons head tail ih =>
      simp only [insertCallRecord]
      split
      · exact List.Perm.refl _
      · exact (ih.cons head).trans (List.Perm.swap _ _ _)

theorem sortCallRecords_perm (records : List CalledProcessOccurrence) :
    (sortCallRecords records).Perm records := by
  induction records with
  | nil => exact List.Perm.refl _
  | cons record rest ih =>
      exact (insertCallRecord_perm record _).trans (ih.cons record)

/-- Inserting and sorting a Call association preserves old bounded reachability at the
evaluator's record-count fuel and reaches the newly called instance from its seeded caller. -/
theorem processInstanceClosureWithin_sorted_extension (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (record : CalledProcessOccurrence)
    (unique : seed.Nodup) (caller : record.caller.processInstanceId ∈ seed) :
    processInstanceClosureWithin records seed (records.length + 1) ⊆
      processInstanceClosureWithin (sortCallRecords (record :: records)) seed
        ((sortCallRecords (record :: records)).length + 1) ∧
    record.calledRoot.processInstanceId ∈
      processInstanceClosureWithin (sortCallRecords (record :: records)) seed
        ((sortCallRecords (record :: records)).length + 1) := by
  have permutation := sortCallRecords_perm (record :: records)
  have included : records ⊆ sortCallRecords (record :: records) := by
    intro candidate member
    exact permutation.symm.subset (List.mem_cons_of_mem record member)
  constructor
  · exact (processInstanceClosureWithin_mono _ _ _ _ _ included (List.Subset.refl _) unique).trans
      (processInstanceClosureWithin_fuel_mono _ _ _ _ (by
        rw [permutation.length_eq]
        simp))
  · exact processInstanceClosureWithin_direct _ _ _ _
      (permutation.symm.subset (by simp)) caller

end BpmnSemantics.SemanticProcess
