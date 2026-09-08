import BpmnSemantics.SemanticProcess.ControlPositionMultiplicity

/-! Exact public deltas retain positive multiplicities in canonical key order, as required by
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

private theorem tokenMultiplicityAt_cons (current target : PublicControlTokenPosition)
    (rest : List PublicControlTokenPosition) :
    tokenMultiplicityAt (current :: rest) target =
      if sameTokenPosition target current then current.multiplicity
      else tokenMultiplicityAt rest target := by
  cases matched : sameTokenPosition target current <;>
    simp [tokenMultiplicityAt, matched]

private theorem tokenMultiplicityAt_zero_of_different
    (positions : List PublicControlTokenPosition) (target : PublicControlTokenPosition)
    (different : ∀ position ∈ positions, sameTokenPosition target position = false) :
    tokenMultiplicityAt positions target = 0 := by
  induction positions with
  | nil => rfl
  | cons current rest ih =>
      rw [tokenMultiplicityAt_cons, different current (by simp)]
      exact ih (fun position member => different position (by simp [member]))

private theorem tokenPositionBefore_key_ne (left right : PublicControlTokenPosition)
    (before : tokenPositionBefore left right = true) :
    tokenPositionKey left ≠ tokenPositionKey right := by
  intro same
  rw [tokenPositionBefore_key_congr left left right left rfl same.symm] at before
  have impossible := tokenPositionBefore_asymm left left before
  rw [impossible] at before
  contradiction

private theorem tokenMultiplicityAt_tail_zero (current target : PublicControlTokenPosition)
    (rest : List PublicControlTokenPosition)
    (before : ∀ position ∈ rest, tokenPositionBefore current position = true)
    (same : tokenPositionKey target = tokenPositionKey current) :
    tokenMultiplicityAt rest target = 0 := by
  apply tokenMultiplicityAt_zero_of_different
  intro position member
  apply Bool.eq_false_iff.mpr
  intro matched
  exact tokenPositionBefore_key_ne current position (before position member)
    (same.symm.trans ((sameTokenPosition_iff_key_eq target position).mp matched))

private theorem tokenDifference_cons (current : PublicControlTokenPosition)
    (rest right : List PublicControlTokenPosition) :
    tokenDifference (current :: rest) right =
      if current.multiplicity - tokenMultiplicityAt right current = 0 then
        tokenDifference rest right
      else { current with multiplicity :=
        current.multiplicity - tokenMultiplicityAt right current } :: tokenDifference rest right := by
  by_cases removed : current.multiplicity - tokenMultiplicityAt right current = 0 <;>
    simp [tokenDifference, removed]

private theorem tokenDifference_mem (left right : List PublicControlTokenPosition)
    (position : PublicControlTokenPosition) (member : position ∈ tokenDifference left right) :
    ∃ original ∈ left, tokenPositionKey position = tokenPositionKey original ∧
      position.multiplicity = original.multiplicity - tokenMultiplicityAt right original ∧
      0 < position.multiplicity := by
  induction left with
  | nil => simp [tokenDifference] at member
  | cons current rest ih =>
      rw [tokenDifference_cons] at member
      split at member
      · obtain ⟨original, originalMember, facts⟩ := ih member
        exact ⟨original, by simp [originalMember], facts⟩
      · rename_i positive
        rcases List.mem_cons.mp member with rfl | member
        · exact ⟨current, by simp, rfl, rfl, by simpa using Nat.pos_of_ne_zero positive⟩
        · obtain ⟨original, originalMember, facts⟩ := ih member
          exact ⟨original, by simp [originalMember], facts⟩

theorem tokenPositionsStrict_difference (left right : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict left) : tokenPositionsStrict (tokenDifference left right) := by
  induction left with
  | nil => trivial
  | cons current rest ih =>
      rw [tokenDifference_cons]
      split
      · exact ih strict.2
      · refine ⟨?_, ih strict.2⟩
        intro position member
        obtain ⟨original, originalMember, same, _⟩ := tokenDifference_mem rest right position member
        exact (tokenPositionBefore_key_congr _ current position original rfl same).trans
          (strict.1 original originalMember)

theorem tokenDifference_positive (left right : List PublicControlTokenPosition)
    (position : PublicControlTokenPosition) (member : position ∈ tokenDifference left right) :
    0 < position.multiplicity := by
  obtain ⟨_, _, _, _, positive⟩ := tokenDifference_mem left right position member
  exact positive

