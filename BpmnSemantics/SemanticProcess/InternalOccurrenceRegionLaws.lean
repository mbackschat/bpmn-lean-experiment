import BpmnSemantics.SemanticProcess.InternalCommutationRegion
import BpmnSemantics.SemanticProcess.ScopeStorageOrder

/-! # Directed occurrence-region closure laws

The existing occurrence-count evaluator computes the least parent/forward-Call closure. These
laws concern predecessor graph membership, not agreement with a transition's removal algorithm.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

private theorem sortInsert_perm (before : α → α → Bool) (value : α) (values : List α) :
    (sortInsertBy before value values).Perm (value :: values) := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [sortInsertBy]
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons head ih).trans (List.Perm.swap value head tail)

private theorem sort_perm (before : α → α → Bool) (values : List α) :
    (sortBy before values).Perm values := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      exact (sortInsert_perm before head _).trans (List.Perm.cons head ih)

private theorem eraseDups_unique (values : List ScopeOccurrenceId) : values.eraseDups.Nodup := by
  cases values with
  | nil => simp
  | cons head tail =>
      rw [List.eraseDups_cons, List.nodup_cons]
      exact ⟨by simp, eraseDups_unique _⟩
termination_by values.length
decreasing_by have := List.length_filter_le (fun b => !b == head) tail; simp_all; omega

theorem canonicalScopeMembers_mem (members : List ScopeOccurrenceId) (value : ScopeOccurrenceId) :
    value ∈ canonicalScopeMembers members ↔ value ∈ members := by
  simp [canonicalScopeMembers, mem_sortBy]

theorem canonicalScopeMembers_nodup (members : List ScopeOccurrenceId) :
    (canonicalScopeMembers members).Nodup :=
  (sort_perm scopeBefore members.eraseDups).nodup_iff.mpr (eraseDups_unique members)

theorem canonicalScopeMembers_length (members : List ScopeOccurrenceId) :
    (canonicalScopeMembers members).length = members.eraseDups.length :=
  (sort_perm scopeBefore members.eraseDups).length_eq

theorem scopeBefore_eq_scopeOwnerBefore (left right : ScopeOccurrenceId) :
    scopeBefore left right = scopeOwnerBefore left right := by
  rcases left with ⟨⟨leftInstance⟩, ⟨leftScope⟩, leftActivation⟩
  rcases right with ⟨⟨rightInstance⟩, ⟨rightScope⟩, rightActivation⟩
  simp [scopeBefore, scopeOwnerBefore]

private theorem sortScopeInsert_pairwise (value : ScopeOccurrenceId) (values : List ScopeOccurrenceId)
    (ordered : values.Pairwise (fun left right => scopeOwnerBefore right left = false)) :
    (sortInsertBy scopeBefore value values).Pairwise
      (fun left right => scopeOwnerBefore right left = false) := by
  induction values with
  | nil => simp [sortInsertBy]
  | cons head tail ih =>
      obtain ⟨headOrder, tailOrder⟩ := List.pairwise_cons.mp ordered
      simp only [sortInsertBy, scopeBefore_eq_scopeOwnerBefore]
      split
      · next before =>
          apply List.pairwise_cons.mpr
          refine ⟨?_, List.pairwise_cons.mpr ⟨headOrder, tailOrder⟩⟩
          intro member present
          have headBefore := scopeOwnerBefore_asymm value head before
          rcases List.mem_cons.mp present with same | inTail
          · exact same ▸ headBefore
          · exact scopeOwnerBefore_compose value head member headBefore (headOrder member inTail)
      · next after =>
          apply List.pairwise_cons.mpr
          refine ⟨?_, ih tailOrder⟩
          intro member present
          rcases (mem_sortInsertBy scopeBefore member value tail).mp present with same | inTail
          · simpa only [same, Bool.not_eq_true] using after
          · exact headOrder member inTail

private theorem sortScope_pairwise (values : List ScopeOccurrenceId) :
    (sortBy scopeBefore values).Pairwise (fun left right => scopeOwnerBefore right left = false) := by
  induction values with
  | nil => simp [sortBy]
  | cons head tail ih => exact sortScopeInsert_pairwise head _ ih

theorem canonicalScopeMembers_pairwise (values : List ScopeOccurrenceId) :
    (canonicalScopeMembers values).Pairwise (fun left right => scopeOwnerBefore right left = false) :=
  sortScope_pairwise _

private theorem scope_members_eq_of_canonical (left right : List ScopeOccurrenceId)
    (leftUnique : left.Nodup) (rightUnique : right.Nodup)
    (leftOrder : left.Pairwise (fun a b => scopeOwnerBefore b a = false))
    (rightOrder : right.Pairwise (fun a b => scopeOwnerBefore b a = false))
    (sameMembers : ∀ value, value ∈ left ↔ value ∈ right) : left = right := by
  have permutation : left.Perm right := List.perm_iff_count.mpr (fun value => by
    simp only [leftUnique.count, rightUnique.count, sameMembers value])
  apply List.Perm.eq_of_pairwise (le := fun a b => scopeOwnerBefore b a = false)
    ?_ leftOrder rightOrder permutation
  intro a b _ _ forward backward
  by_cases same : a = b
  · exact same
  · rcases scopeOwnerBefore_comparable a b same with before | after
    · simp [backward] at before
    · simp [forward] at after

