module

public import Kernel.Laws.Step.Commit

/-! # Laws of the step function: what the commit's assignment numbers (DC12, DC25)

What `Kernel.Step.assign` and `Kernel.Step.positionsOf` give, from their equations (`Laws.Step.Commit`): two issues of
one slot take different ordinals (`assign_apart`), and an occurrence's pending order position, which is its identity's
issue (`State.reserve`), is numbered on the position counter in the closure's issue order from the counter of the state
the closure started from: every occurrence issue of the table takes a committed position at or above that counter
(`occurrencePosition_renamed`), and of two occurrence issues the one the issue order meets first takes the lower one
(`positions_before`), which `Laws.Step.compaction_keepsOccurrenceOrder` composes into the order law; that walk counts
as the assignment counts the position slot (`positions_agree`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

theorem positionStep_self (acc : TreeMap Issue Nat compare × Nat) (issue : Issue) (slot : ScopeSlot) :
    (positionStep acc (issue, .occurrence slot)).1[issue]? = some acc.2 := by
  rw [positionStep_eq]; exact Std.ExtTreeMap.getElem?_insert_self

theorem positionStep_other (acc : TreeMap Issue Nat compare × Nat) (claim : Issue × ClaimSlot) {issue : Issue}
    (apart : claim.1 ≠ issue) : (positionStep acc claim).1[issue]? = acc.1[issue]? := by
  obtain ⟨other, claimed⟩ := claim
  rw [positionStep_eq]
  cases claimed with
  | occurrence _ =>
    simp only [Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same) apart
    · rfl
  | scope _ | item _ | position => rfl

/-- No step lowers the position counter. -/
theorem positionStep_counter (acc : TreeMap Issue Nat compare × Nat) (claim : Issue × ClaimSlot) :
    acc.2 ≤ (positionStep acc claim).2 := by
  obtain ⟨_, claimed⟩ := claim
  rw [positionStep_eq]
  cases claimed <;> simp

theorem positions_counter : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × Nat),
    acc.2 ≤ (claims.foldl positionStep acc).2
  | [], _ => Nat.le_refl _
  | claim :: rest, acc => Nat.le_trans (positionStep_counter acc claim) (positions_counter rest _)

/-- The fold leaves the position of an issue no claim names as it was. -/
theorem positions_value : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × Nat) (issue : Issue),
    issue ∉ claims.map (·.1) → (claims.foldl positionStep acc).1[issue]? = acc.1[issue]?
  | [], _, _, _ => rfl
  | claim :: rest, acc, issue, absent => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    rw [List.foldl_cons, positions_value rest _ issue absent.2, positionStep_other _ _ fun same => absent.1 same.symm]

/-- The fold numbers every occurrence claim it meets. -/
theorem positions_mem : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × Nat) {issue : Issue},
    (issue ∈ acc.1 ∨ ∃ slot, (issue, ClaimSlot.occurrence slot) ∈ claims) → issue ∈ (claims.foldl positionStep acc).1
  | [], _, _, held => held.elim id fun ⟨_, member⟩ => nomatch member
  | claim :: rest, acc, issue, held => by
    refine positions_mem rest _ ?_
    rcases held with held | ⟨slot, member⟩
    · refine .inl ?_
      by_cases same : claim.1 = issue
      · obtain ⟨other, claimed⟩ := claim
        cases same
        rw [positionStep_eq]
        cases claimed <;> simp [held]
      · exact Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr
          (by rw [positionStep_other _ _ same]; exact Std.ExtTreeMap.mem_iff_isSome_getElem?.mp held)
    · rcases List.mem_cons.mp member with rfl | later
      · exact .inl (Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by rw [positionStep_self]; rfl))
      · exact .inr ⟨slot, later⟩

/-- Every position the fold holds, and its counter, are at or above `low`. -/
def PositionsAbove (low : Nat) (acc : TreeMap Issue Nat compare × Nat) : Prop :=
  low ≤ acc.2 ∧ ∀ (issue : Issue) (n : Nat), acc.1[issue]? = some n → low ≤ n

theorem positions_above {low : Nat} : ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × Nat),
    PositionsAbove low acc → PositionsAbove low (claims.foldl positionStep acc)
  | [], _, above => above
  | claim :: rest, acc, above => by
    refine positions_above rest _ ⟨Nat.le_trans above.1 (positionStep_counter acc claim), fun issue n found => ?_⟩
    by_cases same : claim.1 = issue
    · obtain ⟨other, claimed⟩ := claim
      cases same
      rw [positionStep_eq] at found
      cases claimed with
      | occurrence _ =>
        simp only [Std.ExtTreeMap.getElem?_insert_self, Option.some.injEq] at found
        exact found ▸ above.1
      | scope _ | item _ | position => exact above.2 _ n found
    · rw [positionStep_other _ _ same] at found
      exact above.2 issue n found

