import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! # Exact parent ancestry

The unchanged parent walker reaches the least directed parent closure. Its population bound is
derived from strict growth of reached live IDs, so cycles require no acyclicity assumption.
-/

namespace BpmnSemantics.SemanticProcess

def ScopeParentEdge (occurrences : List RuntimeScopeOccurrence)
    (parent child : ScopeOccurrenceId) : Prop :=
  ∃ occurrence ∈ occurrences, occurrence.parent = some parent ∧ occurrence.id = child

def ScopeParentsLive (occurrences : List RuntimeScopeOccurrence) : Prop :=
  ∀ occurrence ∈ occurrences, ∀ parent, occurrence.parent = some parent →
    parent ∈ occurrences.map (·.id)

theorem occurrence_find_exact (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup)
    (occurrence : RuntimeScopeOccurrence) (present : occurrence ∈ occurrences) :
    (occurrences.find? fun value => decide (value.id = occurrence.id)) = some occurrence := by
  induction occurrences with
  | nil => simp at present
  | cons head tail ih =>
      obtain ⟨fresh, tailUnique⟩ := List.nodup_cons.mp unique
      rcases List.mem_cons.mp present with same | member
      · simp [same]
      · have different : head.id ≠ occurrence.id := by
          intro same
          exact fresh (List.mem_map.mpr ⟨occurrence, member, same.symm⟩)
        simpa [different] using ih tailUnique member

theorem occurrenceParent_of_mem (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup)
    (occurrence : RuntimeScopeOccurrence) (present : occurrence ∈ occurrences) :
    occurrenceParent? occurrences occurrence.id = occurrence.parent := by
  simp [occurrenceParent?, occurrence_find_exact occurrences unique occurrence present]

theorem occurrenceParent_some_edge (occurrences : List RuntimeScopeOccurrence)
    (child parent : ScopeOccurrenceId) (found : occurrenceParent? occurrences child = some parent) :
    ScopeParentEdge occurrences parent child := by
  unfold occurrenceParent? at found
  cases selected : occurrences.find? (fun occurrence => decide (occurrence.id = child)) with
  | none => simp [selected] at found
  | some occurrence =>
      exact ⟨occurrence, List.mem_of_find?_eq_some selected, by simpa [selected] using found,
        by simpa using List.find?_some selected⟩