/-- Canonical membership determines literal stored order, using the shared complete scope-owner key. -/
theorem canonicalScopeMembers_eq_of_mem (left right : List ScopeOccurrenceId)
    (sameMembers : ∀ value, value ∈ left ↔ value ∈ right) :
    canonicalScopeMembers left = canonicalScopeMembers right :=
  scope_members_eq_of_canonical _ _ (canonicalScopeMembers_nodup _) (canonicalScopeMembers_nodup _)
    (canonicalScopeMembers_pairwise _) (canonicalScopeMembers_pairwise _)
    (fun value => by simp only [canonicalScopeMembers_mem, sameMembers value])

/-- The two ownership edges are directed; neither parent nor caller is recovered backwards. -/
def OccurrenceRegionEdge (state : RuntimeState) (source target : ScopeOccurrenceId) : Prop :=
  (∃ occurrence ∈ state.scopeOccurrences,
    occurrence.parent = some source ∧ occurrence.id = target) ∨
  (∃ record ∈ state.calledProcessOccurrences,
    record.caller = source ∧ record.calledRoot = target)

theorem expandOccurrenceRegionMembers_mem (state : RuntimeState)
    (members : List ScopeOccurrenceId) (value : ScopeOccurrenceId) :
    value ∈ expandOccurrenceRegionMembers state members ↔ value ∈ members ∨
      ∃ source ∈ members, OccurrenceRegionEdge state source value := by
  simp only [expandOccurrenceRegionMembers, canonicalScopeMembers_mem, List.mem_append,
    List.mem_filterMap]
  constructor
  · rintro ((old | ⟨occurrence, present, reached⟩) | ⟨record, present, reached⟩)
    · exact .inl old
    · right
      cases parent : occurrence.parent with
      | none => simp [parent] at reached
      | some source =>
          by_cases member : source ∈ members
          · simp [parent, member] at reached
            exact ⟨source, member, .inl ⟨occurrence, present, parent, reached⟩⟩
          · simp [parent, member] at reached
    · right
      by_cases member : record.caller ∈ members
      · simp [member] at reached
        exact ⟨record.caller, member, .inr ⟨record, present, rfl, reached⟩⟩
      · simp [member] at reached
  · rintro (old | ⟨source, member, edge⟩)
    · exact .inl (.inl old)
    · rcases edge with ⟨occurrence, present, parent, target⟩ | ⟨record, present, caller, target⟩
      · exact .inl (.inr ⟨occurrence, present, by simp [parent, member, target]⟩)
      · exact .inr ⟨record, present, by simp [caller, member, target]⟩

private theorem seed_subset_expand (state : RuntimeState) (members : List ScopeOccurrenceId) :
    members ⊆ expandOccurrenceRegionMembers state members := by
  intro value member
  exact (expandOccurrenceRegionMembers_mem _ _ _).mpr (.inl member)

private theorem expand_nodup (state : RuntimeState) (members : List ScopeOccurrenceId) :
    (expandOccurrenceRegionMembers state members).Nodup := canonicalScopeMembers_nodup _

private theorem expand_mono (state : RuntimeState) (left right : List ScopeOccurrenceId)
    (included : left ⊆ right) :
    expandOccurrenceRegionMembers state left ⊆ expandOccurrenceRegionMembers state right := by
  intro value member
  rcases (expandOccurrenceRegionMembers_mem _ _ _).mp member with old | ⟨source, present, edge⟩
  · exact (expandOccurrenceRegionMembers_mem _ _ _).mpr (.inl (included old))
  · exact (expandOccurrenceRegionMembers_mem _ _ _).mpr (.inr ⟨source, included present, edge⟩)

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

theorem canonicalScopeMembers_length_of_nodup (members : List ScopeOccurrenceId)
    (unique : members.Nodup) : (canonicalScopeMembers members).length = members.length := by
  apply Nat.le_antisymm
  · exact nodup_length_le _ _ (canonicalScopeMembers_nodup members)
      (fun _ member => (canonicalScopeMembers_mem _ _).mp member)
  · exact nodup_length_le _ _ unique (fun _ member => (canonicalScopeMembers_mem _ _).mpr member)

theorem occurrenceRegionMembersWithin_seed_subset
    (state : RuntimeState) (seed : List ScopeOccurrenceId) (fuel : Nat) :
    seed ⊆ occurrenceRegionMembersWithin state seed fuel := by
  induction fuel generalizing seed with
  | zero => exact fun _ member => (canonicalScopeMembers_mem _ _).mpr member
  | succ fuel ih =>
      change seed ⊆ if (expandOccurrenceRegionMembers state seed).length = seed.length then _ else _
      split
      · exact seed_subset_expand _ _
      · exact (seed_subset_expand _ _).trans (ih _)

theorem occurrenceRegionMembersWithin_nodup
    (state : RuntimeState) (seed : List ScopeOccurrenceId) (fuel : Nat) :
    (occurrenceRegionMembersWithin state seed fuel).Nodup := by
  induction fuel generalizing seed with
  | zero => exact canonicalScopeMembers_nodup _
  | succ fuel ih =>
      change (if (expandOccurrenceRegionMembers state seed).length = seed.length
        then expandOccurrenceRegionMembers state seed
        else occurrenceRegionMembersWithin state (expandOccurrenceRegionMembers state seed) fuel).Nodup
      split
      · exact expand_nodup _ _
      · exact ih _

