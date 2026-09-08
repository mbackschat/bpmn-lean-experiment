import BpmnSemantics.SemanticProcess.ControlPosition

/-! Public token multiplicity counts private token units, as required by the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

private def positionMass (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) : Nat :=
  (positions.map fun position =>
    if sameTokenPosition target position then position.multiplicity else 0).sum

theorem sameTokenPosition_key_congr (target left right : PublicControlTokenPosition)
    (same : tokenPositionKey left = tokenPositionKey right) :
    sameTokenPosition target left = sameTokenPosition target right := by
  apply Bool.eq_iff_iff.mpr
  rw [sameTokenPosition_iff_key_eq, sameTokenPosition_iff_key_eq, same]

private theorem positionMass_cons (current target : PublicControlTokenPosition)
    (rest : List PublicControlTokenPosition) :
    positionMass (current :: rest) target =
      (if sameTokenPosition target current then current.multiplicity else 0) +
        positionMass rest target := by
  simp [positionMass]

private theorem positionMass_insert (position target : PublicControlTokenPosition)
    (positions : List PublicControlTokenPosition) :
    positionMass (insertTokenPosition position positions) target =
      positionMass positions target +
        (if sameTokenPosition target position then position.multiplicity else 0) := by
  induction positions with
  | nil => simp [insertTokenPosition, positionMass]
  | cons current rest ih =>
      by_cases same : sameTokenPosition position current = true
      · have key := (sameTokenPosition_iff_key_eq position current).mp same
        have matching := sameTokenPosition_key_congr target position current key
        have updated : sameTokenPosition target
            { current with multiplicity := current.multiplicity + position.multiplicity } =
            sameTokenPosition target current := rfl
        simp only [insertTokenPosition, same, if_true, positionMass_cons, updated, matching]
        split <;> omega
      · by_cases before : tokenPositionBefore position current = true
        · simp [insertTokenPosition, same, before, positionMass_cons]
          omega
        · simp [insertTokenPosition, same, before, positionMass_cons, ih]
          omega

private theorem positionMass_zero (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition)
    (different : ∀ position ∈ positions, sameTokenPosition target position = false) :
    positionMass positions target = 0 := by
  induction positions with
  | nil => rfl
  | cons current rest ih =>
      rw [positionMass_cons, different current (by simp)]
      simpa using ih (fun position member => different position (by simp [member]))

private theorem tokenMultiplicityAt_eq_mass (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) (strict : tokenPositionsStrict positions) :
    tokenMultiplicityAt positions target = positionMass positions target := by
  induction positions with
  | nil => rfl
  | cons current rest ih =>
      obtain ⟨before, strictRest⟩ := strict
      by_cases matched : sameTokenPosition target current = true
      · have tailZero : positionMass rest target = 0 := by
          apply positionMass_zero
          intro candidate member
          apply Bool.eq_false_iff.mpr
          intro candidateMatched
          have sameKey := ((sameTokenPosition_iff_key_eq target current).mp matched).symm.trans
            ((sameTokenPosition_iff_key_eq target candidate).mp candidateMatched)
          have ordered := before candidate member
          rw [tokenPositionBefore_key_congr current current candidate current rfl sameKey.symm] at ordered
          have impossible := tokenPositionBefore_asymm current current ordered
          rw [impossible] at ordered
          contradiction
        simp [tokenMultiplicityAt, matched, positionMass_cons, tailZero]
      · simpa [tokenMultiplicityAt, matched, positionMass_cons] using ih strictRest

theorem tokenMultiplicityAt_key_congr (positions : List PublicControlTokenPosition)
    (left right : PublicControlTokenPosition)
    (same : tokenPositionKey left = tokenPositionKey right) :
    tokenMultiplicityAt positions left = tokenMultiplicityAt positions right := by
  have predicates : sameTokenPosition left = sameTokenPosition right := by
    funext position
    apply Bool.eq_iff_iff.mpr
    rw [sameTokenPosition_iff_key_eq, sameTokenPosition_iff_key_eq, same]
  simp only [tokenMultiplicityAt, predicates]

theorem tokenMultiplicityAt_insert (positions : List PublicControlTokenPosition)
    (position target : PublicControlTokenPosition) (strict : tokenPositionsStrict positions) :
    tokenMultiplicityAt (insertTokenPosition position positions) target =
      tokenMultiplicityAt positions target +
        (if sameTokenPosition target position then position.multiplicity else 0) := by
  rw [tokenMultiplicityAt_eq_mass _ _ (tokenPositionsStrict_insert position positions strict),
    positionMass_insert, tokenMultiplicityAt_eq_mass _ _ strict]

/-- Every projected multiplicity counts token units sharing the complete public key; repeated
units remain visible even when their dependency footprint contains one bucket. -/
theorem projectTokens_multiplicity (program : Program) (tokens : List ControlToken)
    (target : PublicControlTokenPosition) :
    tokenMultiplicityAt (projectTokens program tokens) target =
      tokens.countP (fun token => sameTokenPosition target
        { sequenceFlowId := tokenOrigin program token, owner := token.owner, multiplicity := 1 }) := by
  rw [tokenMultiplicityAt_eq_mass _ _ (projectTokens_strict program tokens)]
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      simp only [projectTokens, positionMass_insert, ih, List.countP_cons]

theorem projectTokens_repeated_unit (program : Program) (token : ControlToken) :
    tokenMultiplicityAt (projectTokens program [token, token])
      { sequenceFlowId := tokenOrigin program token, owner := token.owner, multiplicity := 1 } = 2 := by
  simp [projectTokens_multiplicity, sameTokenPosition]

end BpmnSemantics.SemanticProcess
