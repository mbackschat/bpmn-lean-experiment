import BpmnSemantics.SemanticProcess.ControlPosition

/-! # Exact internal control-position delta proofs

This proof leaf derives the one-token public position delta of a prepared ordinary internal arm from the existing canonical private-to-public projection. It changes neither the projection nor transition semantics.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

private theorem tokenDifference_self (positions : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict positions) : tokenDifference positions positions = [] := by
  unfold tokenDifference
  apply List.filterMap_eq_nil_iff.mpr
  intro position member
  rw [tokenMultiplicityAt_of_mem positions position strict member]
  simp

private theorem tokenDifference_of_subset (left right : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict right) (subset : ∀ position ∈ left, position ∈ right) :
    tokenDifference left right = [] := by
  unfold tokenDifference
  apply List.filterMap_eq_nil_iff.mpr
  intro position member
  rw [tokenMultiplicityAt_of_mem right position strict (subset position member)]
  simp

private theorem tokenMultiplicityAt_eq_zero_of_different
    (positions : List PublicControlTokenPosition) (target : PublicControlTokenPosition)
    (different : ∀ position ∈ positions, sameTokenPosition target position = false) :
    tokenMultiplicityAt positions target = 0 := by
  induction positions with
  | nil => rfl
  | cons current rest ih =>
      simp only [tokenMultiplicityAt, List.find?_cons, different current (by simp)]
      exact ih (fun candidate member => different candidate (by simp [member]))

private theorem tokenDifference_cons (position : PublicControlTokenPosition)
    (rest right : List PublicControlTokenPosition) :
    tokenDifference (position :: rest) right =
      let multiplicity := position.multiplicity - tokenMultiplicityAt right position
      if multiplicity = 0 then tokenDifference rest right
      else { position with multiplicity } :: tokenDifference rest right := by
  by_cases zero : position.multiplicity - tokenMultiplicityAt right position = 0
  · simp [tokenDifference, zero]
  · simp [tokenDifference, zero]

private theorem tokenDifference_right_cons_frame (left right : List PublicControlTokenPosition)
    (current : PublicControlTokenPosition)
    (different : ∀ position ∈ left, sameTokenPosition position current = false) :
    tokenDifference left (current :: right) = tokenDifference left right := by
  induction left with
  | nil => rfl
  | cons position rest ih =>
      have head : tokenMultiplicityAt (current :: right) position =
          tokenMultiplicityAt right position := by
        simp [tokenMultiplicityAt, different position (by simp)]
      rw [tokenDifference_cons, tokenDifference_cons, head,
        ih (fun candidate member => different candidate (by simp [member]))]