theorem occurrenceRegionMembersWithin_pairwise
    (state : RuntimeState) (seed : List ScopeOccurrenceId) (fuel : Nat) :
    (occurrenceRegionMembersWithin state seed fuel).Pairwise
      (fun left right => scopeOwnerBefore right left = false) := by
  induction fuel generalizing seed with
  | zero => exact canonicalScopeMembers_pairwise _
  | succ fuel ih =>
      change (if (expandOccurrenceRegionMembers state seed).length = seed.length
        then expandOccurrenceRegionMembers state seed
        else occurrenceRegionMembersWithin state (expandOccurrenceRegionMembers state seed) fuel).Pairwise _
      split
      · exact canonicalScopeMembers_pairwise _
      · exact ih _

theorem occurrenceRegionMembersWithin_eq_of_mem
    (left right : RuntimeState) (leftSeed rightSeed : List ScopeOccurrenceId) (leftFuel rightFuel : Nat)
    (sameMembers : ∀ value, value ∈ occurrenceRegionMembersWithin left leftSeed leftFuel ↔
      value ∈ occurrenceRegionMembersWithin right rightSeed rightFuel) :
    occurrenceRegionMembersWithin left leftSeed leftFuel = occurrenceRegionMembersWithin right rightSeed rightFuel :=
  scope_members_eq_of_canonical _ _ (occurrenceRegionMembersWithin_nodup _ _ _)
    (occurrenceRegionMembersWithin_nodup _ _ _) (occurrenceRegionMembersWithin_pairwise _ _ _)
    (occurrenceRegionMembersWithin_pairwise _ _ _) sameMembers

/-- Every finite traversal stays in every seed-containing predicate closed under the two edges. -/
theorem occurrenceRegionMembersWithin_least
    (state : RuntimeState) (seed : List ScopeOccurrenceId) (fuel : Nat)
    (target : ScopeOccurrenceId → Prop) (seeds : ∀ value ∈ seed, target value)
    (closed : ∀ source destination, target source →
      OccurrenceRegionEdge state source destination → target destination) :
    ∀ value ∈ occurrenceRegionMembersWithin state seed fuel, target value := by
  induction fuel generalizing seed with
  | zero => exact fun value member => seeds value ((canonicalScopeMembers_mem _ _).mp member)
  | succ fuel ih =>
      have expanded : ∀ value ∈ expandOccurrenceRegionMembers state seed, target value := by
        intro value member
        rcases (expandOccurrenceRegionMembers_mem _ _ _).mp member with old | ⟨source, present, edge⟩
        · exact seeds value old
        · exact closed source value (seeds source present) edge
      change ∀ value ∈ (if (expandOccurrenceRegionMembers state seed).length = seed.length
        then _ else _), target value
      split
      · exact expanded
      · exact ih _ expanded

private theorem closure_closed_or_growth
    (state : RuntimeState) (seed : List ScopeOccurrenceId) (fuel : Nat) (unique : seed.Nodup) :
    expandOccurrenceRegionMembers state (occurrenceRegionMembersWithin state seed fuel) ⊆
      occurrenceRegionMembersWithin state seed fuel ∨
    seed.length + fuel ≤ (occurrenceRegionMembersWithin state seed fuel).length := by
  induction fuel generalizing seed with
  | zero =>
      right
      exact nodup_length_le _ _ unique (occurrenceRegionMembersWithin_seed_subset _ _ 0)
  | succ fuel ih =>
      change (expandOccurrenceRegionMembers state (if (expandOccurrenceRegionMembers state seed).length =
        seed.length then _ else _) ⊆ (if (expandOccurrenceRegionMembers state seed).length = seed.length
        then _ else _)) ∨ _
      by_cases stable : (expandOccurrenceRegionMembers state seed).length = seed.length
      · have fixed : expandOccurrenceRegionMembers state seed ⊆ seed :=
          reverse_subset_of_length_eq unique (seed_subset_expand _ _) stable.symm
        exact .inl (by
          simp only [stable, ↓reduceIte]
          exact expand_mono _ _ _ fixed)
      · have growth := nodup_length_le seed (expandOccurrenceRegionMembers state seed) unique
          (seed_subset_expand _ _)
        rcases ih (expandOccurrenceRegionMembers state seed) (expand_nodup _ _) with closed | large
        · exact .inl (by simpa only [stable, ↓reduceIte] using closed)
        · right
          change seed.length + (fuel + 1) ≤
            (if (expandOccurrenceRegionMembers state seed).length = seed.length
              then expandOccurrenceRegionMembers state seed
              else occurrenceRegionMembersWithin state (expandOccurrenceRegionMembers state seed) fuel).length
          simp only [stable, ↓reduceIte]
          omega

theorem scopeOwnershipGraphExact_unique (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) :
    (state.scopeOccurrences.map (·.id)).Nodup := by
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true, decide_eq_true_eq] at valid
  exact valid.1.1

