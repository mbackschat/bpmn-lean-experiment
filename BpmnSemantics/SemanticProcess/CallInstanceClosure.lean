import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Directed Called-Process instance closure

Call association and regional cancellation share this bounded forward traversal. Duplicate-free
seeds justify its equal-length stopping condition; the executable duplicate-seed behavior is retained.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def processInstanceClosureWithin
    (records : List CalledProcessOccurrence) (seed : List SemanticId) :
    Nat → List SemanticId
  | 0 => seed
  | fuel + 1 =>
      let expanded := (seed ++ records.filterMap fun record =>
        if seed.contains record.caller.processInstanceId then
          some record.calledRoot.processInstanceId
        else none).eraseDups
      if expanded.length = seed.length then expanded
      else processInstanceClosureWithin records expanded fuel

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

private theorem nodup_length_le_of_subset (left right : List SemanticId)
    (unique : left.Nodup) (included : left ⊆ right) : left.length ≤ right.length := by
  induction left generalizing right with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, tailUnique⟩ := List.nodup_cons.mp unique
      have present : head ∈ right := included (by simp)
      have tailIncluded : tail ⊆ right.erase head := by
        intro value member
        exact (List.mem_erase_of_ne (fun (same : value = head) => fresh (same ▸ member))).mpr
          (included (List.mem_cons_of_mem head member))
      have smaller := ih _ tailUnique tailIncluded
      rw [List.length_erase_of_mem present] at smaller
      have positive : 0 < right.length := List.length_pos_of_mem present
      simp only [List.length_cons]
      omega

private theorem reverse_subset_of_length_eq {left right : List SemanticId}
    (unique : left.Nodup) (included : left ⊆ right)
    (sameLength : left.length = right.length) : right ⊆ left := by
  intro value member
  by_cases present : value ∈ left
  · exact present
  · have larger := nodup_length_le_of_subset (value :: left) right
      (List.nodup_cons.mpr ⟨present, unique⟩)
      (by intro candidate inCons; rcases List.mem_cons.mp inCons with same | old
          · exact same ▸ member
          · exact included old)
    simp only [List.length_cons] at larger
    omega

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
            reverse_subset_of_length_eq rightUnique
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

