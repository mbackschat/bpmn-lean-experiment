import BpmnSemantics.SemanticProcess.ControlPositionDifferenceAlgebra
import BpmnSemantics.SemanticProcess.ScopePositionInsertion
import BpmnSemantics.SemanticProcess.TokenStorage

/-! Regional position removal preserves complete public keys, token multiplicity, and order.
Projection and difference laws operate on owner predicates rather than enumerated fixtures.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem insertTokenPosition_before_all (position : PublicControlTokenPosition)
    (positions : List PublicControlTokenPosition)
    (before : ∀ current ∈ positions, tokenPositionBefore position current = true) :
    insertTokenPosition position positions = position :: positions := by
  cases positions with
  | nil => rfl
  | cons current rest =>
      have ordered := before current (by simp)
      have different : sameTokenPosition position current = false := by
        apply Bool.eq_false_iff.mpr
        intro same
        have key := (sameTokenPosition_iff_key_eq position current).mp same
        rw [tokenPositionBefore_key_congr position position current position rfl key.symm] at ordered
        have opposite := tokenPositionBefore_asymm position position ordered
        rw [opposite] at ordered
        contradiction
      simp [insertTokenPosition, different, ordered]

theorem filter_insertTokenPosition_by_owner (keep : ScopeOccurrenceId → Bool)
    (position : PublicControlTokenPosition) (positions : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict positions) :
    (insertTokenPosition position positions).filter (fun entry => keep entry.owner) =
      if keep position.owner then insertTokenPosition position (positions.filter fun entry => keep entry.owner)
      else positions.filter (fun entry => keep entry.owner) := by
  induction positions with
  | nil => cases retained : keep position.owner <;> simp [insertTokenPosition, retained]
  | cons current rest ih =>
      by_cases same : sameTokenPosition position current = true
      · have owner : position.owner = current.owner :=
          congrArg Prod.snd ((sameTokenPosition_iff_key_eq position current).mp same)
        cases retained : keep current.owner <;>
          simp [insertTokenPosition, same, owner, retained]
      · cases before : tokenPositionBefore position current <;>
          cases currentKept : keep current.owner <;> cases positionKept : keep position.owner <;>
          simp [insertTokenPosition, same, before, currentKept, positionKept, ih strict.2]
        exact (insertTokenPosition_before_all position _ (fun candidate member =>
          tokenPositionBefore_trans position current candidate before
            (strict.1 candidate (List.mem_filter.mp member).1))).symm

theorem projectTokens_filter_by_owner (program : Program) (tokens : List ControlToken)
    (keep : ScopeOccurrenceId → Bool) :
    projectTokens program (tokens.filter fun token => keep token.owner) =
      (projectTokens program tokens).filter fun position => keep position.owner := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      rw [projectTokens, filter_insertTokenPosition_by_owner keep _ _ (projectTokens_strict program rest)]
      cases retained : keep token.owner <;> simp [retained, projectTokens, ih]

theorem tokenMultiplicityAt_filter_by_owner (positions : List PublicControlTokenPosition)
    (keep : ScopeOccurrenceId → Bool) (target : PublicControlTokenPosition) :
    tokenMultiplicityAt (positions.filter fun position => keep position.owner) target =
      if keep target.owner then tokenMultiplicityAt positions target else 0 := by
  induction positions with
  | nil => simp [tokenMultiplicityAt]
  | cons current rest ih =>
      by_cases same : sameTokenPosition target current = true
      · have owner : target.owner = current.owner :=
          congrArg Prod.snd ((sameTokenPosition_iff_key_eq target current).mp same)
        cases retained : keep current.owner <;>
          simp [tokenMultiplicityAt, same, owner, retained] at ih ⊢
        exact ih
      · cases currentKept : keep current.owner <;> cases targetKept : keep target.owner <;>
          simp [tokenMultiplicityAt, same, currentKept, targetKept] at ih ⊢ <;> exact ih

private theorem insertTokenPosition_positive (inserted : PublicControlTokenPosition)
    (positions : List PublicControlTokenPosition) (positive : 0 < inserted.multiplicity)
    (prior : ∀ position ∈ positions, 0 < position.multiplicity) :
    ∀ position ∈ insertTokenPosition inserted positions, 0 < position.multiplicity := by
  induction positions with
  | nil => simpa [insertTokenPosition] using positive
  | cons current rest ih =>
      have tail := ih (fun position member => prior position (by simp [member]))
      unfold insertTokenPosition
      split
      · intro position member
        rcases List.mem_cons.mp member with rfl | member
        · simp only
          omega
        · exact prior position (by simp [member])
      · split
        · intro position member
          rcases List.mem_cons.mp member with rfl | member
          · exact positive
          · exact prior position member
        · intro position member
          rcases List.mem_cons.mp member with rfl | member
          · exact prior position (by simp)
          · exact tail position member