theorem tokenMultiplicityAt_difference (left right : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) (strict : tokenPositionsStrict left) :
    tokenMultiplicityAt (tokenDifference left right) target =
      tokenMultiplicityAt left target - tokenMultiplicityAt right target := by
  induction left with
  | nil => simp [tokenDifference, tokenMultiplicityAt]
  | cons current rest ih =>
      have tail := ih strict.2
      rw [tokenDifference_cons, tokenMultiplicityAt_cons]
      by_cases matched : sameTokenPosition target current = true
      · have same := (sameTokenPosition_iff_key_eq target current).mp matched
        have rightSame := tokenMultiplicityAt_key_congr right target current same
        have zero := tokenMultiplicityAt_tail_zero current target rest strict.1 same
        have differenceZero : tokenMultiplicityAt (tokenDifference rest right) target = 0 := by
          rw [tail, zero]
          exact Nat.zero_sub _
        simp only [matched, if_true]
        split
        · rename_i removed
          rw [differenceZero, rightSame, removed]
        · rw [tokenMultiplicityAt_cons]
          have updated : sameTokenPosition target
              { current with multiplicity := current.multiplicity - tokenMultiplicityAt right current } =
              sameTokenPosition target current := rfl
          simp only [updated, matched, if_true, rightSame]
      · have notMatched : sameTokenPosition target current = false := Bool.eq_false_iff.mpr matched
        simp only [notMatched, Bool.false_eq_true, if_false]
        split
        · exact tail
        · rw [tokenMultiplicityAt_cons]
          have updated : sameTokenPosition target
              { current with multiplicity := current.multiplicity - tokenMultiplicityAt right current } =
              sameTokenPosition target current := rfl
          simpa only [updated, notMatched, Bool.false_eq_true, if_false] using tail

private theorem tokenMultiplicityAt_positive_member (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) (positive : 0 < tokenMultiplicityAt positions target) :
    ∃ position ∈ positions, tokenPositionKey target = tokenPositionKey position := by
  induction positions with
  | nil => simp [tokenMultiplicityAt] at positive
  | cons current rest ih =>
      rw [tokenMultiplicityAt_cons] at positive
      split at positive
      · rename_i matched
        exact ⟨current, by simp, (sameTokenPosition_iff_key_eq target current).mp matched⟩
      · obtain ⟨position, member, same⟩ := ih positive
        exact ⟨position, by simp [member], same⟩

private theorem tokenPositions_heads_key_eq (leftHead rightHead : PublicControlTokenPosition)
    (leftTail rightTail : List PublicControlTokenPosition)
    (leftStrict : tokenPositionsStrict (leftHead :: leftTail))
    (rightStrict : tokenPositionsStrict (rightHead :: rightTail))
    (leftPositive : 0 < leftHead.multiplicity) (rightPositive : 0 < rightHead.multiplicity)
    (counts : ∀ target, tokenMultiplicityAt (leftHead :: leftTail) target =
      tokenMultiplicityAt (rightHead :: rightTail) target) :
    tokenPositionKey leftHead = tokenPositionKey rightHead := by
  by_cases same : tokenPositionKey leftHead = tokenPositionKey rightHead
  · exact same
  exfalso
  have leftLookup : 0 < tokenMultiplicityAt (rightHead :: rightTail) leftHead := by
    rw [← counts, tokenMultiplicityAt_of_mem _ _ leftStrict (by simp)]
    exact leftPositive
  have rightLookup : 0 < tokenMultiplicityAt (leftHead :: leftTail) rightHead := by
    rw [counts, tokenMultiplicityAt_of_mem _ _ rightStrict (by simp)]
    exact rightPositive
  obtain ⟨leftMatch, leftMember, leftKey⟩ :=
    tokenMultiplicityAt_positive_member _ _ leftLookup
  obtain ⟨rightMatch, rightMember, rightKey⟩ :=
    tokenMultiplicityAt_positive_member _ _ rightLookup
  have leftInTail : leftMatch ∈ rightTail := by
    rcases List.mem_cons.mp leftMember with rfl | member
    · exact False.elim (same leftKey)
    · exact member
  have rightInTail : rightMatch ∈ leftTail := by
    rcases List.mem_cons.mp rightMember with rfl | member
    · exact False.elim (same rightKey.symm)
    · exact member
  have leftBefore : tokenPositionBefore leftHead rightHead = true :=
    (tokenPositionBefore_key_congr leftHead leftHead rightHead rightMatch rfl rightKey).trans
      (leftStrict.1 rightMatch rightInTail)
  have rightBefore : tokenPositionBefore rightHead leftHead = true :=
    (tokenPositionBefore_key_congr rightHead rightHead leftHead leftMatch rfl leftKey).trans
      (rightStrict.1 leftMatch leftInTail)
  rw [tokenPositionBefore_asymm _ _ leftBefore] at rightBefore
  contradiction