private theorem closure_nodup (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (fuel : Nat) (unique : seed.Nodup) :
    (processInstanceClosureWithin records seed fuel).Nodup := by
  induction fuel generalizing seed with
  | zero => exact unique
  | succ fuel ih =>
      change (if (expand records seed).length = seed.length then expand records seed
        else processInstanceClosureWithin records (expand records seed) fuel).Nodup
      split
      · exact expand_nodup _ _
      · exact ih _ (expand_nodup _ _)

/-- Every reached instance satisfies each seed-containing predicate closed under forward Call edges. -/
theorem processInstanceClosureWithin_least (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (fuel : Nat) (target : SemanticId → Prop)
    (seeds : ∀ instanceId ∈ seed, target instanceId)
    (closed : ∀ record ∈ records, target record.caller.processInstanceId →
      target record.calledRoot.processInstanceId) :
    ∀ instanceId ∈ processInstanceClosureWithin records seed fuel, target instanceId := by
  induction fuel generalizing seed with
  | zero => exact seeds
  | succ fuel ih =>
      have expanded : ∀ instanceId ∈ expand records seed, target instanceId := by
        intro instanceId member
        rcases (mem_expand _ _ _).mp member with member | ⟨record, present, caller, called⟩
        · exact seeds _ member
        · exact called ▸ closed record present (seeds _ caller)
      change ∀ instanceId ∈
        (if (expand records seed).length = seed.length then expand records seed
          else processInstanceClosureWithin records (expand records seed) fuel), target instanceId
      split
      · exact expanded
      · exact ih _ expanded

private theorem closure_closed_or_growth (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (fuel : Nat) (unique : seed.Nodup) :
    expand records (processInstanceClosureWithin records seed fuel) ⊆
      processInstanceClosureWithin records seed fuel ∨
    seed.length + fuel ≤ (processInstanceClosureWithin records seed fuel).length := by
  induction fuel generalizing seed with
  | zero => exact .inr (by simp [processInstanceClosureWithin])
  | succ fuel ih =>
      change (expand records (if (expand records seed).length = seed.length then _ else _) ⊆
        (if (expand records seed).length = seed.length then _ else _)) ∨ _
      by_cases stable : (expand records seed).length = seed.length
      · have fixed : expand records seed ⊆ seed :=
          reverse_subset_of_length_eq unique
            (seed_subset_expand _ _) stable.symm
        exact .inl (by
          simp only [stable, ↓reduceIte]
          exact expand_subset _ _ _ _ (List.Subset.refl _) fixed)
      · have expandedUnique := expand_nodup records seed
        have growth := nodup_length_le_of_subset seed (expand records seed) unique
          (seed_subset_expand _ _)
        rcases ih (expand records seed) expandedUnique with closed | large
        · exact .inl (by simpa only [stable, ↓reduceIte] using closed)
        · right
          change seed.length + (fuel + 1) ≤
            (if (expand records seed).length = seed.length then expand records seed
              else processInstanceClosureWithin records (expand records seed) fuel).length
          simp only [stable, ↓reduceIte]
          omega

private theorem closure_saturated (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (unique : seed.Nodup) :
    expand records (processInstanceClosureWithin records seed (records.length + 1)) ⊆
      processInstanceClosureWithin records seed (records.length + 1) := by
  rcases closure_closed_or_growth records seed (records.length + 1) unique with closed | growth
  · exact closed
  · have included : processInstanceClosureWithin records seed (records.length + 1) ⊆
        seed ++ records.map (fun record => record.calledRoot.processInstanceId) := by
      exact processInstanceClosureWithin_least records seed _ (fun instanceId =>
        instanceId ∈ seed ++ records.map (fun record => record.calledRoot.processInstanceId))
        (by intro instanceId member; exact List.mem_append_left _ member)
        (by intro record present _; exact List.mem_append_right _ (List.mem_map.mpr ⟨record, present, rfl⟩))
    have bounded := nodup_length_le_of_subset _ _ (closure_nodup _ _ _ unique) included
    simp only [List.length_append, List.length_map] at bounded
    omega

/-- Record-count fuel saturates the directed Call graph for duplicate-free seeds. -/
theorem processInstanceClosureWithin_closed (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (unique : seed.Nodup)
    (record : CalledProcessOccurrence) (present : record ∈ records)
    (caller : record.caller.processInstanceId ∈
      processInstanceClosureWithin records seed (records.length + 1)) :
    record.calledRoot.processInstanceId ∈
      processInstanceClosureWithin records seed (records.length + 1) := by
  exact closure_saturated records seed unique
    ((mem_expand _ _ _).mpr (.inr ⟨record, present, caller, rfl⟩))

/-- Membership is the least seed-containing set closed under the exact directed Call edges. -/
theorem processInstanceClosureWithin_mem_iff (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (unique : seed.Nodup) (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin records seed (records.length + 1) ↔
    ∀ target : SemanticId → Prop,
      (∀ value ∈ seed, target value) →
      (∀ record ∈ records, target record.caller.processInstanceId →
        target record.calledRoot.processInstanceId) → target instanceId := by
  constructor
  · intro member target seeds closed
    exact processInstanceClosureWithin_least records seed _ target seeds closed instanceId member
  · intro least
    exact least (fun value => value ∈ processInstanceClosureWithin records seed (records.length + 1))
      (fun _ member => processInstanceClosureWithin_seed_subset _ _ _ member)
      (fun record present caller => processInstanceClosureWithin_closed _ _ unique record present caller)

/-- Deleting only edges whose callers are unreachable preserves membership, even though the
filtered evaluator receives its own smaller record-count fuel. -/
theorem processInstanceClosureWithin_filter (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (unique : seed.Nodup) (keep : CalledProcessOccurrence → Bool)
    (survives : ∀ record ∈ records,
      record.caller.processInstanceId ∈ processInstanceClosureWithin records seed (records.length + 1) →
      keep record = true) (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin (records.filter keep) seed
      ((records.filter keep).length + 1) ↔
    instanceId ∈ processInstanceClosureWithin records seed (records.length + 1) := by
  have included : processInstanceClosureWithin (records.filter keep) seed
        ((records.filter keep).length + 1) ⊆
      processInstanceClosureWithin records seed (records.length + 1) := by
    exact processInstanceClosureWithin_least (records.filter keep) seed _
      (fun value => value ∈ processInstanceClosureWithin records seed (records.length + 1))
      (fun _ member => processInstanceClosureWithin_seed_subset _ _ _ member)
      (fun record present caller => processInstanceClosureWithin_closed _ _ unique record
        (List.mem_filter.mp present).1 caller)
  constructor
  · exact fun member => included member
  · exact processInstanceClosureWithin_least records seed _
      (fun value => value ∈ processInstanceClosureWithin (records.filter keep) seed
        ((records.filter keep).length + 1))
      (fun _ member => processInstanceClosureWithin_seed_subset _ _ _ member)
      (fun record present caller => processInstanceClosureWithin_closed _ _ unique record
        (List.mem_filter.mpr ⟨present, survives record present (included caller)⟩) caller) instanceId

/-- Removing a forward-closed set preserves reachability of every outside instance when its
incoming edges survive. The retained graph uses its own population bound, not the old fuel. -/
theorem processInstanceClosureWithin_filter_complement (records : List CalledProcessOccurrence)
    (seed : List SemanticId) (unique : seed.Nodup) (keep : CalledProcessOccurrence → Bool)
    (removed : SemanticId → Prop)
    (closed : ∀ record ∈ records, removed record.caller.processInstanceId →
      removed record.calledRoot.processInstanceId)
    (survives : ∀ record ∈ records, ¬removed record.calledRoot.processInstanceId → keep record = true)
    (instanceId : SemanticId) (outside : ¬removed instanceId) :
    instanceId ∈ processInstanceClosureWithin (records.filter keep) seed
      ((records.filter keep).length + 1) ↔
    instanceId ∈ processInstanceClosureWithin records seed (records.length + 1) := by
  constructor
  · exact processInstanceClosureWithin_least (records.filter keep) seed _
      (fun value => value ∈ processInstanceClosureWithin records seed (records.length + 1))
      (fun _ member => processInstanceClosureWithin_seed_subset _ _ _ member)
      (fun record present caller => processInstanceClosureWithin_closed records seed unique record
        (List.mem_filter.mp present).1 caller) instanceId
  · intro reachable
    have classified := processInstanceClosureWithin_least records seed _
      (fun value => removed value ∨ value ∈ processInstanceClosureWithin (records.filter keep) seed
        ((records.filter keep).length + 1))
      (fun _ member => Or.inr (processInstanceClosureWithin_seed_subset _ _ _ member))
      (by
        intro record present caller
        rcases caller with deleted | retained
        · exact Or.inl (closed record present deleted)
        · by_cases deleted : removed record.calledRoot.processInstanceId
          · exact Or.inl deleted
          · exact Or.inr (processInstanceClosureWithin_closed (records.filter keep) seed unique record
              (List.mem_filter.mpr ⟨present, survives record present deleted⟩) retained))
      instanceId reachable
    exact classified.resolve_left outside

/-- A disconnected component contributes fuel but no reachable member; removing it uses the
retained graph's own bound, including when the retained component is a multi-edge chain. -/
theorem processInstanceClosureWithin_append_disconnected
    (records disconnected : List CalledProcessOccurrence) (seed : List SemanticId)
    (unique : seed.Nodup)
    (separated : ∀ record ∈ disconnected, record.caller.processInstanceId ∉
      processInstanceClosureWithin records seed (records.length + 1)) (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin (records ++ disconnected) seed
      ((records ++ disconnected).length + 1) ↔
    instanceId ∈ processInstanceClosureWithin records seed (records.length + 1) := by
  constructor
  · exact processInstanceClosureWithin_least (records ++ disconnected) seed _
      (fun value => value ∈ processInstanceClosureWithin records seed (records.length + 1))
      (fun _ member => processInstanceClosureWithin_seed_subset _ _ _ member)
      (by
        intro record present caller
        rcases List.mem_append.mp present with retained | detached
        · exact processInstanceClosureWithin_closed records seed unique record retained caller
        · exact False.elim (separated record detached caller)) instanceId
  · intro member
    exact processInstanceClosureWithin_fuel_mono (records ++ disconnected) seed
      (records.length + 1) ((records ++ disconnected).length + 1) (by simp)
      (processInstanceClosureWithin_mono records (records ++ disconnected) seed seed _
        (fun _ present => List.mem_append_left _ present) (List.Subset.refl _) unique member)

/-- Reversed storage still reaches the third edge, while one expansion cannot do so. -/
theorem processInstanceClosureWithin_three_edge_fuel
    (first second third : CalledProcessOccurrence)
    (secondCaller : second.caller.processInstanceId = first.calledRoot.processInstanceId)
    (thirdCaller : third.caller.processInstanceId = second.calledRoot.processInstanceId)
    (firstFresh : first.calledRoot.processInstanceId ≠ first.caller.processInstanceId)
    (secondFresh : second.calledRoot.processInstanceId ≠ first.caller.processInstanceId)
    (thirdFresh : third.calledRoot.processInstanceId ≠ first.caller.processInstanceId)
    (thirdDifferent : third.calledRoot.processInstanceId ≠ first.calledRoot.processInstanceId) :
    third.calledRoot.processInstanceId ∉
      processInstanceClosureWithin [third, second, first] [first.caller.processInstanceId] 1 ∧
    third.calledRoot.processInstanceId ∈
      processInstanceClosureWithin [third, second, first] [first.caller.processInstanceId]
        ([third, second, first].length + 1) := by
  constructor
  · rw [processInstanceClosureWithin_one]
    simp [secondCaller, thirdCaller, firstFresh, secondFresh, thirdFresh, Ne.symm thirdDifferent]
  · have firstReached := processInstanceClosureWithin_closed [third, second, first]
      [first.caller.processInstanceId] (by simp) first (by simp)
      (processInstanceClosureWithin_seed_subset _ _ _ (by simp))
    have secondReached := processInstanceClosureWithin_closed [third, second, first]
      [first.caller.processInstanceId] (by simp) second (by simp)
      (secondCaller ▸ firstReached)
    exact processInstanceClosureWithin_closed _ _ (by simp) third (by simp)
      (thirdCaller ▸ secondReached)

/-- A Call edge never makes its caller reachable from the called instance alone. -/
theorem processInstanceClosureWithin_no_backward (record : CalledProcessOccurrence)
    (distinct : record.caller.processInstanceId ≠ record.calledRoot.processInstanceId)
    (fuel : Nat) :
    record.caller.processInstanceId ∉
      processInstanceClosureWithin [record] [record.calledRoot.processInstanceId] fuel := by
  intro member
  have same := processInstanceClosureWithin_least [record] [record.calledRoot.processInstanceId]
    fuel (fun value => value = record.calledRoot.processInstanceId)
    (by simp) (by intro candidate present _; simp only [List.mem_singleton] at present; simp [present]) _ member
  exact distinct same

end BpmnSemantics.SemanticProcess