/-- **An occurrence's issue takes an order position** at commit, at or above the position counter of the state the
closure started from. -/
theorem occurrencePosition_renamed {start : State} {log : RunLog} {s : State} {unit : UnitKey} {index : Nat}
    {slot : ScopeSlot} (tabled : s.issued[Issue.fresh unit index]? = some (.occurrence slot)) :
    ∃ n, (positionsOf schedule start log s)[Issue.fresh unit index]? = some n ∧
      commitPositioning schedule start log s (.fresh unit index) = .committed n ∧ start.nextOrder ≤ n := by
  have member := positions_mem (issueOrder schedule log s) (∅, start.nextOrder)
    (.inr ⟨slot, (issueOrder_mem (schedule := schedule) (log := log)).mpr tabled⟩)
  obtain ⟨n, found⟩ := Option.isSome_iff_exists.mp (Std.ExtTreeMap.mem_iff_isSome_getElem?.mp member)
  have above := positions_above (issueOrder schedule log s) (∅, start.nextOrder)
    ⟨Nat.le_refl _, fun _ _ found => by simp at found⟩
  have low := above.2 _ n found
  rw [← positionsOf_eq] at found
  exact ⟨n, found, by simp [commitPositioning, renameBy_fresh, found], low⟩

/-- **The position fold counts as the assignment counts the position slot**: `Step.assignStep` counts an occurrence's
issue on it, so the commit's two walks of the issue order agree, and the counter the commit advances `State.nextOrder` to
is past every occurrence position it gives. -/
theorem positions_agree {base : ClaimSlot → Nat} : ∀ (claims : List (Issue × ClaimSlot))
    (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) (positions : TreeMap Issue Nat compare × Nat),
    positions.2 = acc.2.getD .position (base .position) →
      (claims.foldl positionStep positions).2 = (claims.foldl (assignStep base) acc).2.getD .position (base .position)
  | [], _, _, same => same
  | claim :: rest, acc, positions, same => by
    refine positions_agree rest _ _ ?_
    obtain ⟨_, claimed⟩ := claim
    rw [assignStep_position, positionStep_eq]
    cases claimed <;> simp [same]

/-- Two occurrence claims take increasing positions in the order the fold meets them, when no later claim repeats
either issue. -/
theorem positions_before (pre mid post : List (Issue × ClaimSlot)) (first second : Issue) (one two : ScopeSlot)
    (acc : TreeMap Issue Nat compare × Nat) (firstOut : first ∉ (mid ++ (second, .occurrence two) :: post).map (·.1))
    (secondOut : second ∉ post.map (·.1)) {n m : Nat}
    (atFirst : ((pre ++ (first, .occurrence one) :: (mid ++ (second, .occurrence two) :: post)).foldl positionStep acc).1[first]? = some n)
    (atSecond : ((pre ++ (first, .occurrence one) :: (mid ++ (second, .occurrence two) :: post)).foldl positionStep acc).1[second]? = some m) :
    n < m := by
  simp only [List.map_append, List.map_cons, List.mem_append, List.mem_cons, not_or] at firstOut
  obtain ⟨notMid, apart, notPost⟩ := firstOut
  rw [List.foldl_append, List.foldl_cons, List.foldl_append, List.foldl_cons] at atFirst atSecond
  rw [positions_value post _ first notPost, positionStep_other _ _ fun same => apart same.symm,
    positions_value mid _ first notMid, positionStep_self] at atFirst
  rw [positions_value post _ second secondOut, positionStep_self] at atSecond
  obtain rfl := Option.some.inj atFirst
  obtain rfl := Option.some.inj atSecond
  refine Nat.lt_of_lt_of_le ?_ (positions_counter mid _)
  rw [positionStep_eq]
  exact Nat.lt_succ_self _

/-- What the fold keeps of the claims it processed: each took an ordinal below its slot's next ordinal, and two of one
slot took different ordinals. -/
structure Apart (processed : List (Issue × ClaimSlot))
    (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) : Prop where
  took : ∀ c ∈ processed, ∃ n m, acc.1[c.1]? = some n ∧ acc.2[c.2]? = some m ∧ n < m
  apart : ∀ c ∈ processed, ∀ d ∈ processed, c.2 = d.2 → acc.1[c.1]? = acc.1[d.1]? → c.1 = d.1