theorem tokenPositions_eq_of_multiplicities (left right : List PublicControlTokenPosition)
    (leftStrict : tokenPositionsStrict left) (rightStrict : tokenPositionsStrict right)
    (leftPositive : ∀ position ∈ left, 0 < position.multiplicity)
    (rightPositive : ∀ position ∈ right, 0 < position.multiplicity)
    (counts : ∀ target, tokenMultiplicityAt left target = tokenMultiplicityAt right target) :
    left = right := by
  induction left generalizing right with
  | nil =>
      cases right with
      | nil => rfl
      | cons current rest =>
          have zero := counts current
          rw [tokenMultiplicityAt_of_mem _ _ rightStrict (by simp)] at zero
          have positive := rightPositive current (by simp)
          simp only [tokenMultiplicityAt, List.find?_nil] at zero
          omega
  | cons current rest ih =>
      cases right with
      | nil =>
          have zero := counts current
          rw [tokenMultiplicityAt_of_mem _ _ leftStrict (by simp)] at zero
          have positive := leftPositive current (by simp)
          simp only [tokenMultiplicityAt, List.find?_nil] at zero
          omega
      | cons other tail =>
          have same := tokenPositions_heads_key_eq current other rest tail leftStrict rightStrict
            (leftPositive current (by simp)) (rightPositive other (by simp)) counts
          have magnitude : current.multiplicity = other.multiplicity := by
            have lookup := counts current
            rw [tokenMultiplicityAt_of_mem _ _ leftStrict (by simp),
              tokenMultiplicityAt_key_congr _ current other same,
              tokenMultiplicityAt_of_mem _ _ rightStrict (by simp)] at lookup
            exact lookup
          have headEq : current = other := by
            cases current; cases other
            simp only [tokenPositionKey, Prod.mk.injEq] at same
            simp_all
          subst other
          congr 1
          apply ih tail leftStrict.2 rightStrict.2
            (fun position member => leftPositive position (by simp [member]))
            (fun position member => rightPositive position (by simp [member]))
          intro target
          by_cases matched : sameTokenPosition target current = true
          · have key := (sameTokenPosition_iff_key_eq target current).mp matched
            rw [tokenMultiplicityAt_tail_zero current target rest leftStrict.1 key,
              tokenMultiplicityAt_tail_zero current target tail rightStrict.1 key]
          · have lookup := counts target
            simpa [tokenMultiplicityAt_cons, matched] using lookup

theorem tokenPositions_zero_multiplicity_counterexample (position : PublicControlTokenPosition) :
    ([] : List PublicControlTokenPosition) ≠ [{ position with multiplicity := 0 }] ∧
      ∀ target, tokenMultiplicityAt [] target =
        tokenMultiplicityAt [{ position with multiplicity := 0 }] target := by
  refine ⟨by simp, ?_⟩
  intro target
  rw [tokenMultiplicityAt_cons]
  split <;> rfl

theorem tokenPositions_order_counterexample (left right : PublicControlTokenPosition)
    (different : tokenPositionKey left ≠ tokenPositionKey right) :
    [left, right] ≠ [right, left] ∧
      ∀ target, tokenMultiplicityAt [left, right] target =
        tokenMultiplicityAt [right, left] target := by
  refine ⟨?_, ?_⟩
  · intro equal
    exact different (congrArg tokenPositionKey (List.cons.inj equal).1)
  · intro target
    by_cases leftMatch : sameTokenPosition target left = true
    · have rightMiss : sameTokenPosition target right = false := by
        apply Bool.eq_false_iff.mpr
        intro rightMatch
        exact different (((sameTokenPosition_iff_key_eq target left).mp leftMatch).symm.trans
          ((sameTokenPosition_iff_key_eq target right).mp rightMatch))
      simp [tokenMultiplicityAt_cons, leftMatch, rightMiss]
    · simp [tokenMultiplicityAt_cons, leftMatch]

end BpmnSemantics.SemanticProcess