/-- The accepted graph check places every forward edge's target in its finite live universe. -/
theorem scopeOwnershipGraphExact_target_live (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (source target : ScopeOccurrenceId)
    (edge : OccurrenceRegionEdge state source target) :
    target ∈ state.scopeOccurrences.map (·.id) := by
  rcases edge with ⟨occurrence, present, _, targetEq⟩ | ⟨record, present, _, targetEq⟩
  · exact List.mem_map.mpr ⟨occurrence, present, targetEq⟩
  · simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at valid
    have checked := List.all_eq_true.mp valid.2 record present
    simp only [Bool.and_eq_true, beq_iff_eq] at checked
    obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp checked.2
    have member : occurrence ∈ state.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = record.calledRoot) && occurrence.parent.isNone) := by
      rw [singleton]
      simp
    obtain ⟨live, matched⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, decide_eq_true_eq] at matched
    exact List.mem_map.mpr ⟨occurrence, live, matched.1.trans targetEq⟩

theorem occurrenceRegionMembersWithin_live (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (seed : List ScopeOccurrenceId)
    (seeds : seed ⊆ state.scopeOccurrences.map (·.id)) (fuel : Nat) :
    occurrenceRegionMembersWithin state seed fuel ⊆ state.scopeOccurrences.map (·.id) := by
  intro value member
  exact occurrenceRegionMembersWithin_least state seed fuel
    (fun value => value ∈ state.scopeOccurrences.map (·.id)) (fun _ member => seeds member)
    (fun source target _ edge => scopeOwnershipGraphExact_target_live state valid source target edge)
    value member

private theorem saturated_of_universe (state : RuntimeState) (seed population : List ScopeOccurrenceId)
    (unique : seed.Nodup) (contained : ∀ fuel, occurrenceRegionMembersWithin state seed fuel ⊆ population) :
    expandOccurrenceRegionMembers state (occurrenceRegionMembersWithin state seed (population.length + 1)) ⊆
      occurrenceRegionMembersWithin state seed (population.length + 1) := by
  rcases closure_closed_or_growth state seed (population.length + 1) unique with closed | growth
  · exact closed
  · have bounded := nodup_length_le _ _ (occurrenceRegionMembersWithin_nodup _ _ _)
      (contained (population.length + 1))
    omega

/-- Strict growth cannot exhaust occurrence-count fuel without reaching a fixed point. -/
theorem occurrenceRegionMembersWithin_saturated (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (seed : List ScopeOccurrenceId)
    (unique : seed.Nodup) (seeds : seed ⊆ state.scopeOccurrences.map (·.id)) :
    expandOccurrenceRegionMembers state
      (occurrenceRegionMembersWithin state seed (state.scopeOccurrences.length + 1)) ⊆
      occurrenceRegionMembersWithin state seed (state.scopeOccurrences.length + 1) := by
  simpa only [List.length_map] using saturated_of_universe state seed (state.scopeOccurrences.map (·.id))
    unique (fun fuel => occurrenceRegionMembersWithin_live state valid seed seeds fuel)

theorem occurrenceRegionMembersWithin_closed (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (seed : List ScopeOccurrenceId)
    (unique : seed.Nodup) (seeds : seed ⊆ state.scopeOccurrences.map (·.id))
    (source target : ScopeOccurrenceId)
    (member : source ∈ occurrenceRegionMembersWithin state seed (state.scopeOccurrences.length + 1))
    (edge : OccurrenceRegionEdge state source target) :
    target ∈ occurrenceRegionMembersWithin state seed (state.scopeOccurrences.length + 1) :=
  occurrenceRegionMembersWithin_saturated state valid seed unique seeds
    ((expandOccurrenceRegionMembers_mem _ _ _).mpr (.inr ⟨source, member, edge⟩))

/-- Occurrence-count fuel computes exactly the least seed-containing directed edge closure. -/
theorem occurrenceRegionMembersWithin_mem_iff (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (seed : List ScopeOccurrenceId)
    (unique : seed.Nodup) (seeds : seed ⊆ state.scopeOccurrences.map (·.id)) (value : ScopeOccurrenceId) :
    value ∈ occurrenceRegionMembersWithin state seed (state.scopeOccurrences.length + 1) ↔
    ∀ target : ScopeOccurrenceId → Prop, (∀ member ∈ seed, target member) →
      (∀ source destination, target source → OccurrenceRegionEdge state source destination →
        target destination) → target value := by
  constructor
  · intro member target initial closed
    exact occurrenceRegionMembersWithin_least state seed _ target initial closed value member
  · intro least
    exact least (fun member => member ∈ occurrenceRegionMembersWithin state seed
      (state.scopeOccurrences.length + 1))
      (fun _ member => occurrenceRegionMembersWithin_seed_subset _ _ _ member)
      (fun source destination member edge =>
        occurrenceRegionMembersWithin_closed state valid seed unique seeds source destination member edge)

theorem deriveInternalOccurrenceRegion_success (state : RuntimeState) (root : ScopeOccurrenceId)
    (region : InternalOccurrenceRegion) (success : deriveInternalOccurrenceRegion? state root = some region) :
    scopeOwnershipGraphExact state = true ∧ region.root = root ∧
      root ∈ state.scopeOccurrences.map (·.id) ∧
      region.members = occurrenceRegionMembersWithin state [root] (state.scopeOccurrences.length + 1) := by
  unfold deriveInternalOccurrenceRegion? at success
  split at success
  · contradiction
  · next accepted =>
      have valid : scopeOwnershipGraphExact state = true := by simpa using accepted
      split at success
      · next occurrence singleton =>
          have present : occurrence ∈ state.scopeOccurrences.filter
              (fun candidate => decide (candidate.id = root)) := by
            rw [singleton]
            simp
          obtain ⟨live, matched⟩ := List.mem_filter.mp present
          have same : occurrence.id = root := by simpa using matched
          have regionEq := Option.some.inj success
          subst region
          exact ⟨valid, same, List.mem_map.mpr ⟨occurrence, live, same⟩, by simp only [same]⟩
      · contradiction

/-- A successful public derivation contains its live root and precisely its least directed closure. -/
theorem deriveInternalOccurrenceRegion_spec (state : RuntimeState) (root : ScopeOccurrenceId)
    (region : InternalOccurrenceRegion) (success : deriveInternalOccurrenceRegion? state root = some region) :
    region.root = root ∧ root ∈ region.members ∧ region.members.Nodup ∧
    region.members ⊆ state.scopeOccurrences.map (·.id) ∧
    (∀ source ∈ region.members, ∀ target, OccurrenceRegionEdge state source target → target ∈ region.members) ∧
    (∀ target : ScopeOccurrenceId → Prop, target root →
      (∀ source destination, target source → OccurrenceRegionEdge state source destination →
        target destination) → ∀ value ∈ region.members, target value) := by
  obtain ⟨valid, sameRoot, live, members⟩ := deriveInternalOccurrenceRegion_success state root region success
  have seeds : [root] ⊆ state.scopeOccurrences.map (·.id) := by simpa using live
  refine ⟨sameRoot, ?_, ?_, ?_, ?_, ?_⟩
  · rw [members]
    exact occurrenceRegionMembersWithin_seed_subset _ _ _ (by simp)
  · rw [members]
    exact occurrenceRegionMembersWithin_nodup _ _ _
  · rw [members]
    exact occurrenceRegionMembersWithin_live state valid [root] seeds _
  · rw [members]
    intro source present target edge
    exact occurrenceRegionMembersWithin_closed state valid [root] (by simp) seeds source target present edge
  · rw [members]
    intro target initial closed
    exact occurrenceRegionMembersWithin_least state [root] _ target (by simpa) closed

/-- Restricting the graph preserves the closure when its root and all reachable outgoing edges
survive. Each accepted graph supplies its own occurrence population and therefore its own fuel. -/
theorem occurrenceRegionMembersWithin_restrict (original retained : RuntimeState)
    (originalValid : scopeOwnershipGraphExact original = true)
    (retainedValid : scopeOwnershipGraphExact retained = true) (root : ScopeOccurrenceId)
    (originalRoot : root ∈ original.scopeOccurrences.map (·.id))
    (retainedRoot : root ∈ retained.scopeOccurrences.map (·.id))
    (included : ∀ source target, OccurrenceRegionEdge retained source target →
      OccurrenceRegionEdge original source target)
    (survives : ∀ source target,
      source ∈ occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) →
      OccurrenceRegionEdge original source target → OccurrenceRegionEdge retained source target)
    (value : ScopeOccurrenceId) :
    value ∈ occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) ↔
      value ∈ occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) := by
  have originalSeeds : [root] ⊆ original.scopeOccurrences.map (·.id) := by simpa using originalRoot
  have retainedSeeds : [root] ⊆ retained.scopeOccurrences.map (·.id) := by simpa using retainedRoot
  have subset : occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) ⊆
      occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) := by
    intro candidate member
    exact occurrenceRegionMembersWithin_least retained [root] _
      (fun value => value ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1))
      (fun _ present => occurrenceRegionMembersWithin_seed_subset _ _ _ present)
      (fun source target caller edge => occurrenceRegionMembersWithin_closed original originalValid
        [root] (by simp) originalSeeds source target caller (included source target edge)) candidate member
  constructor
  · exact fun member => subset member
  · exact occurrenceRegionMembersWithin_least original [root] _
      (fun value => value ∈ occurrenceRegionMembersWithin retained [root]
        (retained.scopeOccurrences.length + 1))
      (fun _ present => occurrenceRegionMembersWithin_seed_subset _ _ _ present)
      (fun source target caller edge => occurrenceRegionMembersWithin_closed retained retainedValid
        [root] (by simp) retainedSeeds source target caller (survives source target (subset caller) edge)) value