theorem Apart.step {base : ClaimSlot → Nat} {processed : List (Issue × ClaimSlot)}
    {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare} (kept : Apart processed acc)
    {claim : Issue × ClaimSlot} (fresh : claim.1 ∉ processed.map (·.1)) :
    Apart (processed ++ [claim]) (assignStep base acc claim) := by
  have issueApart : ∀ c ∈ processed, c.1 ≠ claim.1 := fun c member same =>
    fresh (same ▸ List.mem_map_of_mem (f := (·.1)) member)
  have oldIssue : ∀ c ∈ processed, (assignStep base acc claim).1[c.1]? = acc.1[c.1]? := fun c member => by
    rw [assignStep_fst, Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm (issueApart c member)
    · rfl
  have newIssue : (assignStep base acc claim).1[claim.1]? = some (acc.2.getD claim.2 (base claim.2)) := by
    rw [assignStep_fst]; exact Std.ExtTreeMap.getElem?_insert_self
  -- An old claim of the new claim's slot took an ordinal below the slot's next ordinal, which the new claim takes.
  have below : ∀ c ∈ processed, c.2 = claim.2 → ∀ n, acc.1[c.1]? = some n → n < acc.2.getD claim.2 (base claim.2) := by
    intro c member slot n held
    obtain ⟨n', m, parts⟩ := kept.took c member
    obtain ⟨held', next, lt⟩ := parts
    rw [held] at held'
    cases held'
    rw [Std.ExtTreeMap.getD_eq_getD_getElem?, ← slot, next]
    exact lt
  refine ⟨fun c member => ?_, fun c cm d dm slot same => ?_⟩
  · rcases List.mem_append.mp member with old | new
    · obtain ⟨n, m, parts⟩ := kept.took c old
      obtain ⟨held, next, lt⟩ := parts
      obtain ⟨m', next', raised⟩ := assignStep_raises (base := base) claim next
      exact ⟨n, m', by rw [oldIssue c old]; exact held, next', Nat.lt_of_lt_of_le lt raised⟩
    · rw [List.mem_singleton.mp new]
      exact ⟨_, _, newIssue, assignStep_claim base acc claim, Nat.lt_succ_self _⟩
  · rcases List.mem_append.mp cm with cold | cnew <;> rcases List.mem_append.mp dm with dold | dnew
    · rw [oldIssue c cold, oldIssue d dold] at same
      exact kept.apart c cold d dold slot same
    · rw [List.mem_singleton.mp dnew] at slot same ⊢
      rw [oldIssue c cold, newIssue] at same
      exact absurd (below c cold slot _ same) (Nat.lt_irrefl _)
    · rw [List.mem_singleton.mp cnew] at slot same ⊢
      rw [oldIssue d dold, newIssue] at same
      exact absurd (below d dold slot.symm _ same.symm) (Nat.lt_irrefl _)
    · rw [List.mem_singleton.mp cnew, List.mem_singleton.mp dnew]

theorem fold_apart {base : ClaimSlot → Nat} :
    ∀ (claims processed : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      ((processed ++ claims).map (·.1)).Nodup → Apart processed acc →
      Apart (processed ++ claims) (claims.foldl (assignStep base) acc)
  | [], processed, acc, _, kept => by simpa using kept
  | claim :: rest, processed, acc, distinct, kept => by
    have fresh : claim.1 ∉ processed.map (·.1) := by
      rw [List.map_append, List.map_cons] at distinct
      exact fun member => (List.nodup_append.mp distinct).2.2 _ member _ List.mem_cons_self rfl
    have next := fold_apart (base := base) rest (processed ++ [claim]) _
      (by simpa using distinct) (kept.step (base := base) fresh)
    simpa using next

/-- **Two entries of one slot take different ordinals.** -/
theorem assign_apart {start : State} {log : RunLog} {state : State} {first second : Issue} {slot : ClaimSlot}
    (one : state.issued[first]? = some slot) (two : state.issued[second]? = some slot)
    (same : (assign schedule start log state).1[first]? = (assign schedule start log state).1[second]?) : first = second := by
  have kept := fold_apart (base := slotBase start) (issueOrder schedule log state) [] (∅, ∅)
    (by simpa using issueOrder_nodup schedule log state) ⟨fun _ member => (nomatch member), fun _ member => (nomatch member)⟩
  rw [assign_eq] at same
  exact kept.apart (first, slot) (by simpa using issueOrder_mem.mpr one) (second, slot)
    (by simpa using issueOrder_mem.mpr two) rfl same

end Kernel.Laws.Step