private theorem insertTokenPosition_commutes_same (left right : PublicControlTokenPosition)
    (same : sameTokenPosition left right = true) : ∀ positions,
    insertTokenPosition left (insertTokenPosition right positions) =
      insertTokenPosition right (insertTokenPosition left positions) := by
  intro positions
  have keyEq := (sameTokenPosition_iff_key_eq left right).mp same
  cases left with | mk flow owner leftMultiplicity =>
  cases right with | mk rightFlow rightOwner rightMultiplicity =>
  simp only [tokenPositionKey, Prod.mk.injEq] at keyEq
  rcases keyEq with ⟨rfl, rfl⟩
  induction positions with
  | nil => simp [insertTokenPosition, sameTokenPosition, Nat.add_comm]
  | cons current rest ih =>
      have sameCurrent : sameTokenPosition
          { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current =
          sameTokenPosition
            { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current := rfl
      have beforeCurrent : tokenPositionBefore
          { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current =
          tokenPositionBefore
            { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current := rfl
      by_cases currentSame : sameTokenPosition
          { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current = true
      · have currentKey := (sameTokenPosition_iff_key_eq _ _).mp currentSame
        cases current with | mk currentFlow currentOwner currentMultiplicity =>
          simp only [tokenPositionKey, Prod.mk.injEq] at currentKey
          rcases currentKey with ⟨rfl, rfl⟩
          simp [insertTokenPosition, sameTokenPosition, Nat.add_left_comm,
            Nat.add_comm]
      · by_cases before : tokenPositionBefore
          { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current = true
        · have leftCurrentFalse : sameTokenPosition
              { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current = false :=
            Bool.eq_false_iff.mpr currentSame
          have rightCurrentFalse : sameTokenPosition
              { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current = false := by
            rw [← sameCurrent]
            exact leftCurrentFalse
          have rightBefore : tokenPositionBefore
              { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current = true := by
            rw [← beforeCurrent]
            exact before
          have keyDifferent : ¬(flow = current.sequenceFlowId ∧ owner = current.owner) := by
            intro keySame
            apply currentSame
            simp [sameTokenPosition, keySame]
          simp [insertTokenPosition, keyDifferent, before, rightBefore, sameTokenPosition,
            Nat.add_comm]
        · have leftCurrentFalse : sameTokenPosition
              { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current = false :=
            Bool.eq_false_iff.mpr currentSame
          have rightCurrentFalse : sameTokenPosition
              { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current = false := by
            rw [← sameCurrent]
            exact leftCurrentFalse
          have leftBeforeFalse : tokenPositionBefore
              { sequenceFlowId := flow, owner, multiplicity := leftMultiplicity } current = false :=
            Bool.eq_false_iff.mpr before
          have rightBeforeFalse : tokenPositionBefore
              { sequenceFlowId := flow, owner, multiplicity := rightMultiplicity } current = false := by
            rw [← beforeCurrent]
            exact leftBeforeFalse
          have keyDifferent : ¬(flow = current.sequenceFlowId ∧ owner = current.owner) := by
            intro keySame
            apply currentSame
            simp [sameTokenPosition, keySame]
          simp [insertTokenPosition, leftCurrentFalse, rightCurrentFalse, leftBeforeFalse,
            rightBeforeFalse, ih]

private theorem sameTokenPosition_false_of_key_ne (left right : PublicControlTokenPosition)
    (different : tokenPositionKey left ≠ tokenPositionKey right) :
    sameTokenPosition left right = false :=
  Bool.eq_false_iff.mpr fun same => different ((sameTokenPosition_iff_key_eq left right).mp same)

private theorem insertTokenPosition_commutes_distinct (left right : PublicControlTokenPosition)
    (different : tokenPositionKey left ≠ tokenPositionKey right) : ∀ positions,
    insertTokenPosition left (insertTokenPosition right positions) =
      insertTokenPosition right (insertTokenPosition left positions) := by
  intro positions
  have leftRightFalse := sameTokenPosition_false_of_key_ne left right different
  have rightLeftFalse := sameTokenPosition_false_of_key_ne right left (Ne.symm different)
  have comparable := tokenPositionBefore_comparable_of_key_ne left right different
  induction positions with
  | nil =>
      rcases comparable with leftBefore | rightBefore
      · have rightNotBefore := tokenPositionBefore_asymm left right leftBefore
        simp [insertTokenPosition, leftRightFalse, rightLeftFalse, leftBefore, rightNotBefore]
      · have leftNotBefore := tokenPositionBefore_asymm right left rightBefore
        simp [insertTokenPosition, leftRightFalse, rightLeftFalse, leftNotBefore, rightBefore]
  | cons current rest ih =>
      by_cases leftSame : sameTokenPosition left current = true
      · have leftKey := (sameTokenPosition_iff_key_eq left current).mp leftSame
        have rightCurrentDifferent : tokenPositionKey right ≠ tokenPositionKey current :=
          fun equal => different (leftKey.trans equal.symm)
        have rightSame := sameTokenPosition_false_of_key_ne right current rightCurrentDifferent
        by_cases rightBefore : tokenPositionBefore right current = true
        · have rightBeforeLeft :=
            (tokenPositionBefore_key_congr right right current left rfl leftKey.symm).symm.trans
              rightBefore
          have leftNotBeforeRight := tokenPositionBefore_asymm right left rightBeforeLeft
          have rightMergedSame : sameTokenPosition right
              { current with multiplicity := current.multiplicity + left.multiplicity } = false := by
            simpa [sameTokenPosition] using rightSame
          have rightBeforeMerged : tokenPositionBefore right
              { current with multiplicity := current.multiplicity + left.multiplicity } = true := by
            simpa [tokenPositionBefore] using rightBefore
          simp [insertTokenPosition, leftSame, rightSame, leftRightFalse, rightBefore,
            leftNotBeforeRight, rightMergedSame, rightBeforeMerged]
        · have currentBeforeRight :=
            (tokenPositionBefore_comparable_of_key_ne right current rightCurrentDifferent).resolve_left
              rightBefore
          have rightBeforeMerged : tokenPositionBefore right
              { current with multiplicity := current.multiplicity + left.multiplicity } = false := by
            exact Bool.eq_false_iff.mpr rightBefore
          have rightMergedSame : sameTokenPosition right
              { current with multiplicity := current.multiplicity + left.multiplicity } = false := by
            simpa [sameTokenPosition] using rightSame
          simp [insertTokenPosition, leftSame, rightSame, rightBefore, rightBeforeMerged,
            rightMergedSame]
      · by_cases rightSame : sameTokenPosition right current = true
        · have rightKey := (sameTokenPosition_iff_key_eq right current).mp rightSame
          have leftCurrentDifferent : tokenPositionKey left ≠ tokenPositionKey current :=
            fun equal => different (equal.trans rightKey.symm)
          have leftSameFalse := sameTokenPosition_false_of_key_ne left current leftCurrentDifferent
          by_cases leftBefore : tokenPositionBefore left current = true
          · have leftBeforeRight :=
              (tokenPositionBefore_key_congr left left current right rfl rightKey.symm).symm.trans
                leftBefore
            have rightNotBeforeLeft := tokenPositionBefore_asymm left right leftBeforeRight
            have leftMergedSame : sameTokenPosition left
                { current with multiplicity := current.multiplicity + right.multiplicity } = false := by
              simpa [sameTokenPosition] using leftSameFalse
            have leftBeforeMerged : tokenPositionBefore left
                { current with multiplicity := current.multiplicity + right.multiplicity } = true := by
              simpa [tokenPositionBefore] using leftBefore
            simp [insertTokenPosition, leftSameFalse, rightSame, rightLeftFalse, leftBefore,
              rightNotBeforeLeft, leftMergedSame, leftBeforeMerged]
          · have currentBeforeLeft :=
              (tokenPositionBefore_comparable_of_key_ne left current leftCurrentDifferent).resolve_left
                leftBefore
            have leftBeforeMerged : tokenPositionBefore left
                { current with multiplicity := current.multiplicity + right.multiplicity } = false := by
              exact Bool.eq_false_iff.mpr leftBefore
            have leftMergedSame : sameTokenPosition left
                { current with multiplicity := current.multiplicity + right.multiplicity } = false := by
              simpa [sameTokenPosition] using leftSameFalse
            simp [insertTokenPosition, leftSameFalse, rightSame, leftBefore, leftBeforeMerged,
              leftMergedSame]
        · have leftSameFalse : sameTokenPosition left current = false :=
            Bool.eq_false_iff.mpr leftSame
          have rightSameFalse : sameTokenPosition right current = false :=
            Bool.eq_false_iff.mpr rightSame
          by_cases leftBefore : tokenPositionBefore left current = true
          · by_cases rightBefore : tokenPositionBefore right current = true
            · rcases comparable with leftBeforeRight | rightBeforeLeft
              · have rightNotBeforeLeft := tokenPositionBefore_asymm left right leftBeforeRight
                simp [insertTokenPosition, leftSameFalse, rightSameFalse, leftRightFalse,
                  rightLeftFalse, leftBefore, rightBefore, leftBeforeRight, rightNotBeforeLeft]
              · have leftNotBeforeRight := tokenPositionBefore_asymm right left rightBeforeLeft
                simp [insertTokenPosition, leftSameFalse, rightSameFalse, leftRightFalse,
                  rightLeftFalse, leftBefore, rightBefore, leftNotBeforeRight, rightBeforeLeft]
            · have rightNotBeforeLeft : tokenPositionBefore right left = false := by
                apply Bool.eq_false_iff.mpr
                intro rightBeforeLeft
                exact rightBefore (tokenPositionBefore_trans right left current rightBeforeLeft leftBefore)
              simp [insertTokenPosition, leftSameFalse, rightSameFalse, rightLeftFalse,
                leftBefore, rightBefore, rightNotBeforeLeft]
          · by_cases rightBefore : tokenPositionBefore right current = true
            · have leftNotBeforeRight : tokenPositionBefore left right = false := by
                apply Bool.eq_false_iff.mpr
                intro leftBeforeRight
                exact leftBefore (tokenPositionBefore_trans left right current leftBeforeRight rightBefore)
              simp [insertTokenPosition, leftSameFalse, rightSameFalse, leftRightFalse,
                leftBefore, rightBefore, leftNotBeforeRight]
            · simp [insertTokenPosition, leftSameFalse, rightSameFalse, leftBefore, rightBefore, ih]

private theorem insertTokenPosition_commutes (left right : PublicControlTokenPosition)
    (positions : List PublicControlTokenPosition) :
    insertTokenPosition left (insertTokenPosition right positions) =
      insertTokenPosition right (insertTokenPosition left positions) := by
  by_cases same : sameTokenPosition left right = true
  · exact insertTokenPosition_commutes_same left right same positions
  · exact insertTokenPosition_commutes_distinct left right
      (fun equal => same ((sameTokenPosition_iff_key_eq left right).mpr equal)) positions

private theorem onlyTokenOwner_has_selected_token (state : RuntimeState)
    (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (selected : onlyTokenOwner? state input = some owner) :
    ∃ token ∈ state.tokens, token.placeId = input ∧ token.owner = owner := by
  cases ownersEq : tokenOwners state input with
  | nil => simp [onlyTokenOwner?, ownersEq] at selected
  | cons first rest =>
      have firstEq : first = owner := by
        simp only [onlyTokenOwner?, ownersEq] at selected
        split at selected <;> simp_all
      subst first
      have ownerMember : owner ∈ tokenOwners state input := by rw [ownersEq]; simp
      unfold tokenOwners at ownerMember
      obtain ⟨token, filteredMember, tokenOwner⟩ := List.mem_map.mp ownerMember
      have parts := List.mem_filter.mp filteredMember
      refine ⟨token, parts.1, ?_, tokenOwner⟩
      simpa using parts.2

private theorem projectTokens_removeToken_insert (program : Program)
    (tokens : List ControlToken) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (present : ∃ token ∈ tokens, token.placeId = input ∧ token.owner = owner) :
    projectTokens program tokens =
      insertTokenPosition
        { sequenceFlowId := tokenOrigin program { placeId := input, owner }
          owner
          multiplicity := 1 }
        (projectTokens program (removeToken tokens input owner)) := by
  induction tokens with
  | nil => simp at present
  | cons current rest ih =>
      by_cases selected : current.placeId = input ∧ current.owner = owner
      · simp [projectTokens, removeToken, selected, tokenOrigin]
      · have tailPresent : ∃ token ∈ rest, token.placeId = input ∧ token.owner = owner := by
          obtain ⟨token, member, place, tokenOwner⟩ := present
          rcases List.mem_cons.mp member with rfl | member
          · exact False.elim (selected ⟨place, tokenOwner⟩)
          · exact ⟨token, member, place, tokenOwner⟩
        simp only [projectTokens, removeToken]
        have conditionFalse : (current.placeId = input && current.owner = owner) = false := by
          apply Bool.eq_false_iff.mpr
          intro condition
          simp only [Bool.and_eq_true, decide_eq_true_eq] at condition
          exact selected condition
        rw [conditionFalse]
        rw [ih tailPresent]
        exact insertTokenPosition_commutes _ _ _

private theorem selectedInputOrigin_tokenOrigin (program : Program) (input : ControlPlaceId)
    (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin) (place : ControlPlace)
    (unique : uniqueControlPlace? program input = some place)
    (selected : selectedInputOrigin? program input owner = some origin) :
    tokenOrigin program { placeId := input, owner } = origin.elementId := by
  unfold uniqueControlPlace? at unique
  unfold selectedInputOrigin? at selected
  generalize placesEq : (program.controlPlaces.filter fun place => decide (place.id = input)) =
    places at unique selected
  cases places with
  | nil => simp at unique
  | cons first rest =>
      cases rest with
      | nil =>
          simp only [Option.bind_eq_bind] at selected
          split at selected <;> simp_all
          split at unique <;> simp_all [tokenOrigin, uniqueControlPlace?]
      | cons second tail => simp at unique

private theorem scopeDifference_self (positions : List PublicScopePosition) :
    scopeDifference positions positions = [] := by
  unfold scopeDifference
  apply List.filter_eq_nil_iff.mpr
  intro position member accepted
  have anyTrue : positions.any (fun candidate => candidate == position) = true := by
    rw [List.any_eq_true]
    exact ⟨position, member, by simp⟩
  rw [anyTrue] at accepted
  contradiction

private theorem prepared_input_origin (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    selectedInputOrigin? program patch.input patch.owner = some patch.inputOrigin := by
  cases operation
  case awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
    simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared
    · simp at prepared
    · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
      rename_i instanceId selection
      cases filteredEq : state.variables.process.bindings.filter fun candidate =>
          candidate.name = processPropertySelector.propertyId with
      | nil => simp_all
      | cons binding rest =>
        cases rest with
        | cons _ _ => simp_all
        | nil =>
          cases valueEq : binding.value with
          | string value =>
            by_cases empty : value.isEmpty = true
            · simp_all
            · simp_all
              obtain ⟨_, _, _, _, patchEq⟩ := prepared
              simp_all
          | boolean _ => simp_all
          | integer _ => simp_all
          | stringList _ => simp_all
          | null => simp_all
  all_goals simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  all_goals
    obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    split at prepared <;> try simp at prepared
  all_goals
    obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
  all_goals
    obtain ⟨_, _, _, patchEq⟩ := prepared
    simp_all

private theorem tokenDifference_insert_one (position : PublicControlTokenPosition)
    (one : position.multiplicity = 1) (positions : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict positions) :
    tokenDifference (insertTokenPosition position positions) positions = [position] ∧
      tokenDifference positions (insertTokenPosition position positions) = [] := by
  induction positions with
  | nil =>
      cases position
      simp_all [insertTokenPosition, tokenDifference, tokenMultiplicityAt, sameTokenPosition]
  | cons current rest ih =>
      obtain ⟨currentBefore, restStrict⟩ := strict
      by_cases same : sameTokenPosition position current = true
      · have keyEq := (sameTokenPosition_iff_key_eq position current).mp same
        have positionEq : position = { current with multiplicity := 1 } := by
          cases position; cases current
          simp [tokenPositionKey] at keyEq one ⊢
          exact ⟨keyEq.1, keyEq.2, one⟩
        rw [positionEq]
        have insertEq : insertTokenPosition { current with multiplicity := 1 }
            (current :: rest) =
            { current with multiplicity := current.multiplicity + 1 } :: rest := by
          simp [insertTokenPosition, sameTokenPosition]
        rw [insertEq]
        have updatedStrict : tokenPositionsStrict
            ({ current with multiplicity := current.multiplicity + 1 } :: rest) := by
          rw [← insertEq]
          exact tokenPositionsStrict_insert _ _ ⟨currentBefore, restStrict⟩
        constructor
        · rw [tokenDifference_cons]
          have lookup : tokenMultiplicityAt (current :: rest)
              { current with multiplicity := current.multiplicity + 1 } =
              current.multiplicity := by
            simp [tokenMultiplicityAt, sameTokenPosition]
          rw [lookup, tokenDifference_of_subset rest (current :: rest)
            ⟨currentBefore, restStrict⟩ (by simp +contextual)]
          simp
        · rw [tokenDifference_cons]
          have lookup : tokenMultiplicityAt
              ({ current with multiplicity := current.multiplicity + 1 } :: rest) current =
              current.multiplicity + 1 := by
            simp [tokenMultiplicityAt, sameTokenPosition]
          rw [lookup, tokenDifference_of_subset rest
            ({ current with multiplicity := current.multiplicity + 1 } :: rest)
            updatedStrict (by simp +contextual)]
          simp
      · have positionDifferent : sameTokenPosition position current = false :=
          Bool.eq_false_iff.mpr same
        by_cases before : tokenPositionBefore position current = true
        · have beforeAll : ∀ candidate ∈ current :: rest,
              tokenPositionBefore position candidate = true := by
            intro candidate member
            rcases List.mem_cons.mp member with rfl | member
            · exact before
            · exact tokenPositionBefore_trans position current candidate before
                (currentBefore candidate member)
          have differentAll : ∀ candidate ∈ current :: rest,
              sameTokenPosition position candidate = false := by
            intro candidate member
            apply Bool.eq_false_iff.mpr
            intro candidateSame
            have candidateKey := (sameTokenPosition_iff_key_eq position candidate).mp candidateSame
            have ordered := beforeAll candidate member
            rw [tokenPositionBefore_key_congr position position candidate position rfl
              candidateKey.symm] at ordered
            have impossible := tokenPositionBefore_asymm position position ordered
            rw [impossible] at ordered
            contradiction
          have insertEq : insertTokenPosition position (current :: rest) =
              position :: current :: rest := by simp [insertTokenPosition, same, before]
          have strictAll : tokenPositionsStrict (current :: rest) :=
            ⟨currentBefore, restStrict⟩
          have insertedStrict := tokenPositionsStrict_insert position (current :: rest) strictAll
          rw [insertEq] at insertedStrict
          rw [insertEq]
          constructor
          · rw [tokenDifference_cons]
            rw [tokenMultiplicityAt_eq_zero_of_different _ position differentAll, one]
            rw [tokenDifference_self _ strictAll]
            cases position
            simp_all
          · exact tokenDifference_of_subset _ _
              insertedStrict (by simp +contextual)
        · have keyDifferent : tokenPositionKey position ≠ tokenPositionKey current :=
            fun equal => same ((sameTokenPosition_iff_key_eq position current).mpr equal)
          have currentBeforePosition :=
            (tokenPositionBefore_comparable_of_key_ne position current keyDifferent).resolve_left before
          have currentBeforeInserted : ∀ candidate ∈ insertTokenPosition position rest,
              tokenPositionBefore current candidate = true := by
            intro candidate member
            rcases (tokenPositionKey_mem_insert (tokenPositionKey candidate) position rest).mp
                (List.mem_map.mpr ⟨candidate, member, rfl⟩) with candidateKey | existingKey
            · exact Eq.trans (tokenPositionBefore_key_congr current current candidate position rfl
                candidateKey) currentBeforePosition
            · obtain ⟨existing, existingMember, existingKey⟩ := List.mem_map.mp existingKey
              exact Eq.trans (tokenPositionBefore_key_congr current current candidate existing rfl
                existingKey.symm) (currentBefore existing existingMember)
          have insertedDifferent : ∀ candidate ∈ insertTokenPosition position rest,
              sameTokenPosition candidate current = false := by
            intro candidate member
            apply Bool.eq_false_iff.mpr
            intro candidateSame
            have candidateKey := (sameTokenPosition_iff_key_eq candidate current).mp candidateSame
            have ordered := currentBeforeInserted candidate member
            rw [tokenPositionBefore_key_congr current current candidate current rfl candidateKey] at ordered
            have impossible := tokenPositionBefore_asymm current current ordered
            rw [impossible] at ordered
            contradiction
          have restDifferent : ∀ candidate ∈ rest,
              sameTokenPosition candidate current = false := by
            intro candidate member
            apply Bool.eq_false_iff.mpr
            intro candidateSame
            have candidateKey := (sameTokenPosition_iff_key_eq candidate current).mp candidateSame
            have ordered := currentBefore candidate member
            rw [tokenPositionBefore_key_congr current current candidate current rfl candidateKey] at ordered
            have impossible := tokenPositionBefore_asymm current current ordered
            rw [impossible] at ordered
            contradiction
          have insertEq : insertTokenPosition position (current :: rest) =
              current :: insertTokenPosition position rest := by
            simp [insertTokenPosition, same, before]
          rw [insertEq]
          constructor
          · rw [tokenDifference_cons]
            rw [tokenMultiplicityAt_of_mem (current :: rest) current
              ⟨currentBefore, restStrict⟩ (by simp)]
            simp only [Nat.sub_self, if_true]
            rw [tokenDifference_right_cons_frame _ rest current insertedDifferent]
            exact (ih restStrict).1
          · rw [tokenDifference_cons]
            rw [tokenMultiplicityAt_of_mem (current :: insertTokenPosition position rest) current
              ⟨currentBeforeInserted, tokenPositionsStrict_insert _ _ restStrict⟩ (by simp)]
            simp only [Nat.sub_self, if_true]
            rw [tokenDifference_right_cons_frame _ _ current restDifferent]
            exact (ih restStrict).2

/-- One prepared ordinary internal arm publishes exactly one consumed Sequence Flow token. -/
theorem controlPositionDelta_prepared_internal_arm (program : Program)
    (expectedInstanceId : SemanticId) (state : RuntimeState) (operation : SemanticOperation)
    (patch : InternalArmingPatch)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    controlPositionDelta? program expectedInstanceId state
        (applyInternalArmingPatch state patch) =
      some
        { consumedTokens :=
            [PublicControlTokenPosition.mk patch.inputOrigin.elementId patch.owner 1]
          producedTokens := []
          enteredScopes := []
          exitedScopes := [] } := by
  have selected := prepared_owner_lookup program state operation patch prepared
  have present := onlyTokenOwner_has_selected_token state patch.input patch.owner selected
  obtain ⟨token, tokenMember, placeEq, ownerEq⟩ := present
  obtain ⟨place, unique⟩ := runtimePositionValid_token_uniqueControlPlace program
    expectedInstanceId state token position tokenMember
  have originSelected := prepared_input_origin program state operation patch prepared
  have originEq : tokenOrigin program { placeId := patch.input, owner := patch.owner } =
      patch.inputOrigin.elementId := by
    cases token with | mk tokenPlace tokenOwner =>
      simp only at placeEq ownerEq unique tokenMember
      subst tokenPlace
      subst tokenOwner
      exact selectedInputOrigin_tokenOrigin program patch.input patch.owner patch.inputOrigin
        place unique originSelected
  have projectionEq := projectTokens_removeToken_insert program state.tokens patch.input patch.owner
    (onlyTokenOwner_has_selected_token state patch.input patch.owner selected)
  rw [originEq] at projectionEq
  let consumed : PublicControlTokenPosition :=
    { sequenceFlowId := patch.inputOrigin.elementId, owner := patch.owner, multiplicity := 1 }
  have differences := tokenDifference_insert_one consumed rfl
    (projectTokens program (removeToken state.tokens patch.input patch.owner))
    (projectTokens_strict program _)
  have afterPosition := applyInternalArmingPatch_preserves_runtimePosition program
    expectedInstanceId state patch position selected
  have tokensEq : (applyInternalArmingPatch state patch).tokens =
      removeToken state.tokens patch.input patch.owner := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
  have scopesEq : (applyInternalArmingPatch state patch).scopeOccurrences =
      state.scopeOccurrences := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl
  unfold controlPositionDelta?
  simp only [projectControlPosition?, position, afterPosition, if_true]
  simp only [tokensEq, scopesEq]
  rw [projectionEq]
  dsimp [consumed] at differences
  simp [differences.1, differences.2, scopeDifference_self]

end InternalCommutation

end BpmnSemantics.SemanticProcess