theorem occurrenceRegionMembersWithin_filter (original retained : RuntimeState)
    (originalValid : scopeOwnershipGraphExact original = true)
    (retainedValid : scopeOwnershipGraphExact retained = true)
    (keepScope : RuntimeScopeOccurrence → Bool) (keepCall : CalledProcessOccurrence → Bool)
    (scopes : retained.scopeOccurrences = original.scopeOccurrences.filter keepScope)
    (calls : retained.calledProcessOccurrences = original.calledProcessOccurrences.filter keepCall)
    (root : ScopeOccurrenceId) (retainedRoot : root ∈ retained.scopeOccurrences.map (·.id))
    (childrenSurvive : ∀ occurrence ∈ original.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1) → keepScope occurrence = true)
    (callsSurvive : ∀ record ∈ original.calledProcessOccurrences,
      record.caller ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1) → keepCall record = true) (value : ScopeOccurrenceId) :
    value ∈ occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) ↔
      value ∈ occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) := by
  have scopeSubset : retained.scopeOccurrences ⊆ original.scopeOccurrences := by
    rw [scopes]
    exact fun _ member => (List.mem_filter.mp member).1
  have callSubset : retained.calledProcessOccurrences ⊆ original.calledProcessOccurrences := by
    rw [calls]
    exact fun _ member => (List.mem_filter.mp member).1
  have originalRoot : root ∈ original.scopeOccurrences.map (·.id) := by
    obtain ⟨occurrence, present, same⟩ := List.mem_map.mp retainedRoot
    exact List.mem_map.mpr ⟨occurrence, scopeSubset present, same⟩
  apply occurrenceRegionMembersWithin_restrict original retained originalValid retainedValid root
    originalRoot retainedRoot
  · intro source target edge
    rcases edge with ⟨occurrence, present, parent, same⟩ | ⟨record, present, caller, same⟩
    · exact .inl ⟨occurrence, scopeSubset present, parent, same⟩
    · exact .inr ⟨record, callSubset present, caller, same⟩
  · intro source target reached edge
    rcases edge with ⟨occurrence, present, parent, same⟩ | ⟨record, present, caller, same⟩
    · have kept : occurrence ∈ retained.scopeOccurrences := by
        rw [scopes]
        exact List.mem_filter.mpr ⟨present, childrenSurvive occurrence present source parent reached⟩
      exact .inl ⟨occurrence, kept, parent, same⟩
    · have kept : record ∈ retained.calledProcessOccurrences := by
        rw [calls]
        exact List.mem_filter.mpr ⟨present, callsSurvive record present (caller ▸ reached)⟩
      exact .inr ⟨record, kept, caller, same⟩