theorem projectTokens_positive (program : Program) (tokens : List ControlToken) :
    ∀ position ∈ projectTokens program tokens, 0 < position.multiplicity := by
  induction tokens with
  | nil => simp [projectTokens]
  | cons token rest ih => exact insertTokenPosition_positive _ _ (Nat.zero_lt_succ 0) ih

theorem tokenDifference_retained_by_owner (positions : List PublicControlTokenPosition)
    (keep : ScopeOccurrenceId → Bool) (strict : tokenPositionsStrict positions)
    (positive : ∀ position ∈ positions, 0 < position.multiplicity) :
    tokenDifference positions (positions.filter fun position => keep position.owner) =
      positions.filter (fun position => !(keep position.owner)) := by
  let difference := fun position : PublicControlTokenPosition =>
    let multiplicity := position.multiplicity -
      tokenMultiplicityAt (positions.filter fun position => keep position.owner) position
    if multiplicity = 0 then none else some { position with multiplicity }
  have pointwise : ∀ position ∈ positions,
      difference position = if keep position.owner then none else some position := by
    intro position member
    have count := tokenMultiplicityAt_of_mem positions position strict member
    have magnitude := positive position member
    dsimp only [difference]
    rw [tokenMultiplicityAt_filter_by_owner, count]
    cases retained : keep position.owner <;> simp [Nat.ne_of_gt magnitude]
  have filtered : ∀ values : List PublicControlTokenPosition,
      (∀ position ∈ values, difference position = if keep position.owner then none else some position) →
      values.filterMap difference = values.filter (fun position => !(keep position.owner)) := by
    intro values agrees
    induction values with
    | nil => rfl
    | cons current rest ih =>
        have tail := ih (fun position member => agrees position (by simp [member]))
        have head := agrees current (by simp)
        cases retained : keep current.owner <;> simp [head, retained, tail]
  exact filtered positions pointwise

theorem tokenDifference_retained_has_no_production (positions : List PublicControlTokenPosition)
    (keep : ScopeOccurrenceId → Bool) (strict : tokenPositionsStrict positions) :
    tokenDifference (positions.filter fun position => keep position.owner) positions = [] := by
  apply List.filterMap_eq_nil_iff.mpr
  intro position member
  have count := tokenMultiplicityAt_of_mem positions position strict (List.mem_filter.mp member).1
  simp [count]

/-- Regional deletion removes complete token buckets, retaining each bucket's full multiplicity. -/
theorem projectTokens_filter_differences (program : Program) (tokens : List ControlToken)
    (keep : ScopeOccurrenceId → Bool) :
    tokenDifference (projectTokens program tokens)
        (projectTokens program (tokens.filter fun token => keep token.owner)) =
      (projectTokens program tokens).filter (fun position => !(keep position.owner)) ∧
    tokenDifference (projectTokens program (tokens.filter fun token => keep token.owner))
        (projectTokens program tokens) = [] := by
  rw [projectTokens_filter_by_owner]
  exact ⟨tokenDifference_retained_by_owner _ keep (projectTokens_strict program tokens) (projectTokens_positive program tokens),
    tokenDifference_retained_has_no_production _ keep (projectTokens_strict program tokens)⟩

theorem regionalTokenRemoval_counts_repeated_units (program : Program) (token : ControlToken)
    (keep : ScopeOccurrenceId → Bool) (removed : keep token.owner = false) :
    tokenMultiplicityAt
      (tokenDifference (projectTokens program [token, token])
        (projectTokens program ([token, token].filter fun candidate => keep candidate.owner)))
      { sequenceFlowId := tokenOrigin program token, owner := token.owner, multiplicity := 1 } = 2 := by
  rw [tokenMultiplicityAt_difference _ _ _ (projectTokens_strict program _), projectTokens_repeated_unit]
  simp [removed, projectTokens, tokenMultiplicityAt]

theorem tokenPositionsStrict_filter (positions : List PublicControlTokenPosition)
    (keep : PublicControlTokenPosition → Bool) (strict : tokenPositionsStrict positions) :
    tokenPositionsStrict (positions.filter keep) := by
  induction positions with
  | nil => trivial
  | cons current rest ih =>
      cases retained : keep current <;> simp only [List.filter_cons, retained, ↓reduceIte]
      · exact ih strict.2
      · exact ⟨fun candidate member => strict.1 candidate (List.mem_filter.mp member).1, ih strict.2⟩