theorem occurrenceParent_iff_edge (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (child parent : ScopeOccurrenceId) :
    occurrenceParent? occurrences child = some parent ↔ ScopeParentEdge occurrences parent child := by
  constructor
  · exact occurrenceParent_some_edge occurrences child parent
  · rintro ⟨occurrence, present, edge, rfl⟩
    rw [occurrenceParent_of_mem occurrences unique occurrence present, edge]

theorem occurrenceInSubtreeWithin_one (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) :
    occurrenceInSubtreeWithin occurrences root candidate 1 = decide (candidate = root) := by
  by_cases same : candidate = root <;> simp [occurrenceInSubtreeWithin, same]
  split <;> rfl

theorem occurrenceInSubtreeWithin_reflexive (occurrences : List RuntimeScopeOccurrence)
    (root : ScopeOccurrenceId) (fuel : Nat) :
    occurrenceInSubtreeWithin occurrences root root (fuel + 1) = true := by
  simp [occurrenceInSubtreeWithin]

theorem occurrenceInSubtreeWithin_fuel_mono (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) (small large : Nat) (bounded : small ≤ large) :
    occurrenceInSubtreeWithin occurrences root candidate small = true →
      occurrenceInSubtreeWithin occurrences root candidate large = true := by
  induction small generalizing candidate large with
  | zero => simp [occurrenceInSubtreeWithin]
  | succ small ih =>
      cases large with
      | zero => omega
      | succ large =>
          simp only [occurrenceInSubtreeWithin]
          split
          · exact id
          · split
            · exact ih _ _ (by omega)
            · exact id

theorem occurrenceInSubtreeWithin_least (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) (fuel : Nat) (target : ScopeOccurrenceId → Prop)
    (seed : target root)
    (closed : ∀ parent child, target parent → ScopeParentEdge occurrences parent child → target child) :
    occurrenceInSubtreeWithin occurrences root candidate fuel = true → target candidate := by
  induction fuel generalizing candidate with
  | zero => simp [occurrenceInSubtreeWithin]
  | succ fuel ih =>
      simp only [occurrenceInSubtreeWithin]
      split
      · next same => exact fun _ => same ▸ seed
      · split
        · next parent found =>
            exact fun reached => closed parent candidate (ih parent reached)
              (occurrenceParent_some_edge occurrences candidate parent found)
        · simp

private abbrev reached (occurrences : List RuntimeScopeOccurrence) (root : ScopeOccurrenceId)
    (fuel : Nat) : List ScopeOccurrenceId :=
  (occurrences.map (·.id)).filter fun value => occurrenceInSubtreeWithin occurrences root value fuel

private abbrev stable (occurrences : List RuntimeScopeOccurrence) (root : ScopeOccurrenceId)
    (fuel : Nat) : Prop :=
  ∀ candidate ∈ occurrences.map (·.id),
    occurrenceInSubtreeWithin occurrences root candidate (fuel + 1) = true →
      occurrenceInSubtreeWithin occurrences root candidate fuel = true

private theorem reached_mono (occurrences : List RuntimeScopeOccurrence) (root : ScopeOccurrenceId)
    (fuel : Nat) : reached occurrences root fuel ⊆ reached occurrences root (fuel + 1) := by
  intro candidate member
  obtain ⟨live, success⟩ := List.mem_filter.mp member
  exact List.mem_filter.mpr ⟨live, occurrenceInSubtreeWithin_fuel_mono _ _ _ _ _ (by omega) success⟩

private theorem stable_succ (occurrences : List RuntimeScopeOccurrence)
    (parents : ScopeParentsLive occurrences) (root : ScopeOccurrenceId) (fuel : Nat)
    (fixed : stable occurrences root fuel) : stable occurrences root (fuel + 1) := by
  intro candidate _ success
  rw [occurrenceInSubtreeWithin] at success ⊢
  by_cases same : candidate = root
  · simp [same]
  · simp only [same, ↓reduceIte] at success ⊢
    cases found : occurrenceParent? occurrences candidate with
    | some parent =>
        obtain ⟨occurrence, present, edge, _⟩ := occurrenceParent_some_edge _ _ _ found
        simp only [found] at success ⊢
        exact fixed parent (parents occurrence present parent edge) success
    | none => simp [found] at success

private theorem nodup_length_le (left right : List ScopeOccurrenceId)
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
      have positive := List.length_pos_of_mem present
      simp only [List.length_cons]
      omega

private theorem reverse_subset_of_length_eq {left right : List ScopeOccurrenceId}
    (unique : left.Nodup) (included : left ⊆ right)
    (sameLength : left.length = right.length) : right ⊆ left := by
  intro value member
  by_cases present : value ∈ left
  · exact present
  · have larger := nodup_length_le (value :: left) right
      (List.nodup_cons.mpr ⟨present, unique⟩)
      (by intro candidate inCons; rcases List.mem_cons.mp inCons with same | old
          · exact same ▸ member
          · exact included old)
    simp only [List.length_cons] at larger
    omega

private theorem stable_or_growth (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root : ScopeOccurrenceId) (fuel : Nat) :
    stable occurrences root fuel ∨ fuel ≤ (reached occurrences root fuel).length := by
  induction fuel with
  | zero => exact .inr (by omega)
  | succ fuel ih =>
      by_cases fixed : stable occurrences root fuel
      · exact .inl (stable_succ occurrences parents root fuel fixed)
      · have growth : (reached occurrences root fuel).length <
            (reached occurrences root (fuel + 1)).length := by
          have weak := nodup_length_le (reached occurrences root fuel)
            (reached occurrences root (fuel + 1)) (unique.filter _) (reached_mono occurrences root fuel)
          have unequal : (reached occurrences root fuel).length ≠
              (reached occurrences root (fuel + 1)).length := by
            intro same
            have back := reverse_subset_of_length_eq (unique.filter _)
              (reached_mono occurrences root fuel) same
            apply fixed
            intro candidate live success
            exact (List.mem_filter.mp (back (List.mem_filter.mpr ⟨live, success⟩))).2
          omega
        rcases ih with closed | large
        · exact False.elim (fixed closed)
        · exact .inr (by omega)

private theorem population_stable (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root : ScopeOccurrenceId) : stable occurrences root (occurrences.length + 1) := by
  rcases stable_or_growth occurrences unique parents root (occurrences.length + 1) with fixed | large
  · exact fixed
  · have bounded := List.length_filter_le
      (fun value => occurrenceInSubtreeWithin occurrences root value (occurrences.length + 1))
      (occurrences.map (·.id))
    simp only [List.length_map] at bounded
    change occurrences.length + 1 ≤
      ((occurrences.map (·.id)).filter fun value =>
        occurrenceInSubtreeWithin occurrences root value (occurrences.length + 1)).length at large
    omega

theorem occurrenceInSubtree_reflexive (occurrences : List RuntimeScopeOccurrence)
    (root : ScopeOccurrenceId) : occurrenceInSubtree occurrences root root = true :=
  occurrenceInSubtreeWithin_reflexive occurrences root occurrences.length

/-- The exact population bound is sufficient for every directed parent edge, including cycles. -/
theorem occurrenceInSubtree_closed (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root parent child : ScopeOccurrenceId) (reachedParent : occurrenceInSubtree occurrences root parent = true)
    (edge : ScopeParentEdge occurrences parent child) : occurrenceInSubtree occurrences root child = true := by
  have found := (occurrenceParent_iff_edge occurrences unique child parent).mpr edge
  obtain ⟨occurrence, present, _, same⟩ := edge
  apply population_stable occurrences unique parents root child
    (List.mem_map.mpr ⟨occurrence, present, same⟩)
  by_cases atRoot : child = root
  · simp [occurrenceInSubtreeWithin, atRoot]
  · rw [occurrenceInSubtreeWithin]
    simpa only [atRoot, ↓reduceIte, found, occurrenceInSubtree] using reachedParent

/-- Full-fuel membership is exactly the least root-containing, parent-to-child closed set. -/
theorem occurrenceInSubtree_iff_least (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root candidate : ScopeOccurrenceId) :
    occurrenceInSubtree occurrences root candidate = true ↔
      ∀ target : ScopeOccurrenceId → Prop, target root →
        (∀ parent child, target parent → ScopeParentEdge occurrences parent child → target child) →
        target candidate := by
  constructor
  · intro member target seed closed
    exact occurrenceInSubtreeWithin_least occurrences root candidate _ target seed closed member
  · intro least
    exact least (fun value => occurrenceInSubtree occurrences root value = true)
      (occurrenceInSubtree_reflexive occurrences root)
      (occurrenceInSubtree_closed occurrences unique parents root)

/-- A finite derivation contains only the seed and forward exact-parent steps. -/
inductive ScopeAncestry (occurrences : List RuntimeScopeOccurrence) (root : ScopeOccurrenceId) :
    ScopeOccurrenceId → Prop where
  | seed : ScopeAncestry occurrences root root
  | child {parent child : ScopeOccurrenceId} : ScopeAncestry occurrences root parent →
      ScopeParentEdge occurrences parent child → ScopeAncestry occurrences root child

theorem occurrenceInSubtreeWithin_ancestry (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) (fuel : Nat)
    (success : occurrenceInSubtreeWithin occurrences root candidate fuel = true) :
    ScopeAncestry occurrences root candidate :=
  occurrenceInSubtreeWithin_least occurrences root candidate fuel (ScopeAncestry occurrences root)
    .seed (fun _ _ parent edge => .child parent edge) success

theorem occurrenceInSubtree_iff_ancestry (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root candidate : ScopeOccurrenceId) :
    occurrenceInSubtree occurrences root candidate = true ↔ ScopeAncestry occurrences root candidate := by
  constructor
  · exact occurrenceInSubtreeWithin_ancestry occurrences root candidate _
  · intro derivation
    induction derivation with
    | seed => exact occurrenceInSubtree_reflexive occurrences root
    | child _ edge ih => exact occurrenceInSubtree_closed occurrences unique parents root _ _ ih edge

/-- Any successful finite walk already succeeds at the evaluator's unchanged population bound. -/
theorem occurrenceInSubtreeWithin_population_bound (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root candidate : ScopeOccurrenceId) (fuel : Nat)
    (success : occurrenceInSubtreeWithin occurrences root candidate fuel = true) :
    occurrenceInSubtreeWithin occurrences root candidate (occurrences.length + 1) = true :=
  (occurrenceInSubtree_iff_ancestry occurrences unique parents root candidate).mpr
    (occurrenceInSubtreeWithin_ancestry occurrences root candidate fuel success)

theorem occurrenceInSubtree_trans (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (root middle candidate : ScopeOccurrenceId)
    (first : occurrenceInSubtree occurrences root middle = true)
    (second : occurrenceInSubtree occurrences middle candidate = true) :
    occurrenceInSubtree occurrences root candidate = true :=
  occurrenceInSubtreeWithin_least occurrences middle candidate _
    (fun value => occurrenceInSubtree occurrences root value = true) first
    (occurrenceInSubtree_closed occurrences unique parents root) second

theorem occurrenceInSubtree_live (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) (rootLive : root ∈ occurrences.map (·.id))
    (success : occurrenceInSubtree occurrences root candidate = true) :
    candidate ∈ occurrences.map (·.id) :=
  occurrenceInSubtreeWithin_least occurrences root candidate _
    (fun value => value ∈ occurrences.map (·.id)) rootLive
    (by rintro parent child _ ⟨occurrence, present, _, same⟩
        exact List.mem_map.mpr ⟨occurrence, present, same⟩) success

/-- Restriction preserves each derivation when all of its reachable forward edges survive. -/
theorem ScopeAncestry.restrict (original retained : List RuntimeScopeOccurrence)
    (root : ScopeOccurrenceId)
    (included : ∀ parent child, ScopeParentEdge retained parent child → ScopeParentEdge original parent child)
    (survives : ∀ parent child, ScopeAncestry original root parent →
      ScopeParentEdge original parent child → ScopeParentEdge retained parent child)
    (candidate : ScopeOccurrenceId) :
    ScopeAncestry retained root candidate ↔ ScopeAncestry original root candidate := by
  constructor
  · intro derivation
    induction derivation with
    | seed => exact .seed
    | child _ edge ih => exact .child ih (included _ _ edge)
  · intro derivation
    induction derivation with
    | seed => exact .seed
    | child parent edge ih => exact .child ih (survives _ _ parent edge)

/-- Deleting an unrelated region changes the fuel independently in both evaluators. The survival
condition concerns finite parent derivations, never an assumed equality of computed answers. -/
theorem occurrenceInSubtree_restrict (original retained : List RuntimeScopeOccurrence)
    (originalUnique : (original.map (·.id)).Nodup) (originalParents : ScopeParentsLive original)
    (retainedUnique : (retained.map (·.id)).Nodup) (retainedParents : ScopeParentsLive retained)
    (root candidate : ScopeOccurrenceId)
    (included : ∀ parent child, ScopeParentEdge retained parent child → ScopeParentEdge original parent child)
    (survives : ∀ parent child, ScopeAncestry original root parent →
      ScopeParentEdge original parent child → ScopeParentEdge retained parent child) :
    occurrenceInSubtree retained root candidate = occurrenceInSubtree original root candidate := by
  apply Bool.eq_iff_iff.mpr
  rw [occurrenceInSubtree_iff_ancestry retained retainedUnique retainedParents,
    occurrenceInSubtree_iff_ancestry original originalUnique originalParents]
  exact ScopeAncestry.restrict original retained root included survives candidate

private theorem filter_unique (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (keep : RuntimeScopeOccurrence → Bool) :
    ((occurrences.filter keep).map (·.id)).Nodup := by
  induction occurrences with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, tailUnique⟩ := List.nodup_cons.mp unique
      by_cases kept : keep head = true
      · simp only [List.filter_cons, kept, ↓reduceIte, List.map_cons, List.nodup_cons]
        refine ⟨?_, ih tailUnique⟩
        rintro member
        obtain ⟨occurrence, present, same⟩ := List.mem_map.mp member
        exact fresh (List.mem_map.mpr ⟨occurrence, (List.mem_filter.mp present).1, same⟩)
      · simpa [kept] using ih tailUnique

theorem occurrenceInSubtree_filter (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (parents : ScopeParentsLive occurrences)
    (keep : RuntimeScopeOccurrence → Bool) (retainedParents : ScopeParentsLive (occurrences.filter keep))
    (root candidate : ScopeOccurrenceId)
    (survives : ∀ occurrence ∈ occurrences, ∀ parent, occurrence.parent = some parent →
      ScopeAncestry occurrences root parent → keep occurrence = true) :
    occurrenceInSubtree (occurrences.filter keep) root candidate =
      occurrenceInSubtree occurrences root candidate := by
  apply occurrenceInSubtree_restrict occurrences (occurrences.filter keep) unique parents
    (filter_unique occurrences unique keep) retainedParents root candidate
  · rintro parent child ⟨occurrence, present, edge, same⟩
    exact ⟨occurrence, (List.mem_filter.mp present).1, edge, same⟩
  · rintro parent child reachedParent ⟨occurrence, present, edge, same⟩
    exact ⟨occurrence, List.mem_filter.mpr
      ⟨present, survives occurrence present parent edge reachedParent⟩, edge, same⟩

/-- A disconnected component adds population fuel but cannot add a parent derivation. -/
theorem occurrenceInSubtree_append_disconnected (retained disconnected : List RuntimeScopeOccurrence)
    (unique : ((retained ++ disconnected).map (·.id)).Nodup)
    (parents : ScopeParentsLive (retained ++ disconnected))
    (retainedParents : ScopeParentsLive retained) (root candidate : ScopeOccurrenceId)
    (separated : ∀ occurrence ∈ disconnected, ∀ parent, occurrence.parent = some parent →
      ¬ScopeAncestry retained root parent) :
    occurrenceInSubtree (retained ++ disconnected) root candidate =
      occurrenceInSubtree retained root candidate := by
  have retainedUnique : (retained.map (·.id)).Nodup :=
    (List.nodup_append.mp (by simpa only [List.map_append] using unique)).1
  have included : ∀ parent child, ScopeParentEdge retained parent child →
      ScopeParentEdge (retained ++ disconnected) parent child := by
    rintro parent child ⟨occurrence, present, edge, same⟩
    exact ⟨occurrence, List.mem_append_left _ present, edge, same⟩
  have back : ∀ value, ScopeAncestry (retained ++ disconnected) root value →
      ScopeAncestry retained root value := by
    intro value derivation
    induction derivation with
    | seed => exact .seed
    | child _ edge ih =>
        obtain ⟨occurrence, present, parent, same⟩ := edge
        rcases List.mem_append.mp present with kept | detached
        · exact .child ih ⟨occurrence, kept, parent, same⟩
        · exact False.elim (separated occurrence detached _ parent ih)
  symm
  apply occurrenceInSubtree_restrict (retained ++ disconnected) retained unique parents
    retainedUnique retainedParents root candidate included
  rintro parent child reachedParent ⟨occurrence, present, edge, same⟩
  rcases List.mem_append.mp present with kept | detached
  · exact ⟨occurrence, kept, edge, same⟩
  · exact False.elim (separated occurrence detached parent edge (back parent reachedParent))

/-- Reversed storage cannot collapse a two-edge path into a one-fuel success. -/
theorem occurrenceInSubtree_reversed_three_level (root child grandchild : RuntimeScopeOccurrence)
    (unique : ([grandchild, child, root].map (·.id)).Nodup)
    (rootParent : root.parent = none) (childParent : child.parent = some root.id)
    (grandchildParent : grandchild.parent = some child.id)
    (different : grandchild.id ≠ root.id) :
    occurrenceInSubtreeWithin [grandchild, child, root] root.id grandchild.id 1 = false ∧
      occurrenceInSubtree [grandchild, child, root] root.id grandchild.id = true := by
  have parents : ScopeParentsLive [grandchild, child, root] := by
    intro occurrence present parent edge
    simp only [List.mem_cons, List.not_mem_nil, or_false] at present
    rcases present with rfl | rfl | rfl <;> simp_all
  constructor
  · simp [occurrenceInSubtreeWithin_one, different]
  · have childReached := occurrenceInSubtree_closed [grandchild, child, root] unique parents
      root.id root.id child.id (occurrenceInSubtree_reflexive _ _)
      ⟨child, by simp, childParent, rfl⟩
    exact occurrenceInSubtree_closed _ unique parents root.id child.id grandchild.id childReached
      ⟨grandchild, by simp, grandchildParent, rfl⟩

theorem occurrenceInSubtreeWithin_parentless (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) (different : candidate ≠ root)
    (parentless : occurrenceParent? occurrences candidate = none) (fuel : Nat) :
    occurrenceInSubtreeWithin occurrences root candidate fuel = false := by
  cases fuel <;> simp [occurrenceInSubtreeWithin, different, parentless]

/-- A child seed never reaches its parent through a backward traversal. -/
theorem occurrenceInSubtree_no_backward (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (root child : RuntimeScopeOccurrence)
    (rootPresent : root ∈ occurrences) (rootParent : root.parent = none)
    (different : root.id ≠ child.id) : occurrenceInSubtree occurrences child.id root.id = false :=
  occurrenceInSubtreeWithin_parentless occurrences child.id root.id different
    (by rw [occurrenceParent_of_mem occurrences unique root rootPresent, rootParent]) _

/-- Reusing a definition never merges distinct complete occurrence activations. -/
theorem occurrenceInSubtree_distinct_activation (occurrences : List RuntimeScopeOccurrence)
    (unique : (occurrences.map (·.id)).Nodup) (root candidate : RuntimeScopeOccurrence)
    (present : candidate ∈ occurrences) (parentless : candidate.parent = none)
    (different : candidate.id.activation ≠ root.id.activation) :
    occurrenceInSubtree occurrences root.id candidate.id = false :=
  occurrenceInSubtreeWithin_parentless occurrences root.id candidate.id
    (fun same => different (congrArg ScopeOccurrenceId.activation same))
    (by rw [occurrenceParent_of_mem occurrences unique candidate present, parentless]) _

/-- A closed two-cycle outside the root remains unsuccessful at every fuel bound. -/
theorem occurrenceInSubtreeWithin_cycle_excluded (occurrences : List RuntimeScopeOccurrence)
    (root left right : ScopeOccurrenceId)
    (leftParent : occurrenceParent? occurrences left = some right)
    (rightParent : occurrenceParent? occurrences right = some left)
    (leftDifferent : left ≠ root) (rightDifferent : right ≠ root) (fuel : Nat) :
    occurrenceInSubtreeWithin occurrences root left fuel = false ∧
      occurrenceInSubtreeWithin occurrences root right fuel = false := by
  induction fuel with
  | zero => simp [occurrenceInSubtreeWithin]
  | succ fuel ih =>
      constructor
      · rw [occurrenceInSubtreeWithin]
        simpa only [leftDifferent, ↓reduceIte, leftParent] using ih.2
      · rw [occurrenceInSubtreeWithin]
        simpa only [rightDifferent, ↓reduceIte, rightParent] using ih.1

end BpmnSemantics.SemanticProcess