/-- Removing a disconnected component shortens the evaluator's fuel without changing membership,
even when the retained component contains arbitrarily many alternating parent and Call edges. -/
theorem occurrenceRegionMembersWithin_disconnected (original retained : RuntimeState)
    (originalValid : scopeOwnershipGraphExact original = true)
    (retainedValid : scopeOwnershipGraphExact retained = true)
    (extraScopes : List RuntimeScopeOccurrence) (extraCalls : List CalledProcessOccurrence)
    (scopes : original.scopeOccurrences = retained.scopeOccurrences ++ extraScopes)
    (calls : original.calledProcessOccurrences = retained.calledProcessOccurrences ++ extraCalls)
    (root : ScopeOccurrenceId) (retainedRoot : root ∈ retained.scopeOccurrences.map (·.id))
    (scopeSeparated : ∀ occurrence ∈ extraScopes, ∀ parent, occurrence.parent = some parent →
      parent ∉ occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1))
    (callSeparated : ∀ record ∈ extraCalls, record.caller ∉
      occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1))
    (value : ScopeOccurrenceId) :
    value ∈ occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) ↔
      value ∈ occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) := by
  have retainedSeeds : [root] ⊆ retained.scopeOccurrences.map (·.id) := by simpa using retainedRoot
  have originalSeeds : [root] ⊆ original.scopeOccurrences.map (·.id) := by
    intro candidate present
    rw [scopes, List.map_append]
    exact List.mem_append_left _ (retainedSeeds present)
  constructor
  · exact occurrenceRegionMembersWithin_least original [root] _
      (fun value => value ∈ occurrenceRegionMembersWithin retained [root]
        (retained.scopeOccurrences.length + 1))
      (fun _ present => occurrenceRegionMembersWithin_seed_subset _ _ _ present)
      (by
        intro source target reached edge
        apply occurrenceRegionMembersWithin_closed retained retainedValid [root] (by simp) retainedSeeds
          source target reached
        rcases edge with ⟨occurrence, present, parent, same⟩ | ⟨record, present, caller, same⟩
        · rw [scopes] at present
          rcases List.mem_append.mp present with kept | detached
          · exact .inl ⟨occurrence, kept, parent, same⟩
          · exact False.elim (scopeSeparated occurrence detached source parent reached)
        · rw [calls] at present
          rcases List.mem_append.mp present with kept | detached
          · exact .inr ⟨record, kept, caller, same⟩
          · exact False.elim (callSeparated record detached (caller ▸ reached))) value
  · exact occurrenceRegionMembersWithin_least retained [root] _
      (fun value => value ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1))
      (fun _ present => occurrenceRegionMembersWithin_seed_subset _ _ _ present)
      (by
        intro source target reached edge
        apply occurrenceRegionMembersWithin_closed original originalValid [root] (by simp) originalSeeds
          source target reached
        rcases edge with ⟨occurrence, present, parent, same⟩ | ⟨record, present, caller, same⟩
        · exact .inl ⟨occurrence, by rw [scopes]; exact List.mem_append_left _ present, parent, same⟩
        · exact .inr ⟨record, by rw [calls]; exact List.mem_append_left _ present, caller, same⟩) value