/-- A continuation outside the removed region increments its full output bucket, even when
that bucket already contains tokens; the delta publishes only the added multiplicity. -/
theorem regionalTokenRemoval_continuation_differences (positions : List PublicControlTokenPosition)
    (keep : ScopeOccurrenceId → Bool) (output : PublicControlTokenPosition)
    (strict : tokenPositionsStrict positions)
    (positive : ∀ position ∈ positions, 0 < position.multiplicity)
    (outputPositive : 0 < output.multiplicity) (retained : keep output.owner = true) :
    tokenDifference positions (insertTokenPosition output (positions.filter fun position => keep position.owner)) =
      positions.filter (fun position => !(keep position.owner)) ∧
    tokenDifference (insertTokenPosition output (positions.filter fun position => keep position.owner)) positions = [output] := by
  have retainedStrict := tokenPositionsStrict_filter positions (fun position => keep position.owner) strict
  have afterStrict := tokenPositionsStrict_insert output _ retainedStrict
  have matchingRetained : ∀ target, sameTokenPosition target output = true → keep target.owner = true := by
    intro target matched
    have owner := congrArg Prod.snd ((sameTokenPosition_iff_key_eq target output).mp matched)
    change target.owner = output.owner at owner
    simpa only [owner] using retained
  constructor
  · apply tokenPositions_eq_of_multiplicities
      _ _ (tokenPositionsStrict_difference _ _ strict)
      (tokenPositionsStrict_filter positions (fun position => !(keep position.owner)) strict)
      (tokenDifference_positive _ _)
      (fun position member => positive position (List.mem_filter.mp member).1)
    intro target
    rw [tokenMultiplicityAt_difference _ _ _ strict,
      tokenMultiplicityAt_insert _ _ _ retainedStrict, tokenMultiplicityAt_filter_by_owner,
      tokenMultiplicityAt_filter_by_owner positions (fun owner => !(keep owner)) target]
    cases kept : keep target.owner <;> cases matched : sameTokenPosition target output <;>
      simp only [Bool.not_false, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
    · simp
    · have impossible := matchingRetained target matched
      simp [kept] at impossible
    · simp
    · omega
  · apply tokenPositions_eq_of_multiplicities _ _ (tokenPositionsStrict_difference _ _ afterStrict)
      (by simp [tokenPositionsStrict]) (tokenDifference_positive _ _)
      (by intro position member; simpa using List.mem_singleton.mp member ▸ outputPositive)
    intro target
    rw [tokenMultiplicityAt_difference _ _ _ afterStrict,
      tokenMultiplicityAt_insert _ _ _ retainedStrict, tokenMultiplicityAt_filter_by_owner]
    cases kept : keep target.owner <;> cases matched : sameTokenPosition target output <;>
      simp [matched, tokenMultiplicityAt]
    have impossible := matchingRetained target matched
    simp [kept] at impossible

theorem projectTokens_perm_eq (program : Program) (left right : List ControlToken)
    (permutation : left.Perm right) : projectTokens program left = projectTokens program right := by
  apply tokenPositions_eq_of_multiplicities _ _ (projectTokens_strict program left) (projectTokens_strict program right)
    (projectTokens_positive program left) (projectTokens_positive program right)
  intro target
  rw [projectTokens_multiplicity, projectTokens_multiplicity]
  exact permutation.countP_eq _

theorem projectTokens_addToken (program : Program) (tokens : List ControlToken)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) :
    projectTokens program (addToken tokens place owner) =
      insertTokenPosition { sequenceFlowId := tokenOrigin program { placeId := place, owner }, owner, multiplicity := 1 }
        (projectTokens program tokens) := by
  rw [projectTokens_perm_eq program _ _ (addToken_perm tokens place owner)]
  rfl

/-- The evaluator's canonical token insertion has the same deletion-plus-continuation delta,
including a continuation whose public output bucket already has positive multiplicity. -/
theorem projectTokens_regional_continuation_differences (program : Program) (tokens : List ControlToken)
    (keep : ScopeOccurrenceId → Bool) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (retained : keep owner = true) :
    tokenDifference (projectTokens program tokens)
        (projectTokens program (addToken (tokens.filter fun token => keep token.owner) place owner)) =
      (projectTokens program tokens).filter (fun position => !(keep position.owner)) ∧
    tokenDifference (projectTokens program (addToken (tokens.filter fun token => keep token.owner) place owner))
        (projectTokens program tokens) =
      [{ sequenceFlowId := tokenOrigin program { placeId := place, owner }, owner, multiplicity := 1 }] := by
  rw [projectTokens_addToken, projectTokens_filter_by_owner]
  exact regionalTokenRemoval_continuation_differences _ keep _ (projectTokens_strict program tokens)
    (projectTokens_positive program tokens) (Nat.zero_lt_succ 0) retained

end BpmnSemantics.SemanticProcess.InternalCommutation