/-- One expansion sees only predecessors already present in the seed. -/
theorem occurrenceRegionMembersWithin_one (state : RuntimeState) (seed : List ScopeOccurrenceId)
    (value : ScopeOccurrenceId) :
    value ∈ occurrenceRegionMembersWithin state seed 1 ↔ value ∈ seed ∨
      ∃ source ∈ seed, OccurrenceRegionEdge state source value := by
  simp only [occurrenceRegionMembersWithin]
  split <;> simp only [canonicalScopeMembers_mem, expandOccurrenceRegionMembers_mem]

/-- A mixed three-edge path reaches its final child regardless of scope or Call storage order. -/
theorem occurrenceRegionMembersWithin_mixed_path (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true) (root : ScopeOccurrenceId)
    (rootLive : root ∈ state.scopeOccurrences.map (·.id))
    (child called finalChild : RuntimeScopeOccurrence) (record : CalledProcessOccurrence)
    (childPresent : child ∈ state.scopeOccurrences) (childParent : child.parent = some root)
    (recordPresent : record ∈ state.calledProcessOccurrences) (caller : record.caller = child.id)
    (calledRoot : record.calledRoot = called.id) (finalPresent : finalChild ∈ state.scopeOccurrences)
    (finalParent : finalChild.parent = some called.id) :
    finalChild.id ∈ occurrenceRegionMembersWithin state [root] (state.scopeOccurrences.length + 1) := by
  have seeds : [root] ⊆ state.scopeOccurrences.map (·.id) := by simpa using rootLive
  have rootReached := occurrenceRegionMembersWithin_seed_subset state [root]
    (state.scopeOccurrences.length + 1) (by simp : root ∈ [root])
  have childReached := occurrenceRegionMembersWithin_closed state valid [root] (by simp) seeds root child.id
    rootReached (.inl ⟨child, childPresent, childParent, rfl⟩)
  have calledReached := occurrenceRegionMembersWithin_closed state valid [root] (by simp) seeds child.id called.id
    childReached (.inr ⟨record, recordPresent, caller, calledRoot⟩)
  exact occurrenceRegionMembersWithin_closed state valid [root] (by simp) seeds called.id finalChild.id
    calledReached (.inl ⟨finalChild, finalPresent, finalParent, rfl⟩)

/-- Reversed storage retains the mixed path; one expansion cannot skip its Call and last parent edge. -/
theorem occurrenceRegionMembersWithin_reversed_mixed_path (state : RuntimeState)
    (valid : scopeOwnershipGraphExact state = true)
    (root child called finalChild : RuntimeScopeOccurrence) (record : CalledProcessOccurrence)
    (scopes : state.scopeOccurrences = [finalChild, called, child, root])
    (calls : state.calledProcessOccurrences = [record])
    (rootParent : root.parent = none) (childParent : child.parent = some root.id)
    (calledParent : called.parent = none) (finalParent : finalChild.parent = some called.id)
    (caller : record.caller = child.id) (calledRoot : record.calledRoot = called.id)
    (childFresh : child.id ≠ root.id) (calledFresh : called.id ≠ root.id)
    (finalFresh : finalChild.id ≠ root.id) (finalDifferent : finalChild.id ≠ child.id) :
    finalChild.id ∉ occurrenceRegionMembersWithin state [root.id] 1 ∧
    finalChild.id ∈ occurrenceRegionMembersWithin state [root.id] (state.scopeOccurrences.length + 1) := by
  constructor
  · rw [occurrenceRegionMembersWithin_one]
    simp [OccurrenceRegionEdge, scopes, calls, rootParent, childParent, calledParent, finalParent,
      caller, calledRoot, childFresh, calledFresh, finalFresh, Ne.symm finalDifferent]
  · exact occurrenceRegionMembersWithin_mixed_path state valid root.id (by simp [scopes])
      child called finalChild record (by simp [scopes]) childParent (by simp [calls]) caller calledRoot
      (by simp [scopes]) finalParent

/-- A directed edge cannot recover its source from its target as a seed, for either edge family. -/
theorem occurrenceRegionMembersWithin_no_backward (state : RuntimeState)
    (source target : ScopeOccurrenceId) (different : source ≠ target)
    (edges : ∀ edgeSource edgeTarget, OccurrenceRegionEdge state edgeSource edgeTarget → edgeTarget = target)
    (fuel : Nat) :
    source ∉ occurrenceRegionMembersWithin state [target] fuel := by
  intro present
  have same := occurrenceRegionMembersWithin_least state [target] fuel (fun value => value = target)
    (by simp) (fun edgeSource edgeTarget _ edge => edges edgeSource edgeTarget edge) source present
  exact different same

theorem occurrenceRegionMembersWithin_restrict_eq (original retained : RuntimeState)
    (originalValid : scopeOwnershipGraphExact original = true)
    (retainedValid : scopeOwnershipGraphExact retained = true) (root : ScopeOccurrenceId)
    (originalRoot : root ∈ original.scopeOccurrences.map (·.id))
    (retainedRoot : root ∈ retained.scopeOccurrences.map (·.id))
    (included : ∀ source target, OccurrenceRegionEdge retained source target →
      OccurrenceRegionEdge original source target)
    (survives : ∀ source target,
      source ∈ occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) →
      OccurrenceRegionEdge original source target → OccurrenceRegionEdge retained source target) :
    occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) =
      occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) :=
  occurrenceRegionMembersWithin_eq_of_mem retained original [root] [root] _ _
    (occurrenceRegionMembersWithin_restrict original retained originalValid retainedValid root
      originalRoot retainedRoot included survives)

theorem occurrenceRegionMembersWithin_filter_eq (original retained : RuntimeState)
    (originalValid : scopeOwnershipGraphExact original = true)
    (retainedValid : scopeOwnershipGraphExact retained = true)
    (keepScope : RuntimeScopeOccurrence → Bool) (keepCall : CalledProcessOccurrence → Bool)
    (scopes : retained.scopeOccurrences = original.scopeOccurrences.filter keepScope)
    (calls : retained.calledProcessOccurrences = original.calledProcessOccurrences.filter keepCall)
    (root : ScopeOccurrenceId) (retainedRoot : root ∈ retained.scopeOccurrences.map (·.id))
    (childrenSurvive : ∀ occurrence ∈ original.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1) → keepScope occurrence = true)
    (callsSurvive : ∀ record ∈ original.calledProcessOccurrences,
      record.caller ∈ occurrenceRegionMembersWithin original [root]
        (original.scopeOccurrences.length + 1) → keepCall record = true) :
    occurrenceRegionMembersWithin retained [root] (retained.scopeOccurrences.length + 1) =
      occurrenceRegionMembersWithin original [root] (original.scopeOccurrences.length + 1) :=
  occurrenceRegionMembersWithin_eq_of_mem retained original [root] [root] _ _
    (occurrenceRegionMembersWithin_filter original retained originalValid retainedValid keepScope keepCall
      scopes calls root retainedRoot childrenSurvive callsSurvive)

/-- Successful restricted derivations have equal roots and literal canonical member lists. -/
theorem deriveInternalOccurrenceRegion_restrict_eq (original retained : RuntimeState)
    (root : ScopeOccurrenceId) (originalRegion retainedRegion : InternalOccurrenceRegion)
    (originalSuccess : deriveInternalOccurrenceRegion? original root = some originalRegion)
    (retainedSuccess : deriveInternalOccurrenceRegion? retained root = some retainedRegion)
    (included : ∀ source target, OccurrenceRegionEdge retained source target →
      OccurrenceRegionEdge original source target)
    (survives : ∀ source ∈ originalRegion.members, ∀ target,
      OccurrenceRegionEdge original source target → OccurrenceRegionEdge retained source target) :
    retainedRegion = originalRegion := by
  obtain ⟨originalValid, originalRoot, originalLive, originalMembers⟩ :=
    deriveInternalOccurrenceRegion_success original root originalRegion originalSuccess
  obtain ⟨retainedValid, retainedRoot, retainedLive, retainedMembers⟩ :=
    deriveInternalOccurrenceRegion_success retained root retainedRegion retainedSuccess
  have roots : retainedRegion.root = originalRegion.root := retainedRoot.trans originalRoot.symm
  have members : retainedRegion.members = originalRegion.members := by
    rw [retainedMembers, originalMembers]
    apply occurrenceRegionMembersWithin_restrict_eq original retained originalValid retainedValid root
      originalLive retainedLive included
    intro source target reached edge
    exact survives source (originalMembers ▸ reached) target edge
  cases originalRegion
  cases retainedRegion
  cases roots
  cases members
  rfl

/-- Filtering unrelated graph records preserves the complete derived region, including stored order. -/
theorem deriveInternalOccurrenceRegion_filter_eq (original retained : RuntimeState)
    (keepScope : RuntimeScopeOccurrence → Bool) (keepCall : CalledProcessOccurrence → Bool)
    (scopes : retained.scopeOccurrences = original.scopeOccurrences.filter keepScope)
    (calls : retained.calledProcessOccurrences = original.calledProcessOccurrences.filter keepCall)
    (root : ScopeOccurrenceId) (originalRegion retainedRegion : InternalOccurrenceRegion)
    (originalSuccess : deriveInternalOccurrenceRegion? original root = some originalRegion)
    (retainedSuccess : deriveInternalOccurrenceRegion? retained root = some retainedRegion)
    (childrenSurvive : ∀ occurrence ∈ original.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent ∈ originalRegion.members → keepScope occurrence = true)
    (callsSurvive : ∀ record ∈ original.calledProcessOccurrences,
      record.caller ∈ originalRegion.members → keepCall record = true) :
    retainedRegion = originalRegion := by
  obtain ⟨originalValid, originalRoot, _, originalMembers⟩ :=
    deriveInternalOccurrenceRegion_success original root originalRegion originalSuccess
  obtain ⟨retainedValid, retainedRoot, retainedLive, retainedMembers⟩ :=
    deriveInternalOccurrenceRegion_success retained root retainedRegion retainedSuccess
  have roots : retainedRegion.root = originalRegion.root := retainedRoot.trans originalRoot.symm
  have members : retainedRegion.members = originalRegion.members := by
    rw [retainedMembers, originalMembers]
    apply occurrenceRegionMembersWithin_filter_eq original retained originalValid retainedValid
      keepScope keepCall scopes calls root retainedLive
    · intro occurrence present parent parentEq reached
      exact childrenSurvive occurrence present parent parentEq (originalMembers ▸ reached)
    · intro record present reached
      exact callsSurvive record present (originalMembers ▸ reached)
  cases originalRegion
  cases retainedRegion
  cases roots
  cases members
  rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
